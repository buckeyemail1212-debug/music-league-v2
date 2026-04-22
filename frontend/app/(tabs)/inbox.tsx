import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { useAuth } from '../../src/context/AuthContext';
import {
  getLeagues,
  getLeagueMessages,
  getRounds,
  getMySubmissions,
  getLeagueSnapshot,
  League as ApiLeague,
  Round,
  MySubmission,
} from '../../src/services/api';
import { SharedChat } from '../../src/components/SharedChat';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { pluralize } from '../../src/utils/pluralize';
import LeagueAvatar from '../../src/components/LeagueAvatar';

type NotifType = 'COMMENT' | 'RESULT' | 'REMINDER' | 'ACTIVITY' | 'SUBMIT';
type FilterKey = 'ALL' | 'RESULTS' | 'REMINDER' | 'ACTIVITY' | 'SUBMIT';

interface Notif {
  id: string;
  type: NotifType;
  leagueId: string;
  leagueName: string;
  leagueImage?: string;
  roundInfo?: string;
  message: string;
  timestamp: number;
  onTap: 'chat' | 'round' | 'league';
  roundId?: string;
}

const TYPE_COLORS: Record<NotifType, string> = {
  COMMENT: '#3B82F6',
  RESULT: '#F59E0B',
  REMINDER: '#EF4444',
  ACTIVITY: '#10B981',
  SUBMIT: '#7C3AED',
};

const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: 'ALL', label: 'ALL' },
  { key: 'RESULTS', label: 'RESULTS' },
  { key: 'REMINDER', label: 'REMINDER' },
  { key: 'ACTIVITY', label: 'ACTIVITY' },
  { key: 'SUBMIT', label: 'SUBMIT' },
];

const NOTIF_PERSIST_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

function parseTs(s?: string | null): number {
  if (!s) return 0;
  const t = new Date(s.endsWith('Z') || s.includes('+') ? s : s + 'Z').getTime();
  return isNaN(t) ? 0 : t;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d`;
  const d = new Date(ts);
  return `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}`;
}

// Per-spec cache key — user-scoped so each account has its own photo copy.
// The photo stays cached after the league is deleted so notifications still
// show the correct thumbnail during the 3-day persistence window.
const leaguePhotoKey = (userId: string, leagueId: string) =>
  `league_image_${userId}_${leagueId}`;
const notifCacheKey = (userId: string) => `inbox_notifs_${userId}`;
const dismissedKey = (userId: string) => `inbox_dismissed_${userId}`;

async function cacheLeaguePhoto(userId: string, leagueId: string, photo?: string | null) {
  if (!userId || !leagueId || !photo) return;
  try {
    await AsyncStorage.setItem(leaguePhotoKey(userId, leagueId), photo);
  } catch {}
}
async function getCachedLeaguePhoto(userId: string, leagueId: string): Promise<string | undefined> {
  try {
    const v = await AsyncStorage.getItem(leaguePhotoKey(userId, leagueId));
    return v || undefined;
  } catch {
    return undefined;
  }
}

export default function InboxScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [leaguesList, setLeaguesList] = useState<ApiLeague[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeLeague, setActiveLeague] = useState<ApiLeague | null>(null);
  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const lastFetchTime = useRef<number>(0);
  const dataLoaded = useRef(false);

  // Load dismissed IDs on user change
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(dismissedKey(user.id));
        if (raw) setDismissed(new Set(JSON.parse(raw)));
      } catch {}
    })();
  }, [user?.id]);

  const persistDismissed = async (next: Set<string>) => {
    if (!user?.id) return;
    try {
      await AsyncStorage.setItem(dismissedKey(user.id), JSON.stringify([...next]));
    } catch {}
  };

  const fetchAll = async () => {
    lastFetchTime.current = Date.now();
    try {
      const leaguesRes = await getLeagues();
      const leagueList = leaguesRes.data;

      // hydrate league images from async-storage cache
      await Promise.all(leagueList.map(async (l) => {
        if (!l.league_image) {
          try {
            const cached = user?.id ? await AsyncStorage.getItem(`league_image_${user.id}_${l.id}`) : null;
            if (cached) l.league_image = cached;
          } catch {}
        }
        // Always keep a durable copy of the current photo so deleted leagues
        // still render their thumbnail for the 3-day persistence window.
        if (l.league_image && user?.id) cacheLeaguePhoto(user.id, l.id, l.league_image);
      }));
      setLeaguesList(leagueList);
      dataLoaded.current = true;

      const items: Notif[] = [];

      const mySubsRes = await getMySubmissions().catch(() => null);
      const mySubs: MySubmission[] = mySubsRes?.data?.submissions ?? [];

      await Promise.all(leagueList.map(async (league) => {
        // messages → COMMENT
        try {
          const msgRes = await getLeagueMessages(league.id);
          const msgs = msgRes.data || [];
          const latestOther = [...msgs].reverse().find(m => m.user_id !== user?.id);
          if (latestOther) {
            items.push({
              id: `msg-${latestOther.id}`,
              type: 'COMMENT',
              leagueId: league.id,
              leagueName: league.name,
              leagueImage: league.league_image || undefined,
              message: `${latestOther.username}: ${latestOther.content}`,
              timestamp: parseTs(latestOther.created_at),
              onTap: 'chat',
            });
          }
        } catch {}

        // rounds → REMINDER + SUBMIT
        try {
          const roundsRes = await getRounds(league.id);
          const rounds: Round[] = roundsRes.data || [];
          for (const r of rounds) {
            if (r.status === 'submission' || r.status === 'voting') {
              const deadline = r.status === 'submission' ? r.submission_deadline : r.voting_deadline;
              const deadlineTs = parseTs(deadline);
              const diff = deadlineTs - Date.now();
              const userActed = r.status === 'submission' ? r.has_user_submitted : r.has_user_voted;

              if (diff > 0 && diff < 24 * 3600 * 1000 && !userActed) {
                const hours = Math.ceil(diff / 3_600_000);
                items.push({
                  id: `rem-${r.id}-${r.status}`,
                  type: 'REMINDER',
                  leagueId: league.id,
                  leagueName: league.name,
                  leagueImage: league.league_image || undefined,
                  roundInfo: `Round ${r.round_number}`,
                  message: `${r.status === 'submission' ? 'Submit' : 'Vote'} closes in ${pluralize(hours, 'hour')} — don\u2019t miss out`,
                  timestamp: Date.now() - 1000,
                  onTap: 'round',
                  roundId: r.id,
                });
              }

              if (r.status === 'submission' && !r.has_user_submitted) {
                const createdTs = parseTs(r.created_at);
                if (createdTs && Date.now() - createdTs < 2 * 86_400_000) {
                  items.push({
                    id: `sub-${r.id}`,
                    type: 'SUBMIT',
                    leagueId: league.id,
                    leagueName: league.name,
                    leagueImage: league.league_image || undefined,
                    roundInfo: `Round ${r.round_number}`,
                    message: `New round: \u201C${r.theme}\u201D`,
                    timestamp: createdTs,
                    onTap: 'round',
                    roundId: r.id,
                  });
                }
              }
            }
          }
        } catch {}
      }));

      // RESULT from my completed submissions
      for (const sub of mySubs) {
        if (sub.round_status !== 'completed' || sub.points === null || sub.points === undefined) continue;
        const ts = parseTs(sub.submitted_at);
        items.push({
          id: `res-${sub.submission_id}`,
          type: 'RESULT',
          leagueId: sub.league_id,
          leagueName: sub.league_name,
          leagueImage: sub.league_image || undefined,
          roundInfo: `Round ${sub.round_number}`,
          message: `You earned ${pluralize(sub.points ?? 0, 'point')} on \u201C${sub.song?.title ?? 'your song'}\u201D`,
          timestamp: ts,
          onTap: 'round',
          roundId: sub.round_id,
        });
      }

      // Merge with persisted cache. When a league is deleted by the creator
      // we want its notifications gone immediately — drop any cached notif
      // whose league no longer appears in the user's active league list.
      let cached: Notif[] = [];
      if (user?.id) {
        try {
          const raw = await AsyncStorage.getItem(notifCacheKey(user.id));
          if (raw) cached = JSON.parse(raw);
        } catch {}
      }

      const activeLeagueIds = new Set(leagueList.map(l => l.id));
      const byId = new Map<string, Notif>();
      // Fresh items take precedence (they have most recent data).
      for (const it of items) byId.set(it.id, it);
      // Cached items stay only if they're still within 3 days AND the
      // originating league hasn't been deleted.
      const cutoff = Date.now() - NOTIF_PERSIST_MS;
      for (const c of cached) {
        if (!byId.has(c.id) && c.timestamp >= cutoff && activeLeagueIds.has(c.leagueId)) {
          byId.set(c.id, c);
        }
      }

      // Hydrate thumbnails: prefer cached local photo, then fall back to the
      // server's durable league_snapshots record so deleted/never-seen
      // leagues still show their actual image instead of a question mark.
      const merged = [...byId.values()];
      if (user?.id) {
        await Promise.all(merged.map(async (n) => {
          if (n.leagueImage) return;
          const p = await getCachedLeaguePhoto(user.id, n.leagueId);
          if (p) { n.leagueImage = p; return; }
          try {
            const snap = await getLeagueSnapshot(n.leagueId);
            if (snap.data?.league_image) {
              n.leagueImage = snap.data.league_image;
              cacheLeaguePhoto(user.id, n.leagueId, snap.data.league_image);
            }
          } catch {}
        }));
      }

      merged.sort((a, b) => b.timestamp - a.timestamp);
      setNotifs(merged);

      // Persist the merged list back to AsyncStorage for next launch.
      if (user?.id) {
        try {
          const toStore = merged.filter(m => m.timestamp >= cutoff).slice(0, 100);
          await AsyncStorage.setItem(notifCacheKey(user.id), JSON.stringify(toStore));
        } catch {}
      }
    } catch (err) {
      console.error('Failed to build inbox:', err);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setActiveLeague(null);
      if (Date.now() - lastFetchTime.current > 30000) {
        fetchAll();
      }
    }, []),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const closeChat = () => {
    setActiveLeague(null);
    fetchAll();
  };

  const handleTap = (n: Notif) => {
    if (n.onTap === 'chat') {
      const league = leaguesList.find(l => l.id === n.leagueId);
      if (league) setActiveLeague(league);
    } else if (n.onTap === 'round' && n.roundId) {
      router.push(`/round/${n.roundId}`);
    } else {
      router.push(`/league/${n.leagueId}`);
    }
  };

  const handleDismiss = (n: Notif) => {
    // Remove from the displayed list and persist the dismissal so the notif
    // doesn't reappear on next fetch.
    const next = new Set(dismissed);
    next.add(n.id);
    setDismissed(next);
    persistDismissed(next);

    setNotifs(prev => {
      const updated = prev.filter(p => p.id !== n.id);
      if (user?.id) {
        const cutoff = Date.now() - NOTIF_PERSIST_MS;
        const toStore = updated.filter(m => m.timestamp >= cutoff).slice(0, 100);
        AsyncStorage.setItem(notifCacheKey(user.id), JSON.stringify(toStore)).catch(() => {});
      }
      return updated;
    });
  };

  if (activeLeague) {
    return (
      <SafeAreaView style={styles.container}>
        <SharedChat
          leagueId={activeLeague.id}
          leagueName={activeLeague.name}
          onClose={closeChat}
        />
      </SafeAreaView>
    );
  }

  if (loading && !dataLoaded.current) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>INBOX</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      </SafeAreaView>
    );
  }

  // Apply dismiss + filter
  const visibleNotifs = notifs
    .filter(n => !dismissed.has(n.id))
    .filter(n => {
      if (filter === 'ALL') return true;
      if (filter === 'RESULTS') return n.type === 'RESULT';
      return n.type === filter;
    });

  const renderRightActions = (progress: Animated.AnimatedInterpolation<number>, notif: Notif) => {
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [80, 0],
      extrapolate: 'clamp',
    });
    return (
      <Animated.View style={[styles.swipeActionWrap, { transform: [{ translateX }] }]}>
        <TouchableOpacity
          style={styles.trashBtn}
          onPress={() => handleDismiss(notif)}
          activeOpacity={0.8}
        >
          <Ionicons name="trash" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderNotif = ({ item }: { item: Notif }) => (
    <Swipeable
      renderRightActions={(p) => renderRightActions(p, item)}
      rightThreshold={40}
      friction={2}
      overshootRight={false}
    >
      <TouchableOpacity
        style={styles.notifCard}
        onPress={() => handleTap(item)}
        activeOpacity={0.75}
      >
        <View style={styles.notifIcon}>
          <LeagueAvatar image={item.leagueImage} size={40} imageBorderRadius={8} />
        </View>
        <View style={styles.notifBody}>
          <View style={styles.notifTopLine}>
            <Text style={[styles.notifType, { color: TYPE_COLORS[item.type] }]} numberOfLines={1}>
              {item.type}
              <Text style={styles.notifMeta}>
                {` · ${item.leagueName}`}
                {item.roundInfo ? ` · ${item.roundInfo}` : ''}
              </Text>
            </Text>
            <Text style={styles.notifTime}>{relativeTime(item.timestamp)}</Text>
          </View>
          <Text style={styles.notifMessage} numberOfLines={2}>
            {item.message}
          </Text>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>INBOX</Text>
          <Text style={styles.count}>{pluralize(visibleNotifs.length, 'item')}</Text>
        </View>

        {/* Filter tabs */}
        <View style={styles.filterRow}>
          {FILTER_TABS.map((item) => {
            const active = filter === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.filterTab, active && styles.filterTabActive]}
                onPress={() => setFilter(item.key)}
                activeOpacity={0.75}
              >
                <Text
                  style={[styles.filterTabText, active && styles.filterTabTextActive]}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {visibleNotifs.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="mail-outline" size={64} color="#7C3AED" />
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptyText}>
              Notifications about your leagues — rounds, votes, results, and chat — will show up here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={visibleNotifs}
            keyExtractor={(item) => item.id}
            renderItem={renderNotif}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" />}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  count: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B3B3B3',
    marginBottom: 4,
  },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // ── Filter tabs ──
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 6,
  },
  filterTab: {
    flex: 1,
    paddingHorizontal: 4,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterTabActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  filterTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B3B3B3',
    letterSpacing: 0.3,
  },
  filterTabTextActive: {
    color: '#FFFFFF',
  },

  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  notifCard: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    alignItems: 'center',
  },
  notifIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    overflow: 'hidden',
  },
  notifBody: {
    flex: 1,
    marginLeft: 12,
  },
  notifTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notifType: {
    flex: 1,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  notifMeta: {
    fontWeight: '500',
    color: '#B3B3B3',
    letterSpacing: 0,
    fontSize: 11,
  },
  notifTime: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6A6A6A',
    marginLeft: 8,
  },
  notifMessage: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 4,
    lineHeight: 19,
  },

  // ── Swipe trash action ──
  swipeActionWrap: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 16,
    marginBottom: 10,
  },
  trashBtn: {
    width: 60,
    height: '100%',
    backgroundColor: '#EF4444',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: '#FFFFFF', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#B3B3B3', textAlign: 'center', marginTop: 8, lineHeight: 20 },
});
