// Shared cache + event bus for the device-local "liked songs" feature.
//
// Persistence has always lived in AsyncStorage under
// `liked_songs_${userId}`; this module keeps a hot in-memory copy plus
// a subscription list so every LikeButton on the screen and the
// LikedSongsTab on Profile stay in sync without each one re-reading
// AsyncStorage on every change.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiCache } from '../services/apiCache';

export interface LikedSong {
  deezer_id: number;
  title: string;
  artist: string;
  album?: string;
  cover_url?: string;
  preview_url?: string;
}

const storageKey = (userId: string) => `liked_songs_${userId}`;

// userId → Map<deezer_id_string, LikedSong>. Seeded on first read for
// a given user; updates flow through the toggle helper below.
const cache: Map<string, Map<string, LikedSong>> = new Map();

type Listener = (set: Set<string>) => void;
const listeners: Map<string, Set<Listener>> = new Map();

function notify(userId: string) {
  const ids = new Set(Array.from(cache.get(userId)?.keys() ?? []));
  const subs = listeners.get(userId);
  if (subs) for (const cb of subs) cb(ids);
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

export async function loadLikedSongs(userId: string): Promise<LikedSong[]> {
  // Always re-read from disk so a remount after Settings → Clear Data
  // sees the wipe instead of returning the in-memory cache.
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    const arr: LikedSong[] = Array.isArray(parsed)
      ? parsed.filter((s) => s && typeof s === 'object' && 'deezer_id' in s)
      : [];
    const map = new Map(arr.map((s) => [String(s.deezer_id), s]));
    cache.set(userId, map);
    return arr;
  } catch {
    cache.set(userId, new Map());
    return [];
  }
}

export function getCachedLikedIds(userId: string): Set<string> {
  const map = cache.get(userId);
  return new Set(Array.from(map?.keys() ?? []));
}

export async function toggleLikedSong(
  userId: string,
  song: LikedSong,
): Promise<boolean> {
  if (!userId) return false;
  // Hydrate the cache from disk if this is the first interaction this
  // session — otherwise an in-memory wipe (cache.clear on logout) plus
  // a stale on-screen LikeButton would let us write a partial list.
  if (!cache.has(userId)) await loadLikedSongs(userId);
  const map = cache.get(userId) ?? new Map<string, LikedSong>();
  const key = String(song.deezer_id);
  let nowLiked: boolean;
  if (map.has(key)) {
    map.delete(key);
    nowLiked = false;
  } else {
    map.set(key, song);
    nowLiked = true;
  }
  cache.set(userId, map);
  try {
    await AsyncStorage.setItem(
      storageKey(userId),
      JSON.stringify(Array.from(map.values())),
    );
  } catch {
    // Storage failures shouldn't block the in-memory state — Discover
    // and Profile both refresh from cache, and the next successful
    // write will reconcile.
  }
  // LikedSongsTab on Profile listens through apiCache; invalidate so a
  // tab switch back to Liked Songs picks up the change.
  apiCache.invalidate(`liked-songs:${userId}`);
  notify(userId);
  return nowLiked;
}

export function clearLikedSongsCache(userId?: string) {
  if (userId) {
    cache.delete(userId);
    listeners.delete(userId);
    return;
  }
  cache.clear();
  listeners.clear();
}
