// Shared cache + event bus for the "liked songs" feature, now backed
// by the server (`/api/likes`). The on-disk AsyncStorage list lives
// only long enough for the one-time migration to drain it into the
// backend; after that, this module is the single source of truth in
// the client, and the server is the single source of truth across
// devices.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiCache } from '../services/apiCache';
import {
  LikedSong,
  getLikedSongs as apiGetLikedSongs,
  likeSong as apiLikeSong,
  unlikeSong as apiUnlikeSong,
  migrateLikedSongs as apiMigrateLikedSongs,
} from '../services/api';

// Re-export the type so existing imports (`from '../utils/likedSongs'`)
// keep working without churn.
export type { LikedSong };

const legacyStorageKey = (userId: string) => `liked_songs_${userId}`;
const migratedFlagKey = (userId: string) => `liked_songs_migrated_${userId}`;
const cacheKey = (userId: string) => `liked-songs:${userId}`;
const TTL_MS = 60 * 1000;

// userId → Map<deezer_id_string, LikedSong>. Seeded by loadLikedSongs.
const cache: Map<string, Map<string, LikedSong>> = new Map();

type Listener = (ids: Set<string>) => void;
const listeners: Map<string, Set<Listener>> = new Map();

const migrationInFlight: Set<string> = new Set();

function notify(userId: string) {
  const ids = new Set(Array.from(cache.get(userId)?.keys() ?? []));
  const subs = listeners.get(userId);
  if (subs) for (const cb of subs) cb(ids);
}

async function maybeMigrate(userId: string): Promise<void> {
  if (!userId) return;
  if (migrationInFlight.has(userId)) return;
  try {
    const flag = await AsyncStorage.getItem(migratedFlagKey(userId));
    if (flag === 'true') return;
    const raw = await AsyncStorage.getItem(legacyStorageKey(userId));
    const arr: LikedSong[] = (() => {
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })();
    // Nothing on disk → flag and skip the network call. Idempotent: the
    // next launch sees the flag and short-circuits even faster.
    if (arr.length === 0) {
      await AsyncStorage.setItem(migratedFlagKey(userId), 'true').catch(() => {});
      await AsyncStorage.removeItem(legacyStorageKey(userId)).catch(() => {});
      return;
    }
    migrationInFlight.add(userId);
    try {
      await apiMigrateLikedSongs(arr);
      await AsyncStorage.setItem(migratedFlagKey(userId), 'true').catch(() => {});
      await AsyncStorage.removeItem(legacyStorageKey(userId)).catch(() => {});
      // The server cache now has the migrated rows — drop the SWR
      // entry so the next loadLikedSongs picks them up instead of
      // returning the pre-migration empty list.
      apiCache.invalidate(cacheKey(userId));
    } finally {
      migrationInFlight.delete(userId);
    }
  } catch {
    // Network/parse failure — leave the legacy key intact so the next
    // launch retries the migration. The migrated flag is only set on
    // success, so we don't risk losing data.
  }
}

async function fetchAllFromBackend(userId: string): Promise<LikedSong[]> {
  // Backend caps page size at 100. v1: assume a user has fewer than
  // 100 liked songs; if that ceases to be true we paginate here
  // without changing the public API.
  const res = await apiGetLikedSongs(100, 0);
  const songs = res.data?.data?.songs ?? [];
  cache.set(userId, new Map(songs.map((s) => [String(s.deezer_id), s])));
  notify(userId);
  return songs;
}

export async function loadLikedSongs(userId: string): Promise<LikedSong[]> {
  if (!userId) return [];
  // Fire migration as a side effect on first read; don't block — the
  // user sees a (possibly empty) list immediately and the migration
  // refreshes it when the POST lands.
  maybeMigrate(userId).catch(() => {});
  try {
    return await apiCache.swr<LikedSong[]>(
      cacheKey(userId),
      () => fetchAllFromBackend(userId),
      // Stale-revalidate path — keep the in-memory cache and
      // subscribers in sync when the background refetch lands.
      (next) => {
        cache.set(userId, new Map(next.map((s) => [String(s.deezer_id), s])));
        notify(userId);
      },
      TTL_MS,
    );
  } catch {
    // Network failure — fall back to whatever's already in memory.
    return Array.from(cache.get(userId)?.values() ?? []);
  }
}

export function getCachedLikedIds(userId: string): Set<string> {
  return new Set(Array.from(cache.get(userId)?.keys() ?? []));
}

export function getCachedLikedSongs(userId: string): LikedSong[] {
  return Array.from(cache.get(userId)?.values() ?? []);
}

export function subscribeLikedSongs(userId: string, cb: Listener): () => void {
  let subs = listeners.get(userId);
  if (!subs) {
    subs = new Set();
    listeners.set(userId, subs);
  }
  subs.add(cb);
  return () => {
    subs!.delete(cb);
  };
}

export async function toggleLikedSong(
  userId: string,
  song: LikedSong,
): Promise<boolean> {
  if (!userId) return false;
  // Hydrate the cache if this is the first interaction this session.
  if (!cache.has(userId)) {
    try {
      await loadLikedSongs(userId);
    } catch {
      cache.set(userId, new Map());
    }
  }
  const map = cache.get(userId) ?? new Map<string, LikedSong>();
  const key = String(song.deezer_id);
  const wasLiked = map.has(key);

  // Optimistic flip + notify. Subscribers (LikeButton, LikedSongsTab,
  // Discover) re-render off this before the network call lands.
  if (wasLiked) map.delete(key);
  else map.set(key, song);
  cache.set(userId, map);
  notify(userId);

  try {
    if (wasLiked) {
      await apiUnlikeSong(song.deezer_id);
    } else {
      await apiLikeSong(song);
    }
    // Backend list may have shifted; drop the SWR entry so the next
    // read fetches fresh.
    apiCache.invalidate(cacheKey(userId));
    return !wasLiked;
  } catch {
    // Rollback the in-memory map and notify so the UI reverts.
    const rollback = cache.get(userId) ?? new Map<string, LikedSong>();
    if (wasLiked) rollback.set(key, song);
    else rollback.delete(key);
    cache.set(userId, rollback);
    notify(userId);
    return wasLiked;
  }
}

export function clearLikedSongsCache(userId?: string) {
  // In-memory only — does not touch the backend. Used on logout so a
  // second user signing in on the same device doesn't inherit the
  // first user's cached list.
  if (userId) {
    cache.delete(userId);
    listeners.delete(userId);
    return;
  }
  cache.clear();
  listeners.clear();
}
