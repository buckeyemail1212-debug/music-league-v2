import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useInboxData } from '../../src/context/InboxDataContext';
import { hideConversation, getMyFollowRequests, DmConversation, InboxFeedItem } from '../../src/services/api';
import { markCategoryViewed } from '../../src/services/inboxReadState';
import { setPendingInboxCategory, InboxCategoryItem } from '../../src/services/pendingInboxCategory';
import { FLOATING_NAV_CLEARANCE } from './_layout';

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

function relativeTime(ts: number): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d`;
  return `${Math.floor(diff / (7 * 86_400_000))}w`;
}

export default function InboxScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const userId = user?.id ?? '';
  const { notifs, serverNotifs, conversations, categoryViews, loading, refresh } = useInboxData();

  const [refreshing, setRefreshing] = useState(false);
  const [pendingRequests, setPendingRequests] = useState(0);
  const navigatingRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      navigatingRef.current = false;
      refresh();
    }, [refresh]),
  );

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const res = await getMyFollowRequests();
          setPendingRequests(res.data.data.total ?? res.data.data.users.length);
        } catch {
          // leave the count unchanged on error
        }
      })();
    }, []),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const openDmConversation = (conv: DmConversation) => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    router.push({
      pathname: '/dm/[id]',
      params: {
        id: conv.id,
        username: conv.other_user.username,
        avatar: conv.other_user.avatar_url ?? '',
        otherUserId: conv.other_user.user_id,
      },
    });
    setTimeout(() => { navigatingRef.current = false; }, 800);
  };

  const handleHideConversation = async (convId: string) => {
    try {
      await hideConversation(convId);
      await refresh();
    } catch {
      Alert.alert('Could not hide conversation', 'Please try again.');
    }
  };

  const handleTap = (n: InboxFeedItem) => {
    if (n.onTap === 'chat') {
      router.push(`/league-chat?leagueId=${n.leagueId}&leagueName=${encodeURIComponent(n.leagueName)}`);
    } else if (n.onTap === 'round' && n.roundId) {
      router.push(`/round/${n.roundId}`);
    } else {
      router.push(`/league/${n.leagueId}`);
    }
  };

  const handleCategoryPress = async (catKey: string, catLabel: string) => {
    if (navigatingRef.current) return;

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
          text: n.leagueName ? `${n.leagueName} — ${n.message}` : n.message,
          timestamp: n.timestamp,
          tapType: n.roundId ? 'round' as const : 'none' as const,
          tapId: n.roundId,
        }));
    } else if (catKey === 'reminders') {
      items = notifs
        .filter(n => n.type === 'REMINDER' || n.type === 'SUBMIT')
        .map(n => ({
          id: n.id,
          text: n.leagueName ? `${n.leagueName} — ${n.message}` : n.message,
          timestamp: n.timestamp,
          tapType: n.roundId ? 'round' as const : 'none' as const,
          tapId: n.roundId,
        }));
    } else if (catKey === 'league') {
      items = notifs
        .filter(n => n.type === 'COMMENT')
        .map(n => ({
          id: n.id,
          text: n.leagueName ? `${n.leagueName} — ${n.message}` : n.message,
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
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    setPendingInboxCategory({ category: catKey, label: catLabel, items });
    router.push('/inbox-category');
    // Bookkeeping after navigation — do not block the push on these.
    markCategoryViewed(userId, catKey).catch(() => {});
    refresh();
  };

  const categoryData = useMemo(() => {
    return CATEGORIES.map(cat => {
      let feedItems: { message: string; timestamp: number; leagueName?: string }[] = [];

      if (cat.key === 'follows') {
        feedItems = serverNotifs
          .filter(n => n.category === 'follows')
          .map(n => ({ message: n.body, timestamp: parseTs(n.created_at) }));
      } else if (cat.key === 'results') {
        feedItems = notifs
          .filter(n => n.type === 'RESULT')
          .map(n => ({ message: n.message, timestamp: n.timestamp, leagueName: n.leagueName }));
      } else if (cat.key === 'reminders') {
        feedItems = notifs
          .filter(n => n.type === 'REMINDER' || n.type === 'SUBMIT')
          .map(n => ({ message: n.message, timestamp: n.timestamp, leagueName: n.leagueName }));
      } else if (cat.key === 'league') {
        feedItems = notifs
          .filter(n => n.type === 'COMMENT')
          .map(n => ({ message: n.message, timestamp: n.timestamp, leagueName: n.leagueName }));
      } else if (cat.key === 'system') {
        feedItems = serverNotifs
          .filter(n => n.category === 'system')
          .map(n => ({ message: n.body, timestamp: parseTs(n.created_at) }));
      }

      feedItems.sort((a, b) => b.timestamp - a.timestamp);

      const top = feedItems[0];
      const preview = top
        ? (top.leagueName ? `${top.leagueName} — ${top.message}` : top.message)
        : 'No activity yet';

      const lastViewed = categoryViews[cat.key] ?? 0;
      const count = cat.key === 'reminders'
        ? 0
        : feedItems.filter(it => it.timestamp > lastViewed).length;

      return {
        ...cat,
        count,
        preview,
      };
    });
  }, [notifs, serverNotifs, categoryViews]);

  if (loading && notifs.length === 0 && serverNotifs.length === 0 && conversations.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Inbox</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      </SafeAreaView>
    );
  }

  const renderSwipeActions = (progress: Animated.AnimatedInterpolation<number>, convId: string) => {
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [80, 0],
      extrapolate: 'clamp',
    });
    return (
      <Animated.View style={[styles.swipeActionWrap, { transform: [{ translateX }] }]}>
        <TouchableOpacity
          style={styles.trashBtn}
          onPress={() => handleHideConversation(convId)}
          activeOpacity={0.8}
        >
          <Ionicons name="trash" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Inbox</Text>
        <TouchableOpacity onPress={() => router.push('/new-message' as any)} hitSlop={8}>
          <Ionicons name="create-outline" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" />}
        showsVerticalScrollIndicator={false}
      >
        {pendingRequests > 0 && (
          <TouchableOpacity
            style={styles.categoryRow}
            onPress={() => router.push('/follow-requests')}
            activeOpacity={0.7}
          >
            <View style={[styles.categoryIcon, { backgroundColor: '#7C3AED' }]}>
              <Ionicons name="person-add" size={24} color="#FFFFFF" />
            </View>
            <View style={styles.categoryBody}>
              <Text style={styles.categoryLabel}>Follow Requests</Text>
              <Text style={styles.categoryPreview} numberOfLines={1}>
                {`${pendingRequests} pending`}
              </Text>
            </View>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{pendingRequests}</Text>
            </View>
          </TouchableOpacity>
        )}

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

        <Text style={styles.sectionHeader}>Messages</Text>
        {conversations.length === 0 ? (
          <Text style={styles.dmEmpty}>No messages yet.</Text>
        ) : (
          conversations.map(conv => (
            <Swipeable
              key={conv.id}
              renderRightActions={(p) => renderSwipeActions(p, conv.id)}
              rightThreshold={40}
              friction={2}
              overshootRight={false}
            >
              <TouchableOpacity
                style={styles.dmRow}
                activeOpacity={0.7}
                onPress={() => openDmConversation(conv)}
              >
                {conv.other_user.avatar_url ? (
                  <Image source={{ uri: conv.other_user.avatar_url }} style={styles.dmAvatar} />
                ) : (
                  <View style={[styles.dmAvatar, styles.dmAvatarFallback]}>
                    <Text style={styles.dmAvatarInitial}>
                      {(conv.other_user.username || '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.dmBody}>
                  <Text style={styles.dmUsername}>{conv.other_user.username}</Text>
                  <Text style={styles.dmPreview} numberOfLines={1}>
                    {conv.last_message_text || 'No messages yet'}
                  </Text>
                </View>
                <View style={styles.dmRight}>
                  <Text style={styles.dmTime}>{relativeTime(parseTs(conv.last_message_at))}</Text>
                  {conv.unread_count > 0 && (
                    <View style={styles.dmUnreadBadge}>
                      <Text style={styles.dmUnreadText}>{conv.unread_count}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            </Swipeable>
          ))
        )}
      </ScrollView>
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
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: FLOATING_NAV_CLEARANCE,
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
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 10,
  },
  dmEmpty: {
    fontSize: 14,
    color: '#8E8E93',
    paddingVertical: 8,
  },
  dmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  dmAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  dmAvatarFallback: {
    backgroundColor: '#3E3E3E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dmAvatarInitial: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dmBody: {
    flex: 1,
    marginLeft: 12,
  },
  dmUsername: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  dmPreview: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  dmRight: {
    alignItems: 'flex-end',
    marginLeft: 8,
    gap: 6,
  },
  dmTime: {
    fontSize: 12,
    color: '#8E8E93',
  },
  dmUnreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  dmUnreadText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  swipeActionWrap: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 4,
    marginBottom: 8,
  },
  trashBtn: {
    width: 56,
    height: '100%',
    backgroundColor: '#EF4444',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
