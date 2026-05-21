import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ExpandableImage from '../ExpandableImage';
import { useAuth } from '../../context/AuthContext';
import { getLeagues, League } from '../../services/api';
import { apiCache } from '../../services/apiCache';

const SUBMISSION_COLORS = ['#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899'];
const pickColor = (seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) >>> 0;
  return SUBMISSION_COLORS[h % SUBMISSION_COLORS.length];
};

const GRID_COLS = 3;
const SCREEN_WIDTH = Dimensions.get('window').width;
const HORIZ_PAD = 20;
const GAP = 8;
const TILE_SIZE = Math.floor(
  (SCREEN_WIDTH - HORIZ_PAD * 2 - GAP * (GRID_COLS - 1)) / GRID_COLS,
);

export default function LeaguesTab() {
  const { user } = useAuth();
  const router = useRouter();
  // null until first SWR resolution → empty-state stays hidden during
  // the cold-start flash.
  const [leagues, setLeagues] = useState<League[] | null>(null);

  const load = useCallback(() => {
    const userId = user?.id;
    if (!userId) {
      getLeagues().then((r) => setLeagues(r.data)).catch(() => setLeagues([]));
      return;
    }
    apiCache
      .swr(
        `leagues:${userId}`,
        () => getLeagues().then((r) => r.data),
        setLeagues,
      )
      .catch(() => setLeagues([]));
  }, [user?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (leagues === null) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Loading…</Text>
      </View>
    );
  }

  if (leagues.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="trophy-outline" size={40} color="#6A6A6A" />
        <Text style={styles.emptyTitle}>No leagues yet</Text>
        <Text style={styles.emptyText}>You haven&rsquo;t joined any leagues yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      {leagues.map((l) => (
        <TouchableOpacity
          key={l.id}
          style={[styles.tile, { width: TILE_SIZE }]}
          activeOpacity={0.75}
          onPress={() => router.push(`/league/${l.id}` as any)}
        >
          <View style={styles.coverWrap}>
            <ExpandableImage
              source={l.league_image ? { uri: l.league_image } : null}
              onShortPress={() => router.push(`/league/${l.id}` as any)}
            >
              {l.league_image ? (
                <Image
                  source={{ uri: l.league_image }}
                  style={[styles.cover, { width: TILE_SIZE, height: TILE_SIZE }]}
                />
              ) : (
                <View
                  style={[
                    styles.cover,
                    styles.coverFallback,
                    { width: TILE_SIZE, height: TILE_SIZE, backgroundColor: pickColor(l.id) },
                  ]}
                >
                  <Ionicons name="trophy" size={28} color="#FFFFFF" />
                </View>
              )}
            </ExpandableImage>
            {!l.is_public && (
              <View style={styles.lockBadge} pointerEvents="none">
                <Ionicons name="lock-closed" size={14} color="#FFFFFF" />
              </View>
            )}
          </View>
          <Text style={styles.title} numberOfLines={1}>{l.name}</Text>
        </TouchableOpacity>
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
  tile: { marginBottom: 12 },
  coverWrap: { position: 'relative' },
  cover: { borderRadius: 8 },
  coverFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
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

  empty: {
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  emptyText: {
    fontSize: 13, color: '#B3B3B3', textAlign: 'center', lineHeight: 19,
  },
});
