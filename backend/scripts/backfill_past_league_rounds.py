"""One-time backfill: add per-round winner + placements to past_leagues.

Re-runs the same per-round computation used by _build_past_league_snapshot
(copied verbatim from backend/main.py below) over every snapshot already in
past_leagues and writes back enriched rounds[] entries. Self-contained: needs
only motor + python-dotenv, not the full FastAPI app stack.

Usage:
  python backend/scripts/backfill_past_league_rounds.py --dry-run
  python backend/scripts/backfill_past_league_rounds.py --apply

Idempotent: snapshots whose rounds[] already carry winner are skipped.
"""

import argparse
import asyncio
import os
import sys
from pathlib import Path
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent


# Copied verbatim from backend/main.py at backfill time.
# If you change the canonical helper there, update this copy too.
def _compute_round_results(
    round_doc: dict,
    subs: list[dict],
    votes: list[dict],
    user_lookup: dict[str, str],
) -> dict:
    """Compute per-round points, winner, and placements for one round.

    Inputs:
      round_doc: the round document (used for forfeit_missing_voter_pools flag).
      subs: full submission documents for this round (need song + user_id + id).
      votes: vote documents for this round (need voter_id + rankings).
      user_lookup: user_id -> username, used to populate winner.username.

    Returns a dict shaped:
      {
        "points": {sub_id: int},
        "winner": {"user_id", "username", "song", "total_points"} or None,
        "placements": {user_id: int_rank},  # competition ranking (1,2,2,4)
      }
    """
    if not subs:
        return {"points": {}, "winner": None, "placements": {}}

    num_subs = len(subs)
    num_to_rank = max(0, num_subs - 1)
    points: dict[str, int] = {s["id"]: 0 for s in subs}
    submitter_ids = {s["id"]: s["user_id"] for s in subs}
    voters_who_voted: set[str] = set()
    for v in votes:
        voters_who_voted.add(v.get("voter_id"))
        for idx, sid in enumerate(v.get("rankings", [])):
            pts = num_to_rank - idx
            if sid in points:
                points[sid] += pts
    # See _finalize_round_lifetime: only pre-flag rounds still get the
    # redistribute-missing-voter treatment. New rounds forfeit the pool.
    if not round_doc.get("forfeit_missing_voter_pools"):
        submitter_user_ids = set(submitter_ids.values())
        non_voters = submitter_user_ids - voters_who_voted
        if non_voters and num_subs > 1:
            total_pts_per_voter = sum(range(1, num_to_rank + 1))
            for nv_id in non_voters:
                nv_sub_id = next((s["id"] for s in subs if s["user_id"] == nv_id), None)
                others = [s["id"] for s in subs if s["id"] != nv_sub_id]
                num_other = len(others)
                if num_other > 0:
                    per = total_pts_per_voter // num_other
                    rem = total_pts_per_voter % num_other
                    for sid in others:
                        points[sid] += per
                    for i in range(rem):
                        points[others[i]] += 1
    max_pts = max(points.values()) if points else 0

    # Standard competition ranking (1, 2, 2, 4) keyed by user_id. Sort by
    # (-points, user_id) for deterministic tiebreak.
    sorted_subs = sorted(
        subs,
        key=lambda s: (-points.get(s["id"], 0), s["user_id"]),
    )
    placements: dict[str, int] = {}
    rank = 0
    last_p: Optional[int] = None
    for idx, s in enumerate(sorted_subs):
        p = points.get(s["id"], 0)
        if p != last_p:
            rank = idx + 1
            last_p = p
        placements[s["user_id"]] = rank

    winner_entry = None
    if max_pts > 0:
        winning_sub = next(
            (s for s in subs if points.get(s["id"], 0) == max_pts),
            None,
        )
        if winning_sub is not None:
            w_uid = winning_sub["user_id"]
            winner_entry = {
                "user_id": w_uid,
                "username": user_lookup.get(w_uid, ""),
                "song": winning_sub.get("song"),
                "total_points": max_pts,
            }

    return {
        "points": points,
        "winner": winner_entry,
        "placements": placements,
    }


def _all_rounds_already_have_winner(rounds: list) -> bool:
    if not rounds:
        return True
    return all("winner" in (r or {}) for r in rounds)


async def _build_user_lookup(db, snapshot: dict, user_ids_needed: set) -> dict:
    """user_id -> username, merging snapshot.members and a db.users fallback."""
    lookup: dict[str, str] = {}
    for m in snapshot.get("members") or []:
        uid = m.get("user_id") or m.get("id")
        if uid and m.get("username"):
            lookup[uid] = m["username"]
    for s in snapshot.get("standings") or []:
        uid = s.get("user_id")
        if uid and s.get("username") and uid not in lookup:
            lookup[uid] = s["username"]
    missing = [uid for uid in user_ids_needed if uid not in lookup]
    if missing:
        users = await db.users.find(
            {"id": {"$in": missing}},
            {"_id": 0, "id": 1, "username": 1},
        ).to_list(len(missing))
        for u in users:
            if u.get("id") and u.get("username"):
                lookup[u["id"]] = u["username"]
    return lookup


async def backfill(apply: bool) -> None:
    try:
        from dotenv import load_dotenv
        load_dotenv(BACKEND_DIR / ".env")
    except ImportError:
        # dotenv is optional. In Railway / production, env vars are
        # injected directly into the process — no .env file to load.
        pass
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ.get("DB_NAME", "music_league")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    total = 0
    skipped = 0
    updated = 0
    missing_source = 0

    cursor = db.past_leagues.find({}, {"_id": 0})
    async for snap in cursor:
        total += 1
        league_id = snap.get("id")
        snap_rounds = snap.get("rounds") or []

        if _all_rounds_already_have_winner(snap_rounds):
            skipped += 1
            if total % 10 == 0:
                print(f"... processed {total} (skipped={skipped}, updated={updated}, missing={missing_source})")
            continue

        source_rounds = await db.rounds.find(
            {"league_id": league_id},
            {"_id": 0},
        ).to_list(500)

        if not source_rounds:
            missing_source += 1
            print(f"  warn: no source rounds for league {league_id} — writing empty winner/placements")
            new_rounds = [
                {
                    **(r or {}),
                    "winner": None,
                    "placements": {},
                }
                for r in snap_rounds
            ]
            if apply:
                await db.past_leagues.update_one(
                    {"id": league_id},
                    {"$set": {"rounds": new_rounds}},
                )
            updated += 1
            if total % 10 == 0:
                print(f"... processed {total} (skipped={skipped}, updated={updated}, missing={missing_source})")
            continue

        completed_round_ids = [
            r["id"] for r in source_rounds if r.get("status") == "completed"
        ]
        all_subs = []
        all_votes = []
        if completed_round_ids:
            all_subs = await db.submissions.find(
                {"round_id": {"$in": completed_round_ids}},
                {"_id": 0},
            ).to_list(5000)
            all_votes = await db.votes.find(
                {"round_id": {"$in": completed_round_ids}},
                {"_id": 0, "round_id": 1, "voter_id": 1, "rankings": 1},
            ).to_list(5000)

        subs_by_round: dict[str, list] = {}
        votes_by_round: dict[str, list] = {}
        for s in all_subs:
            subs_by_round.setdefault(s.get("round_id"), []).append(s)
        for v in all_votes:
            votes_by_round.setdefault(v.get("round_id"), []).append(v)

        user_ids_needed = {s.get("user_id") for s in all_subs if s.get("user_id")}
        user_lookup = await _build_user_lookup(db, snap, user_ids_needed)

        round_doc_by_id = {r["id"]: r for r in source_rounds}

        new_rounds = []
        for r_entry in snap_rounds:
            rid = (r_entry or {}).get("round_id")
            base = {
                "round_id": rid,
                "round_number": (r_entry or {}).get("round_number"),
                "theme": (r_entry or {}).get("theme"),
                "status": (r_entry or {}).get("status"),
            }
            r_doc = round_doc_by_id.get(rid)
            if r_doc is None:
                base["winner"] = None
                base["placements"] = {}
                new_rounds.append(base)
                continue
            subs = subs_by_round.get(rid, [])
            votes = votes_by_round.get(rid, [])
            result = _compute_round_results(r_doc, subs, votes, user_lookup)
            base["winner"] = result["winner"]
            base["placements"] = result["placements"]
            new_rounds.append(base)

        if apply:
            await db.past_leagues.update_one(
                {"id": league_id},
                {"$set": {"rounds": new_rounds}},
            )
        else:
            non_empty = sum(1 for r in new_rounds if r.get("winner") is not None)
            print(
                f"  would update league {league_id}: "
                f"{len(new_rounds)} rounds, {non_empty} with winners"
            )
        updated += 1

        if total % 10 == 0:
            print(f"... processed {total} (skipped={skipped}, updated={updated}, missing={missing_source})")

    print()
    print("=== Summary ===")
    print(f"Total snapshots processed : {total}")
    print(f"Skipped (already backfilled): {skipped}")
    print(f"Updated                    : {updated}")
    print(f"Missing source rounds      : {missing_source}")
    print(f"Mode                       : {'APPLY' if apply else 'DRY-RUN'}")


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    g = p.add_mutually_exclusive_group()
    g.add_argument("--dry-run", action="store_true", help="Compute updates without writing.")
    g.add_argument("--apply", action="store_true", help="Write the updates.")
    return p.parse_args()


def main() -> None:
    args = _parse_args()
    if not args.dry_run and not args.apply:
        print("Refusing to run: pass --dry-run or --apply explicitly.", file=sys.stderr)
        sys.exit(2)
    asyncio.run(backfill(apply=args.apply))


if __name__ == "__main__":
    main()
