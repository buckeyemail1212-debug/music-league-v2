import type { PublicLeagueSummary } from '../services/api';

// Module-level cache for the Public Leagues page. Enables a
// stale-while-revalidate pattern: the page renders cached data
// immediately on mount, kicks off a background refetch, and reconciles
// when the refetch returns. Invalidated by `leagueEvents.emit()` (join,
// leave, create) and by the page's own 30s background refetch.

let cache: PublicLeagueSummary[] | null = null;

export const publicLeaguesCache = {
  get(): PublicLeagueSummary[] | null {
    return cache;
  },
  set(list: PublicLeagueSummary[]) {
    cache = list.slice();
  },
  clear() {
    cache = null;
  },
};
