import {
  getLeagues,
  getUserStats,
  getMySubmissions,
  getLifetimeStats,
  getUserTaste,
  getLeagueWins,
  getRoundsPlayed,
  getTopVoters,
} from './api';
import { apiCache } from './apiCache';

// Background-warms the apiCache so the My Game / Profile screen has data
// the moment it mounts. Called from AuthContext on every successful auth
// transition (login, register, restored session, external setAuth) —
// always fire-and-forget, never awaited.
//
// Keys and fetcher shapes mirror profile.tsx exactly. If the two diverge
// the cache reads the wrong value type and Profile renders broken UI, so
// any change here must be made there too (or vice versa).
//
// Lives in its own module so `prefetch → api → apiCache` stays acyclic
// (apiCache.ts must not import api.ts).
export async function prefetchProfileData(userId: string): Promise<void> {
  if (!userId) return;

  // Pair each cache key with the fetcher Profile uses for that key. The
  // unwrap chains (`.data.submissions`, `.data.data.count`, etc.) match
  // profile.tsx — caching the raw AxiosResponse would store the wrong
  // shape.
  const tasks: Array<[string, () => Promise<unknown>]> = [
    [`leagues:${userId}`, () => getLeagues().then((r) => r.data)],
    [`auth-stats:${userId}`, () => getUserStats().then((r) => r.data)],
    [
      `auth-submissions:${userId}`,
      () => getMySubmissions().then((r) => r.data.submissions),
    ],
    [
      `auth-lifetime-stats:${userId}`,
      () => getLifetimeStats().then((r) => r.data),
    ],
    [`auth-taste:${userId}`, () => getUserTaste().then((r) => r.data)],
    [
      `users-me-stats-league-wins:${userId}`,
      () => getLeagueWins().then((r) => r.data.data.count),
    ],
    [
      `users-me-stats-rounds-played:${userId}`,
      () => getRoundsPlayed().then((r) => r.data.data.count),
    ],
    [
      `users-me-stats-top-voters:${userId}`,
      () => getTopVoters().then((r) => r.data.data),
    ],
  ];

  // allSettled so one failing endpoint doesn't abort the rest. No UI is
  // listening (the no-op onUpdate); Profile reads the populated cache
  // when it mounts.
  await Promise.allSettled(
    tasks.map(([key, fetcher]) => apiCache.swr(key, fetcher, () => {})),
  );
}
