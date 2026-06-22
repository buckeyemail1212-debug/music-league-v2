"""Retroactively re-score ALL completed rounds with the CURRENT scoring logic.

This rewrites the frozen lifetime totals (`all_time_points`, `total_wins`) on
every user document so they reflect the live scoring helper — including the
−1 non-voter penalty and float redistribution — applied as if every completed
round redistributes missing-voter pools (forfeit flag forced off).

It reuses the EXACT same scoring used by the live app by importing
`_score_round_points` straight from `main` — scoring is never reimplemented
here, so this migration can't drift from production behavior.

What it does, in order:
  1. SNAPSHOT  — back up every user's (id, all_time_points, total_wins) into
                 `_rescore_backup`, tagged with a fresh run_id + timestamp.
                 Reversible: each run leaves its own restorable snapshot.
  2. FLIP      — set forfeit_missing_voter_pools=False on all completed rounds,
                 so they redistribute under the new logic.
  3. RECOMPUTE — re-tally points + wins from source submissions/votes via
                 _score_round_points, rewrite each user_submissions row, then
                 $set (replace, not increment) each user's lifetime totals.
  4. AUDIT     — print before/after for every user whose totals changed.

Idempotent: it recomputes from source and uses $set (not $inc), so re-running
yields the same result. Steps 1–2 only run with --apply.

Usage:
  python backend/scripts/rescore_all_rounds.py            # dry-run (no writes)
  python backend/scripts/rescore_all_rounds.py --dry-run  # dry-run (explicit)
  python backend/scripts/rescore_all_rounds.py --apply    # perform migration
"""

import argparse
import asyncio
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent

# Make `import main` resolve regardless of the caller's cwd. main.py loads its
# own .env and builds the Mongo client at import time, so we get the app's real
# db handle and the canonical scoring helper for free.
sys.path.insert(0, str(BACKEND_DIR))

from main import db, _score_round_points  # noqa: E402


async def rescore(apply: bool, debug: bool = False) -> None:
    mode = "APPLY" if apply else "DRY-RUN"
    print(f"=== rescore_all_rounds ({mode}{', DEBUG' if debug else ''}) ===")

    # ── 1. SNAPSHOT (writes; apply only) ────────────────────────────────
    # Back up the current lifetime totals before touching anything, tagged
    # with a fresh run_id so repeat runs accumulate restorable snapshots
    # rather than overwriting each other.
    run_id = str(uuid.uuid4())
    if apply:
        backup_at = datetime.now(timezone.utc)
        all_users = await db.users.find(
            {}, {"_id": 0, "id": 1, "all_time_points": 1, "total_wins": 1}
        ).to_list(100000)
        if all_users:
            backup_docs = [
                {
                    "run_id": run_id,
                    "backup_at": backup_at,
                    "id": u.get("id"),
                    "all_time_points": u.get("all_time_points", 0),
                    "total_wins": u.get("total_wins", 0),
                }
                for u in all_users
            ]
            await db['_rescore_backup'].insert_many(backup_docs)
        print(f"Backed up {len(all_users)} users to _rescore_backup (run_id={run_id})")
    else:
        print("Skipping snapshot (dry-run — no writes).")

    # ── 2. FLIP THE FLAG (writes; apply only) ───────────────────────────
    # Old rounds may carry forfeit_missing_voter_pools=True; clear it on all
    # completed rounds so they redistribute under the new logic.
    if apply:
        flip_res = await db.rounds.update_many(
            {"status": "completed"},
            {"$set": {"forfeit_missing_voter_pools": False}},
        )
        print(f"Flipped forfeit flag -> False on {flip_res.modified_count} completed rounds.")
    else:
        print("Skipping flag flip (dry-run). Scoring below simulates forfeit=False.")

    # ── 3. RECOMPUTE (the core) ─────────────────────────────────────────
    completed_rounds = await db.rounds.find({"status": "completed"}).to_list(100000)
    print(f"Recomputing across {len(completed_rounds)} completed rounds...")

    # Debug-only: one id->username lookup for human-readable per-round dumps,
    # plus a per-user round-by-round ledger. None of this affects scoring.
    uname_by_id: dict[str, str] = {}
    user_round_log: dict[str, list] = {}
    if debug:
        all_user_docs = await db.users.find(
            {}, {"_id": 0, "id": 1, "username": 1}
        ).to_list(100000)
        uname_by_id = {u["id"]: u.get("username", u["id"]) for u in all_user_docs}
        print()
        print("=== Per-round detail ===")

    def _name(uid: str) -> str:
        return uname_by_id.get(uid, uid)

    new_points: dict[str, float] = {}
    new_wins: dict[str, int] = {}
    sub_row_updates = 0

    for round_doc in completed_rounds:
        rid = round_doc["id"]
        # Force forfeit off in-memory so scoring matches the flipped DB state
        # in both apply and dry-run modes (round_doc=None would do the same,
        # but passing the doc mirrors the live finalize path exactly).
        round_doc["forfeit_missing_voter_pools"] = False

        submissions = await db.submissions.find({"round_id": rid}).to_list(2000)
        votes = await db.votes.find({"round_id": rid}).to_list(5000)

        points = _score_round_points(submissions, votes, round_doc)
        max_pts = max(points.values()) if points else 0

        if debug:
            # Recompute voters/non-voters the SAME way the helper does, purely
            # for tracing — submitter ids minus the ids that cast a vote.
            submitter_ids = {s["user_id"] for s in submissions}
            voters_who_voted = {v.get("voter_id") for v in votes}
            non_voters = submitter_ids - voters_who_voted
            print()
            print(f"Round {round_doc.get('round_number', '?')} "
                  f"(round_id={rid}, league_id={round_doc.get('league_id')})")
            print(f"  submissions: {len(submissions)}")
            print(f"  submitters : {sorted(_name(u) for u in submitter_ids)}")
            print(f"  voted      : {sorted(_name(u) for u in voters_who_voted if u)}")
            print(f"  non-voters : {sorted(_name(u) for u in non_voters)}")
            pts_by_name = {
                _name(s["user_id"]): round(points.get(s["id"], 0.0), 2)
                for s in submissions
            }
            print(f"  points     : {pts_by_name}")

        for sub in submissions:
            uid = sub["user_id"]
            p = points.get(sub["id"], 0.0)
            new_points[uid] = new_points.get(uid, 0.0) + p
            if max_pts > 0 and p == max_pts:
                new_wins[uid] = new_wins.get(uid, 0) + 1
            else:
                new_wins.setdefault(uid, new_wins.get(uid, 0))
            if debug:
                # A submitter who didn't cast a vote took the −1 own-submission
                # penalty this round (mirrors the helper's non_voters set).
                penalized = uid not in {v.get("voter_id") for v in votes}
                user_round_log.setdefault(uid, []).append({
                    "round_number": round_doc.get("round_number"),
                    "round_id": rid,
                    "league_id": round_doc.get("league_id"),
                    "points": round(p, 2),
                    "penalized": penalized,
                })
            if apply:
                await db.user_submissions.update_one(
                    {"submission_id": sub["id"]},
                    {"$set": {"points": round(p, 2), "finalized": True,
                              "updated_at": datetime.now(timezone.utc)}},
                )
                sub_row_updates += 1

    if debug:
        # Key view: scan one user's per-round contributions at a glance —
        # including which rounds docked them via the −1 non-voter penalty.
        print()
        print("=== Per-user round-by-round ===")
        for uid in sorted(user_round_log, key=lambda x: _name(x).lower()):
            rounds = user_round_log[uid]
            total = round(sum(r["points"] for r in rounds), 2)
            print(f"{_name(uid)} (total {total} across {len(rounds)} rounds):")
            for r in sorted(rounds, key=lambda r: (r["round_number"] is None, r["round_number"])):
                tag = " [NON-VOTER -1]" if r["penalized"] else ""
                print(f"  Round {r['round_number']} (league {r['league_id']}): "
                      f"{r['points']}{tag}")

    # ── 4. AUDIT + WRITE lifetime totals ($set, not $inc) ───────────────
    # Pull current totals + usernames for everyone we recomputed so we can
    # print before/after and replace the frozen values.
    uids = list(new_points.keys())
    before_users = await db.users.find(
        {"id": {"$in": uids}},
        {"_id": 0, "id": 1, "username": 1, "all_time_points": 1, "total_wins": 1},
    ).to_list(len(uids)) if uids else []
    before_by_id = {u["id"]: u for u in before_users}

    changed = 0
    for uid in sorted(uids, key=lambda x: before_by_id.get(x, {}).get("username", "") or ""):
        before = before_by_id.get(uid, {})
        old_pts = before.get("all_time_points", 0) or 0
        old_wins = before.get("total_wins", 0) or 0
        uname = before.get("username", uid)

        new_pts = round(new_points.get(uid, 0.0), 2)
        new_w = new_wins.get(uid, 0)

        # Compare numerically (old may be int, new is float) and on wins.
        if float(old_pts) != float(new_pts) or int(old_wins) != int(new_w):
            changed += 1
            print(f"{uname}: all_time_points {old_pts} -> {new_pts}, wins {old_wins} -> {new_w}")

        if apply:
            await db.users.update_one(
                {"id": uid},
                {"$set": {"all_time_points": new_pts, "total_wins": new_w}},
            )

    # ── Summary ─────────────────────────────────────────────────────────
    print()
    print("=== Summary ===")
    print(f"Mode                      : {mode}")
    print(f"Completed rounds processed: {len(completed_rounds)}")
    print(f"Users recomputed          : {len(uids)}")
    print(f"Users changed             : {changed}")
    if apply:
        print(f"user_submissions rewritten: {sub_row_updates}")
        print(f"Snapshot run_id           : {run_id}")
        print("To revert: restore all_time_points/total_wins from _rescore_backup "
              f"where run_id == {run_id}.")
    else:
        print("No writes performed. Re-run with --apply to perform the migration.")


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    g = p.add_mutually_exclusive_group()
    g.add_argument("--dry-run", action="store_true",
                   help="Preview before/after without writing (default).")
    g.add_argument("--apply", action="store_true",
                   help="Snapshot, flip flags, and rewrite lifetime totals.")
    p.add_argument("--debug", action="store_true",
                   help="Print per-round and per-user point detail (read-only). "
                        "Combines with --dry-run or --apply.")
    return p.parse_args()


def main() -> None:
    args = _parse_args()
    asyncio.run(rescore(apply=args.apply, debug=args.debug))


if __name__ == "__main__":
    main()
