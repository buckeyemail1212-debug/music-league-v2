import type { PastLeague } from '../services/api';

// Lightweight in-memory cache for the Past Leagues page. Enables a
// stale-while-revalidate pattern: the page renders cached data
// immediately on mount, kicks off a background refetch, and reconciles
// when the refetch returns. The cache is cleared on sign-out and
// invalidated by any `leagueEvents.emit()` (league deletion, creation,
// clear-account-data, etc.).

let cache: PastLeague[] | null = null;

export const pastLeaguesCache = {
  get(): PastLeague[] | null {
    return cache;
  },
  set(list: PastLeague[]) {
    // Shallow copy so downstream mutations don't leak into the cache.
    cache = list.slice();
  },
  clear() {
    cache = null;
  },
};
