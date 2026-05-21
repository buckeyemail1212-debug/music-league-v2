import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ExpandableImage from '../ExpandableImage';
import { getUserLeagues, UserLeagueSummary } from '../../services/api';
import { apiCache } from '../../services/apiCache';

const SUBMISSION_COLORS = ['#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899'];
const pickColor = (seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) >>> 0;
  return SUBMISSION_COLORS[h % SUBMISSION_COLORS.length];
};

const TTL_MS = 60 * 1000;
const cacheKey = (targetId: string, viewerId: string) =>
  `user-leagues:${targetId}:${viewerId}`;

export default function UserLeaguesTab({
  targetId,
  viewerId,
}: {
  targetId: string;
  viewerId: string;
}) {
  const router = useRouter();
  // null = loading, [] = loaded empty. The empty-state copy only fires
  // once we know the list is actually empty, not during the initial
  // network call.
  const [leagues, setLeagues] = useState<UserLeagueSummary[] | null>(null);

  const load = useCallback(() => {
    if (!targetId || !viewerId) return;
    apiCache
      .swr<UserLeagueSummary[]>(
        cacheKey(targetId, viewerId),
        () => getUserLeagues(targetId).then((r) => r.data.data.leagues ?? []),
        setLeagues,
        TTL_MS,
      )
      .then(setLeagues)
      .catch(() => setLeagues([]));
  }, [targetId, viewerId]);

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
        <Text style={styles.emptyText}>No leagues yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {leagues.map((l, idx) => {
        const last = idx === leagues.length - 1;
        return (
          <TouchableOpacity
            key={l.id}
            style={[styles.row, last && styles.rowLast]}
            activeOpacity={0.75}
            onPress={() => router.push(`/league/${l.id}` as any)}
          >
            <ExpandableImage source={l.image_url ? { uri: l.image_url } : null}>
              <View style={[styles.thumb, { backgroundColor: pickColor(l.id) }]}>
                {l.image_url ? (
                  <Image source={{ uri: l.image_url }} style={styles.thumbImg} />
                ) : (
                  <Ionicons name="trophy" size={22} color="#FFFFFF" />
                )}
              </View>
            </ExpandableImage>
            <View style={styles.rowInfo}>
              <View style={styles.rowTitleRow}>
                <Text style={styles.rowTitle} numberOfLines={1}>{l.name}</Text>
                {l.is_private ? (
                  <Ionicons name="lock-closed" size={12} color="#B3B3B3" />
                ) : null}
              </View>
              <Text style={styles.rowSub} numberOfLines={1}>
                {l.member_count} {l.member_count === 1 ? 'member' : 'members'}
                {l.is_completed ? ' · Completed' : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#6A6A6A" />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    backgroundColor: '#181818',
    marginHorizontal: 20,
    marginTop: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rowLast: { borderBottomWidth: 0 },
  thumb: {
    width: 50, height: 50, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  thumbImg: { width: 50, height: 50, borderRadius: 8 },
  rowInfo: { flex: 1 },
  rowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  rowSub: { fontSize: 12, color: '#B3B3B3', marginTop: 3 },

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
