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
            <Ionicons name="person" size={18} color="#B3B3B3" />
          </View>
        )}
        <Text style={styles.username} numberOfLines={1}>
          @{item.username}
        </Text>
        <Text style={styles.points}>{item.all_time_points}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Leaderboard</Text>

      <TouchableOpacity
        style={styles.scopePill}
        onPress={() => setMenuOpen(true)}
        activeOpacity={0.75}
      >
        <Text style={styles.scopePillLabel}>{SCOPE_LABELS[scope]}</Text>
        <Ionicons name="chevron-down" size={16} color="#B3B3B3" />
      </TouchableOpacity>

      {entries === null ? (
        <View style={styles.centerState}>
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.centerState}>
          <Ionicons name={EMPTY_ICON[scope]} size={40} color="#6A6A6A" />
          <Text style={styles.emptyText}>{EMPTY_TEXT[scope]}</Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.user_id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
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
                  {active && <Ionicons name="checkmark" size={18} color="#7C3AED" />}
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
  container: { flex: 1, backgroundColor: '#121212' },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  scopePill: {
    backgroundColor: '#282828',
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
    color: '#FFFFFF',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rank: {
    fontSize: 16,
    fontWeight: '700',
    color: '#B3B3B3',
    width: 32,
  },
  rankTop: {
    color: '#7C3AED',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
  },
  username: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  points: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
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
    color: '#B3B3B3',
  },
  emptyText: {
    fontSize: 14,
    color: '#B3B3B3',
    textAlign: 'center',
  },

  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuCard: {
    backgroundColor: '#181818',
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
    color: '#FFFFFF',
  },
  menuOptionLabelActive: {
    color: '#7C3AED',
  },
});
