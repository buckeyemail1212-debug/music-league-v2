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
import { getFollowCounts, FollowCounts } from '../../src/services/api';
import { apiCache } from '../../src/services/apiCache';
import StatsTab from '../../src/components/profile-tabs/StatsTab';
import LeaguesTab from '../../src/components/profile-tabs/LeaguesTab';
import LikedSongsTab from '../../src/components/profile-tabs/LikedSongsTab';

type TabKey = 'stats' | 'leagues' | 'liked';

export default function ProfileScreen() {
  const { user } = useAuth();
  const router = useRouter();

  // Selected tab persists across re-renders within the session; reset
  // is intentional on full app relaunch so the default surface is the
  // headline Stats view.
  const [tab, setTab] = useState<TabKey>('stats');
  const [followCounts, setFollowCounts] = useState<FollowCounts | null>(null);

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

  useFocusEffect(useCallback(() => { loadFollowCounts(); }, [loadFollowCounts]));

  const displayName = user?.username || user?.display_name || '';

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

        {/* Identity block — avatar, username, pronouns, bio. Pronouns
            and bio render only when set; the block collapses cleanly
            without them. */}
        <View style={styles.identity}>
          <View style={styles.avatar}>
            {user?.profile_photo ? (
              <Image source={{ uri: user.profile_photo }} style={styles.avatarImg} />
            ) : (
              <Ionicons name="person" size={52} color="#7C3AED" />
            )}
          </View>
          <Text style={styles.username}>@{displayName}</Text>
          {user?.pronouns ? (
            <Text style={styles.pronouns}>{user.pronouns}</Text>
          ) : null}
          {user?.bio ? (
            <Text style={styles.bio}>{user.bio}</Text>
          ) : null}
        </View>

        {/* Follower / following counts — tap to open list screens. */}
        {user?.id ? (
          <View style={styles.countsRow}>
            <TouchableOpacity
              style={styles.countItem}
              activeOpacity={0.7}
              onPress={() => router.push(`/user/${user.id}/followers` as any)}
            >
              <Text style={styles.countValue}>
                {followCounts ? followCounts.followers.toLocaleString() : '—'}
              </Text>
              <Text style={styles.countLabel}>Followers</Text>
            </TouchableOpacity>
            <View style={styles.countDivider} />
            <TouchableOpacity
              style={styles.countItem}
              activeOpacity={0.7}
              onPress={() => router.push(`/user/${user.id}/following` as any)}
            >
              <Text style={styles.countValue}>
                {followCounts ? followCounts.following.toLocaleString() : '—'}
              </Text>
              <Text style={styles.countLabel}>Following</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Edit profile CTA */}
        <TouchableOpacity
          style={styles.editBtn}
          activeOpacity={0.85}
          onPress={() => router.push('/edit-profile' as any)}
        >
          <Text style={styles.editBtnText}>Edit profile</Text>
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
            iconActive="trophy"
            iconInactive="trophy-outline"
            active={tab === 'leagues'}
            onPress={() => setTab('leagues')}
            label="Leagues"
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
          {tab === 'stats' ? <StatsTab /> : null}
          {tab === 'leagues' ? <LeaguesTab /> : null}
          {tab === 'liked' ? <LikedSongsTab /> : null}
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
  scroll: { paddingBottom: 48 },

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

  identity: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },
  avatar: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#181818',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 120, height: 120, borderRadius: 60 },
  username: {
    fontSize: 22, fontWeight: '800', color: '#FFFFFF',
    marginTop: 12,
  },
  pronouns: {
    fontSize: 13, color: '#B3B3B3',
    marginTop: 4,
  },
  bio: {
    fontSize: 13, color: '#D9D9D9',
    marginTop: 6, textAlign: 'center', lineHeight: 18,
    paddingHorizontal: 12,
  },

  countsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 28, marginTop: 8, marginBottom: 12,
  },
  countItem: { alignItems: 'center', minWidth: 80 },
  countValue: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  countLabel: {
    fontSize: 11, fontWeight: '700', color: '#B3B3B3',
    letterSpacing: 0.8, marginTop: 2, textTransform: 'uppercase',
  },
  countDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.1)' },

  editBtn: {
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: 'center',
  },
  editBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.08)',
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    marginTop: 4,
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
