import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import {
  getLeagues,
  getLeagueMessages,
  getRounds,
  getMySubmissions,
  getNotifications,
  Round,
  MySubmission,
  AppNotification,
} from '../../src/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { pluralize } from '../../src/utils/pluralize';
import { setPendingInboxCategory, InboxCategoryItem } from '../../src/services/pendingInboxCategory';

type NotifType = 'COMMENT' | 'RESULT' | 'REMINDER' | 'ACTIVITY' | 'SUBMIT';

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

const CATEGORIES = [
  { key: 'follows', label: 'New followers', icon: 'people' as const, color: '#3B82F6' },
  { key: 'results', label: 'Round results', icon: 'trophy' as const, color: '#F59E0B' },
  { key: 'reminders', label: 'Reminders', icon: 'alarm' as const, color: '#EF4444' },
  { key: 'league', label: 'League activity', icon: 'musical-notes' as const, color: '#10B981' },
  { key: 'system', label: 'System', icon: 'information-circle' as const, color: '#6B7280' },
];

function parseTs(s?: string | null): number {
  if (!s) return 0;
  const t = new Date(s.endsWith('Z') || s.includes('+') ? s : s + 'Z').getTime();
  return isNaN(t) ? 0 : t;
}

const leaguePhotoKey = (userId: string, leagueId: string) =>
  `league_image_${userId}_${leagueId}`;

async function cacheLeaguePhoto(userId: string, leagueId: string, photo?: string | null) {
  if (!userId || !leagueId || !photo) return;
  try {
    await AsyncStorage.setItem(leaguePhotoKey(userId, leagueId), photo);
  } catch {}
}

export default function InboxScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [serverNotifs, setServerNotifs] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const lastFetchTime = useRef<number>(0);
  const dataLoaded = useRef(false);

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
                  message: `${r.status === 'submission' ? 'Submission' : 'Voting'} closes in ${pluralize(hours, 'hour')} — don’t miss out`,
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
                    message: (r.theme || '').trim()
                      ? `New round in ${league.name}: “${(r.theme || '').trim()}”`
                      : `Submit a song to ${league.name}`,
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
          message: `You earned ${pluralize(sub.points ?? 0, 'point')} on “${sub.song?.title ?? 'your song'}”`,
          timestamp: ts,
          onTap: 'round',
          roundId: sub.round_id,
        });
      }

      items.sort((a, b) => b.timestamp - a.timestamp);
      setNotifs(items);

      // Fetch server notifications
      try {
        const notifRes = await getNotifications();
        setServerNotifs(notifRes.data?.data?.notifications ?? []);
      } catch {
        setServerNotifs([]);
      }
    } catch (err) {
      console.error('Failed to build inbox:', err);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
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

  const handleTap = (n: Notif) => {
    if (n.onTap === 'chat') {
      router.push(`/league-chat?leagueId=${n.leagueId}&leagueName=${encodeURIComponent(n.leagueName)}`);
    } else if (n.onTap === 'round' && n.roundId) {
      router.push(`/round/${n.roundId}`);
    } else {
      router.push(`/league/${n.leagueId}`);
    }
  };

  const handleCategoryPress = (catKey: string, catLabel: string) => {
    let items: InboxCategoryItem[] = [];

    if (catKey === 'follows') {
      items = serverNotifs
        .filter(n => n.category === 'follows')
        .map(n => ({
          id: n.id,
          text: n.body,
          timestamp: parseTs(n.created_at),
          tapType: 'user' as const,
          tapId: n.actor_id ?? undefined,
        }));
    } else if (catKey === 'results') {
      items = notifs
        .filter(n => n.type === 'RESULT')
        .map(n => ({
          id: n.id,
          text: n.message,
          timestamp: n.timestamp,
          tapType: n.roundId ? 'round' as const : 'none' as const,
          tapId: n.roundId,
        }));
    } else if (catKey === 'reminders') {
      items = notifs
        .filter(n => n.type === 'REMINDER' || n.type === 'SUBMIT')
        .map(n => ({
          id: n.id,
          text: n.message,
          timestamp: n.timestamp,
          tapType: n.roundId ? 'round' as const : 'none' as const,
          tapId: n.roundId,
        }));
    } else if (catKey === 'league') {
      items = notifs
        .filter(n => n.type === 'COMMENT')
        .map(n => ({
          id: n.id,
          text: n.message,
          timestamp: n.timestamp,
          tapType: 'chat' as const,
          tapId: n.leagueId,
          tapLabel: n.leagueName,
        }));
    } else if (catKey === 'system') {
      items = serverNotifs
        .filter(n => n.category === 'system')
        .map(n => ({
          id: n.id,
          text: n.body,
          timestamp: parseTs(n.created_at),
          tapType: 'none' as const,
        }));
    }

    items.sort((a, b) => b.timestamp - a.timestamp);
    setPendingInboxCategory({ category: catKey, label: catLabel, items });
    router.push('/inbox-category');
  };

  const categoryData = useMemo(() => {
    return CATEGORIES.map(cat => {
      let feedItems: { message: string; timestamp: number }[] = [];

      if (cat.key === 'follows') {
        feedItems = serverNotifs
          .filter(n => n.category === 'follows')
          .map(n => ({ message: n.body, timestamp: parseTs(n.created_at) }));
      } else if (cat.key === 'results') {
        feedItems = notifs
          .filter(n => n.type === 'RESULT')
          .map(n => ({ message: n.message, timestamp: n.timestamp }));
      } else if (cat.key === 'reminders') {
        feedItems = notifs
          .filter(n => n.type === 'REMINDER' || n.type === 'SUBMIT')
          .map(n => ({ message: n.message, timestamp: n.timestamp }));
      } else if (cat.key === 'league') {
        feedItems = notifs
          .filter(n => n.type === 'COMMENT')
          .map(n => ({ message: n.message, timestamp: n.timestamp }));
      } else if (cat.key === 'system') {
        feedItems = serverNotifs
          .filter(n => n.category === 'system')
          .map(n => ({ message: n.body, timestamp: parseTs(n.created_at) }));
      }

      feedItems.sort((a, b) => b.timestamp - a.timestamp);

      return {
        ...cat,
        count: feedItems.length,
        preview: feedItems[0]?.message || 'No activity yet',
      };
    });
  }, [notifs, serverNotifs]);

  if (loading && !dataLoaded.current) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>INBOX</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>INBOX</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" />}
        showsVerticalScrollIndicator={false}
      >
        {categoryData.map(cat => (
          <TouchableOpacity
            key={cat.key}
            style={styles.categoryRow}
            onPress={() => handleCategoryPress(cat.key, cat.label)}
            activeOpacity={0.7}
          >
            <View style={[styles.categoryIcon, { backgroundColor: cat.color }]}>
              <Ionicons name={cat.icon} size={24} color="#FFFFFF" />
            </View>
            <View style={styles.categoryBody}>
              <Text style={styles.categoryLabel}>{cat.label}</Text>
              <Text style={styles.categoryPreview} numberOfLines={1}>
                {cat.preview}
              </Text>
            </View>
            {cat.count > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{cat.count}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
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
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryBody: {
    flex: 1,
    marginLeft: 14,
  },
  categoryLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  categoryPreview: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  countText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
