// In-memory draft store used to carry the in-progress league config from
// the Create League screen to the Set Round Themes screen. Not persisted —
// the whole point is that if the user bails mid-flow we throw it away.

export interface LeagueDraft {
  name: string;
  photo: string | null;
  totalRounds: number;
  submissionHours: number;
  votingHours: number;
  genre?: string;
  isPublic?: boolean;
  // Hours until Round 1 auto-starts, for public leagues. Converted to an
  // absolute starts_at timestamp at create time so the server doesn't
  // have to second-guess relative values.
  startsInHours?: number;
  // Public-only member cap; omitted = server default (50).
  memberCap?: number;
}

let current: LeagueDraft | null = null;

export const leagueDraft = {
  set(d: LeagueDraft) {
    current = d;
  },
  get(): LeagueDraft | null {
    return current;
  },
  clear() {
    current = null;
  },
};
