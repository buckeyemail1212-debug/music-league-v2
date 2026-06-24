import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { getLeaderboard, LeaderboardEntry } from '../../src/services/api';
import { apiCache } from '../../src/services/apiCache';
import Skeleton from '../../src/components/Skeleton';
import { formatPoints } from '../../src/utils/formatPoints';
import { FLOATING_NAV_CLEARANCE } from './_layout';
import { colors } from '../../src/theme/colors';

type Scope = 'all' | 'following' | 'friends';

const SCOPE_LABELS: Record<Scope, string> = {
  all: 'All Members',
  following: 'Following',
  friends: 'Friends',
};

const EMPTY_TEXT: Record<Scope, string> = {
  all: 'No rankings yet',
  following: 'Follow people to see them here',
  friends: 'Friends are people you follow who follow you back',
};

const EMPTY_ICON = {
  all: 'trophy-outline',
  following: 'person-add-outline',
  friends: 'people-outline',
} as const;

const SCOPES: Scope[] = ['all', 'following', 'friends'];

export default function LeaderboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const [scope, setScope] = useState<Scope>('all');
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(
    () => apiCache.getStale<LeaderboardEntry[]>(`leaderboard:all:${userId}`) ?? null
  );
  const [menuOpen, setMenuOpen] = useState(false);
  // Scope that the currently displayed `entries` belong to. When the
  // tab is refocused and this still matches the active scope, the
  // existing list stays visible while we refetch in the background —
  // no "Loading…" flash. On scope change or first load it differs,
  // so we blank to the loading state before fetching.
  const loadedScopeRef = useRef<Scope | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const key = `leaderboard:${scope}:${userId}`;
      const cachedForScope = apiCache.getStale<LeaderboardEntry[]>(key);
      if (cachedForScope) setEntries(cachedForScope);
      apiCache
        .swr(
          key,
          () => getLeaderboard(scope).then((r) => r.data.data.entries),
          (data) => {
            if (!cancelled) {
              setEntries(data);
              loadedScopeRef.current = scope;
            }
          },
        )
        .then((data) => {
          if (!cancelled) {
            setEntries(data);
            loadedScopeRef.current = scope;
          }
        })
        .catch(() => {
          if (!cancelled) {
            setEntries([]);
            loadedScopeRef.current = scope;
          }
        });
      return () => {
        cancelled = true;
      };
    }, [scope, userId]),
  );

  const renderItem = ({ item }: { item: LeaderboardEntry }) => {
    const isTop = item.rank <= 3;
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.75}
        onPress={() => router.push(`/user/${item.user_id}` as any)}
      >
        <Text style={[styles.rank, isTop && styles.rankTop]}>{item.rank}</Text>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Ionicons name="person" size={18} color={colors.textSecondary} />
          </View>
        )}
        <Text style={styles.username} numberOfLines={1}>
          @{item.username}
        </Text>
        <Text style={styles.points}>{formatPoints(item.all_time_points)}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Leaderboard</Text>

      <TouchableOpacity
        style={styles.scopePill}
        onPress={() => setMenuOpen(true)}
        activeOpacity={0.75}
      >
        <Text style={styles.scopePillLabel}>{SCOPE_LABELS[scope]}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
      </TouchableOpacity>

      {entries === null ? (
        <View>
          {Array.from({ length: 10 }, (_, i) => (
            <View key={i} style={styles.row}>
              <Skeleton width={20} height={16} borderRadius={4} />
              <Skeleton width={40} height={40} borderRadius={20} />
              <Skeleton width="60%" height={14} borderRadius={6} />
            </View>
          ))}
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.centerState}>
          <Ionicons name={EMPTY_ICON[scope]} size={40} color={colors.textTertiary} />
          <Text style={styles.emptyText}>{EMPTY_TEXT[scope]}</Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.user_id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: FLOATING_NAV_CLEARANCE }}
        />
      )}

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setMenuOpen(false)}
        >
          <View style={styles.menuCard}>
            {SCOPES.map((s) => {
              const active = s === scope;
              return (
                <TouchableOpacity
                  key={s}
                  style={styles.menuOption}
                  activeOpacity={0.75}
                  onPress={() => {
                    setScope(s);
                    setMenuOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.menuOptionLabel,
                      active && styles.menuOptionLabelActive,
                    ]}
                  >
                    {SCOPE_LABELS[s]}
                  </Text>
                  {active && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.textPrimary,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  scopePill: {
    backgroundColor: colors.surface3,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginHorizontal: 20,
    marginBottom: 16,
  },
  scopePillLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderFaint,
  },
  rank: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textSecondary,
    width: 32,
  },
  rankTop: {
    color: colors.accent,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  username: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  points: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  menuOverlay: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuCard: {
    backgroundColor: colors.surface2,
    borderRadius: 12,
    paddingVertical: 6,
    minWidth: 240,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  menuOptionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  menuOptionLabelActive: {
    color: colors.accent,
  },
});
