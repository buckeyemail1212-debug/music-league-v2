"""One-time backfill: add per-round winner + placements to past_leagues.

Re-runs the same per-round computation used by _build_past_league_snapshot
(imported from backend.main) over every snapshot already in past_leagues
and writes back enriched rounds[] entries.

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

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from main import _compute_round_results  # noqa: E402


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
    load_dotenv(BACKEND_DIR / ".env")
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
