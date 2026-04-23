import type { DiscoverLeague } from '../services/api';

// Module-level cache for the Discover page. Enables a
// stale-while-revalidate pattern: the page renders cached data
// immediately on mount, kicks off a background refetch, and reconciles
// when the refetch returns. Invalidated by `leagueEvents.emit()` (join,
// leave, create) and by the page's own 30s background refetch.

let cache: DiscoverLeague[] | null = null;

export const discoverLeaguesCache = {
  get(): DiscoverLeague[] | null {
    return cache;
  },
  set(list: DiscoverLeague[]) {
    cache = list.slice();
  },
  clear() {
    cache = null;
  },
};
