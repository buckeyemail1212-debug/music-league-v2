import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { getFollowCounts, getLeaderboard, FollowCounts } from '../../src/services/api';
import { apiCache } from '../../src/services/apiCache';
import StatsTab from '../../src/components/profile-tabs/StatsTab';
import LikedSongsTab from '../../src/components/profile-tabs/LikedSongsTab';
import ExpandableImage from '../../src/components/ExpandableImage';
import { FLOATING_NAV_CLEARANCE } from './_layout';

type TabKey = 'stats' | 'liked';

export default function ProfileScreen() {
  const { user } = useAuth();
  const router = useRouter();

  // Selected tab persists across re-renders within the session; reset
  // is intentional on full app relaunch so the default surface is the
  // headline Stats view.
  const [tab, setTab] = useState<TabKey>('stats');
  const [followCounts, setFollowCounts] = useState<FollowCounts | null>(null);
  const [ranking, setRanking] = useState<number | null>(null);

  const loadFollowCounts = useCallback(() => {
    const userId = user?.id;
    if (!userId) return;
    apiCache
      .swr(
        `follow-counts:${userId}`,
        () => getFollowCounts(userId).then((r) => r.data.data),
        setFollowCounts,
      )
      .then(setFollowCounts)
      .catch(() => {});
  }, [user?.id]);

  const loadRanking = useCallback(() => {
    getLeaderboard('all')
      .then((r) => setRanking(r.data.data.current_user_rank))
      .catch(() => {});
  }, []);

  useFocusEffect(useCallback(() => { loadFollowCounts(); loadRanking(); }, [loadFollowCounts, loadRanking]));

  const displayName = user?.display_name || user?.username || '';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Top bar — Settings gear in the top right. Replaces the old
            "MY GAME" header text entirely; the screen is now visually
            anchored by the avatar block below. */}
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => router.push('/settings' as any)}
            hitSlop={10}
            style={styles.gearBtn}
            accessibilityLabel="Open settings"
          >
            <Ionicons name="settings-outline" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Top row — avatar on the left, followers/following stats on
            the right, vertically centered. Avatar long-press still
            expands via ExpandableImage. */}
        <View style={styles.topRow}>
          <ExpandableImage source={user?.profile_photo ? { uri: user.profile_photo } : null}>
            <View style={styles.avatar}>
              {user?.profile_photo ? (
                <Image source={{ uri: user.profile_photo }} style={styles.avatarImg} />
              ) : (
                <Ionicons name="person" size={40} color="#7C3AED" />
              )}
            </View>
          </ExpandableImage>
          {user?.id ? (
            <View style={styles.statsRow}>
              <TouchableOpacity
                style={styles.statItem}
                activeOpacity={0.7}
                onPress={() => router.push(`/user/${user.id}/followers` as any)}
              >
                <Text style={styles.statValue}>
                  {followCounts ? followCounts.followers.toLocaleString() : '—'}
                </Text>
                <Text style={styles.statLabel}>followers</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.statItem}
                activeOpacity={0.7}
                onPress={() => router.push(`/user/${user.id}/following` as any)}
              >
                <Text style={styles.statValue}>
                  {followCounts ? followCounts.following.toLocaleString() : '—'}
                </Text>
                <Text style={styles.statLabel}>following</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.statItem}
                activeOpacity={0.7}
                onPress={() => router.push('/(tabs)/leaderboard' as any)}
              >
                <Text style={styles.statValue}>
                  {ranking != null ? `#${ranking}` : '—'}
                </Text>
                <Text style={styles.statLabel}>ranking</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {/* Identity — left-aligned handle + name + optional pronouns
            + optional bio. Spacing collapses cleanly when either of
            the optional fields is absent. */}
        <View style={styles.identityBlock}>
          <Text style={styles.handle}>@{user?.username ?? ''}</Text>
          <Text style={styles.displayName}>{displayName}</Text>
          {user?.pronouns ? (
            <Text style={styles.pronouns}>{user.pronouns}</Text>
          ) : null}
          {user?.bio ? (
            <Text style={styles.bio}>{user.bio}</Text>
          ) : null}
        </View>

        {/* Edit profile CTA */}
        <TouchableOpacity
          style={styles.editBtn}
          activeOpacity={0.85}
          onPress={() => router.push('/edit-profile' as any)}
        >
          <Text style={styles.editBtnText}>Edit Profile</Text>
        </TouchableOpacity>

        {/* Tab switcher — bar-chart / trophy / heart. Active icon flips
            to the filled variant + accent color; inactive stays muted. */}
        <View style={styles.tabBar}>
          <TabIcon
            iconActive="stats-chart"
            iconInactive="stats-chart-outline"
            active={tab === 'stats'}
            onPress={() => setTab('stats')}
            label="Stats"
          />
<TabIcon
            iconActive="heart"
            iconInactive="heart-outline"
            active={tab === 'liked'}
            onPress={() => setTab('liked')}
            label="Liked Songs"
          />
        </View>

        {/* Tab content */}
        <View style={styles.tabContent}>
          <View style={{ display: tab === 'stats' ? 'flex' : 'none' }}>
            <StatsTab />
          </View>
<View style={{ display: tab === 'liked' ? 'flex' : 'none' }}>
            <LikedSongsTab />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function TabIcon({
  iconActive,
  iconInactive,
  active,
  onPress,
  label,
}: {
  iconActive: React.ComponentProps<typeof Ionicons>['name'];
  iconInactive: React.ComponentProps<typeof Ionicons>['name'];
  active: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.tabItem, active && styles.tabItemActive]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityLabel={label}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <Ionicons
        name={active ? iconActive : iconInactive}
        size={22}
        color={active ? '#FFFFFF' : '#6A6A6A'}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  scroll: { paddingBottom: FLOATING_NAV_CLEARANCE },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  gearBtn: {
    minWidth: 40, minHeight: 40,
    alignItems: 'center', justifyContent: 'center',
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
    paddingRight: 20,
    paddingTop: 4,
  },
  avatar: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#181818',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 88, height: 88, borderRadius: 44 },

  statsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  statLabel: { fontSize: 13, color: '#B3B3B3', marginTop: 2 },

  identityBlock: {
    paddingHorizontal: 20,
    marginTop: 12,
  },
  handle: {
    fontSize: 13, color: '#B3B3B3',
    marginBottom: 2,
  },
  displayName: {
    fontSize: 15, fontWeight: '700', color: '#FFFFFF',
    marginBottom: 2,
  },
  pronouns: {
    fontSize: 13, color: '#B3B3B3',
  },
  bio: {
    fontSize: 14, color: '#FFFFFF',
    marginTop: 4,
  },

  editBtn: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  editBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },

  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.08)',
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    marginTop: 16,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    // Compensate for the parent's bottom border so the tab's active
    // underline sits flush with the divider.
    marginBottom: -0.5,
  },
  tabItemActive: { borderBottomColor: '#FFFFFF' },

  tabContent: { paddingTop: 12 },
});
