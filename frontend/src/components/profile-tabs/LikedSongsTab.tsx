import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import {
  LikedSong,
  loadLikedSongs,
  subscribeLikedSongs,
  toggleLikedSong,
  getCachedLikedSongs,
} from '../../utils/likedSongs';

const GRID_COLS = 3;
const SCREEN_WIDTH = Dimensions.get('window').width;
// Outer padding 20 each side, 8px gap between tiles → tile size derived
// so the row stays edge-aligned with the rest of the profile content.
const HORIZ_PAD = 20;
const GAP = 8;
const TILE_SIZE = Math.floor(
  (SCREEN_WIDTH - HORIZ_PAD * 2 - GAP * (GRID_COLS - 1)) / GRID_COLS,
);

export default function LikedSongsTab() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const [songs, setSongs] = useState<LikedSong[] | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setSongs([]);
      return;
    }
    // loadLikedSongs is server-backed and SWR-cached internally; one
    // call gets us either the warm result or a network fetch and
    // notifies all subscribers along the way.
    try {
      const data = await loadLikedSongs(userId);
      setSongs(data);
    } catch {
      setSongs([]);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Live updates: when a LikeButton elsewhere flips state, the utility
  // notifies subscribers with the latest id set. Pull the full song
  // list back out of the shared cache so the grid re-renders without
  // a redundant network call.
  useEffect(() => {
    if (!userId) return;
    const unsub = subscribeLikedSongs(userId, () => {
      // Read directly from the in-memory cache instead of triggering a refetch
      // via load(). load() goes through SWR which can return stale data and
      // race with the optimistic setSongs(filter) in onUnlike.
      setSongs(getCachedLikedSongs(userId));
    });
    return () => { unsub(); };
  }, [userId]);

  const onUnlike = useCallback(
    async (song: LikedSong) => {
      if (!userId) return;
      // Optimistic removal — the toggle helper updates AsyncStorage
      // and notifies; the subscriber above will reconcile.
      setSongs((prev) => (prev ?? []).filter((s) => s.deezer_id !== song.deezer_id));
      await toggleLikedSong(userId, song);
    },
    [userId],
  );

  if (songs === null) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Loading…</Text>
      </View>
    );
  }

  if (songs.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="heart-outline" size={40} color="#6A6A6A" />
        <Text style={styles.emptyText}>Songs you like will appear here</Text>
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      {songs.map((s) => (
        <View key={s.deezer_id} style={[styles.tile, { width: TILE_SIZE }]}>
          <View style={styles.coverWrap}>
            {s.cover_url ? (
              <Image source={{ uri: s.cover_url }} style={[styles.cover, { width: TILE_SIZE, height: TILE_SIZE }]} />
            ) : (
              <View
                style={[
                  styles.cover,
                  styles.coverFallback,
                  { width: TILE_SIZE, height: TILE_SIZE },
                ]}
              >
                <Ionicons name="musical-note" size={28} color="#FFFFFF" />
              </View>
            )}
            <TouchableOpacity
              onPress={() => onUnlike(s)}
              hitSlop={6}
              style={styles.heartBtn}
              activeOpacity={0.7}
              accessibilityLabel="Unlike song"
            >
              <Ionicons name="heart" size={20} color="#EF4444" />
            </TouchableOpacity>
          </View>
          <Text style={styles.title} numberOfLines={1}>{s.title}</Text>
          <Text style={styles.artist} numberOfLines={1}>{s.artist}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: HORIZ_PAD,
    gap: GAP,
    marginTop: 4,
  },
  tile: {
    marginBottom: 12,
  },
  coverWrap: { position: 'relative' },
  cover: { borderRadius: 8 },
  coverFallback: {
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartBtn: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 6,
  },
  artist: {
    fontSize: 11,
    color: '#B3B3B3',
    marginTop: 1,
  },

  empty: {
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 13, color: '#B3B3B3', textAlign: 'center', lineHeight: 19,
  },
});
