import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Dimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getUserLikedSongs, LikedSong } from '../../services/api';
import { apiCache } from '../../services/apiCache';
import LikeButton from '../LikeButton';

const GRID_COLS = 3;
const SCREEN_WIDTH = Dimensions.get('window').width;
const HORIZ_PAD = 20;
const GAP = 8;
const TILE_SIZE = Math.floor(
  (SCREEN_WIDTH - HORIZ_PAD * 2 - GAP * (GRID_COLS - 1)) / GRID_COLS,
);

const TTL_MS = 60 * 1000;
const cacheKey = (targetId: string, viewerId: string) =>
  `user-liked-songs:${targetId}:${viewerId}`;

export default function UserLikedSongsTab({
  targetId,
  viewerId,
}: {
  targetId: string;
  viewerId: string;
}) {
  // null = loading, [] = loaded empty. We render null on 403 too — the
  // outer screen is responsible for showing the privacy screen, so a
  // safety-null here just prevents flicker if something racey happens.
  const [songs, setSongs] = useState<LikedSong[] | null>(null);
  const [hidden, setHidden] = useState(false);

  const load = useCallback(() => {
    if (!targetId || !viewerId) return;
    setHidden(false);
    apiCache
      .swr<LikedSong[]>(
        cacheKey(targetId, viewerId),
        () => getUserLikedSongs(targetId).then((r) => r.data.data.songs ?? []),
        setSongs,
        TTL_MS,
      )
      .then(setSongs)
      .catch((err) => {
        if (err?.response?.status === 403) {
          setHidden(true);
        } else {
          setSongs([]);
        }
      });
  }, [targetId, viewerId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (hidden) return null;

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
        <Text style={styles.emptyText}>No liked songs yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      {songs.map((s) => (
        <View key={s.deezer_id} style={styles.tile}>
          <View style={styles.coverWrap}>
            {s.cover_url ? (
              <Image source={{ uri: s.cover_url }} style={styles.cover} />
            ) : (
              <View style={[styles.cover, styles.coverFallback]}>
                <Ionicons name="musical-note" size={28} color="#FFFFFF" />
              </View>
            )}
            <View style={styles.heartBtn}>
              {/* Heart reflects the VIEWER'S like state, not target's.
                  Tapping toggles the viewer's list (LikeButton normal
                  behavior). */}
              <LikeButton song={s} size={18} />
            </View>
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
  tile: { width: TILE_SIZE, marginBottom: 12 },
  coverWrap: { position: 'relative' },
  cover: { width: TILE_SIZE, height: TILE_SIZE, borderRadius: 8 },
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
  title: { fontSize: 12, fontWeight: '700', color: '#FFFFFF', marginTop: 6 },
  artist: { fontSize: 11, color: '#B3B3B3', marginTop: 1 },

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
