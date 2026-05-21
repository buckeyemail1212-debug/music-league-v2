import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
  ActionSheetIOS,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import {
  blockUser,
  followUser,
  getFollowStatus,
  getUserProfile,
  unfollowUser,
  FollowStatus,
  UserProfileResponse,
} from '../../src/services/api';
import { apiCache } from '../../src/services/apiCache';
import UserStatsTab from '../../src/components/user-profile-tabs/UserStatsTab';
import UserLeaguesTab from '../../src/components/user-profile-tabs/UserLeaguesTab';
import UserLikedSongsTab from '../../src/components/user-profile-tabs/UserLikedSongsTab';
import ExpandableImage from '../../src/components/ExpandableImage';

type TabKey = 'stats' | 'leagues' | 'liked';

const PROFILE_TTL_MS = 60 * 1000;

const profileCacheKey = (targetId: string, viewerId: string) =>
  `user-profile:${targetId}:${viewerId}`;
const statusCacheKey = (targetId: string, viewerId: string) =>
  `user-follow-status:${targetId}:${viewerId}`;

const SUBMISSION_COLORS = ['#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899'];
const pickColor = (seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) >>> 0;
  return SUBMISSION_COLORS[h % SUBMISSION_COLORS.length];
};

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const targetId = id ?? '';
  const viewerId = user?.id ?? '';

  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [followStatus, setFollowStatus] = useState<FollowStatus | null>(null);
  const [loadError, setLoadError] = useState<'notfound' | 'network' | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<TabKey>('stats');

  // Self-redirect: bounce to the own-profile tab if the viewer landed
  // on their own /user/{id}. router.replace, not push.
  useEffect(() => {
    if (targetId && viewerId && targetId === viewerId) {
      router.replace('/(tabs)/profile' as any);
    }
  }, [targetId, viewerId, router]);

  const load = useCallback(() => {
    if (!targetId || !viewerId) return;
    if (targetId === viewerId) return;

    setLoadError(null);

    apiCache
      .swr(
        profileCacheKey(targetId, viewerId),
        () => getUserProfile(targetId).then((r) => r.data.data),
        setProfile,
        PROFILE_TTL_MS,
      )
      .then(setProfile)
      .catch((err) => {
        // Block-silent-404 and genuine 404 are indistinguishable from
        // here — both land on the same "User not found" branch per spec.
        if (err?.response?.status === 404) setLoadError('notfound');
        else setLoadError((prev) => prev ?? 'network');
      });

    apiCache
      .swr(
        statusCacheKey(targetId, viewerId),
        () => getFollowStatus(targetId).then((r) => r.data.data.status),
        setFollowStatus,
        PROFILE_TTL_MS,
      )
      .then(setFollowStatus)
      .catch(() => {
        // Status is best-effort; the button degrades to "Follow" if
        // we never get it.
      });
  }, [targetId, viewerId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Backend follow-status returning "self" is a redundant safety net
  // for the id-equality redirect above.
  useEffect(() => {
    if (followStatus === 'self') {
      router.replace('/(tabs)/profile' as any);
    }
  }, [followStatus, router]);

  const invalidateAfterFollowChange = () => {
    apiCache.invalidate(profileCacheKey(targetId, viewerId));
    apiCache.invalidate(statusCacheKey(targetId, viewerId));
  };

  const doFollow = async () => {
    if (busy) return;
    setBusy(true);
    const optimistic: FollowStatus = profile?.is_private ? 'pending' : 'approved';
    setFollowStatus(optimistic);
    try {
      const res = await followUser(targetId);
      setFollowStatus(res.data.data.status);
      invalidateAfterFollowChange();
      load();
    } catch {
      setFollowStatus('none');
      Alert.alert('Could not follow', 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const doUnfollow = async (confirmCopy: { title: string; message: string }) => {
    if (busy) return;
    Alert.alert(confirmCopy.title, confirmCopy.message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'OK',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          const prev = followStatus;
          setFollowStatus('none');
          try {
            await unfollowUser(targetId);
            invalidateAfterFollowChange();
            load();
          } catch {
            setFollowStatus(prev);
            Alert.alert('Could not update', 'Please try again.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const onFollowButtonPress = () => {
    if (!followStatus) return;
    if (followStatus === 'none') return doFollow();
    if (followStatus === 'approved') {
      return doUnfollow({
        title: `Unfollow @${profile?.username ?? ''}?`,
        message: 'You’ll need to follow them again to see their game.',
      });
    }
    if (followStatus === 'pending') {
      return doUnfollow({
        title: 'Cancel follow request?',
        message: `Your request to follow @${profile?.username ?? ''} will be withdrawn.`,
      });
    }
  };

  // ── menu (3-dot) ───────────────────────────────────────────────────

  const confirmBlock = () => {
    if (!profile) return;
    const username = profile.username;
    Alert.alert(
      `Block @${username}?`,
      `They won't be able to see your profile or join leagues with you. You can unblock from Settings.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await blockUser(profile.user_id);
            } catch (e: any) {
              // 409 = active-shared-league rule. Surface the exact
              // backend message so the user knows what to do.
              if (e?.response?.status === 409 && e?.response?.data?.detail) {
                Alert.alert('Could not block', e.response.data.detail);
              } else {
                Alert.alert(
                  'Could not block',
                  e?.response?.data?.detail || 'Please try again.',
                );
              }
              return;
            }
            // Invalidate every cache that could be showing target's
            // data to this viewer, plus the viewer's Settings list.
            apiCache.invalidate(profileCacheKey(profile.user_id, viewerId));
            apiCache.invalidate(statusCacheKey(profile.user_id, viewerId));
            apiCache.invalidate(`user-followers:${profile.user_id}:${viewerId}`);
            apiCache.invalidate(`user-following:${profile.user_id}:${viewerId}`);
            apiCache.invalidate(`user-leagues:${profile.user_id}:${viewerId}`);
            apiCache.invalidate(`user-liked-songs:${profile.user_id}:${viewerId}`);
            apiCache.invalidate(`blocked-users:${viewerId}`);
            Alert.alert('Blocked', `Blocked @${username}.`);
            // Leave the now-blocked profile in place — they'd see 404
            // on a refresh anyway, so back-out is the clean exit.
            router.back();
          },
        },
      ],
    );
  };

  const buildMenuOptions = (): {
    label: string;
    onPress: () => void;
    destructive?: boolean;
  }[] => {
    if (!profile) return [];
    const username = profile.username;
    const opts: { label: string; onPress: () => void; destructive?: boolean }[] = [];

    // Order: the non-destructive follow-state action comes first
    // (Unfollow / Cancel request), then the destructive Block. Limited
    // view follows the same logic — 'approved' isn't possible there.
    if (followStatus === 'approved') {
      opts.push({
        label: `Unfollow @${username}`,
        onPress: () =>
          doUnfollow({
            title: `Unfollow @${username}?`,
            message: 'You’ll need to follow them again to see their game.',
          }),
      });
    } else if (followStatus === 'pending') {
      opts.push({
        label: 'Cancel request',
        onPress: () =>
          doUnfollow({
            title: `Cancel follow request to @${username}?`,
            message: '',
          }),
      });
    }

    opts.push({
      label: `Block @${username}`,
      onPress: confirmBlock,
      destructive: true,
    });

    return opts;
  };

  const handleMenuPress = () => {
    const options = buildMenuOptions();
    if (options.length === 0) return;
    const username = profile?.username ?? '';
    if (Platform.OS === 'ios') {
      // Native bottom sheet — matches the photo-picker pattern
      // already used elsewhere in the app (settings.tsx).
      const labels = [...options.map((o) => o.label), 'Cancel'];
      const cancelButtonIndex = labels.length - 1;
      const destructiveButtonIndex = options.findIndex((o) => o.destructive);
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: `@${username}`,
          options: labels,
          cancelButtonIndex,
          destructiveButtonIndex: destructiveButtonIndex >= 0 ? destructiveButtonIndex : undefined,
        },
        (i) => {
          if (i === cancelButtonIndex || i === undefined) return;
          options[i]?.onPress();
        },
      );
    } else {
      // Android falls back to Alert — same pattern as the photo
      // picker. Alert button order matches iOS sheet for parity.
      Alert.alert(
        `@${username}`,
        '',
        [
          ...options.map((o) => ({
            text: o.label,
            style: o.destructive ? ('destructive' as const) : undefined,
            onPress: o.onPress,
          })),
          { text: 'Cancel', style: 'cancel' as const },
        ],
      );
    }
  };

  // The 3-dot menu only makes sense once we know who we're looking at
  // AND we're not on a self view. Self never reaches this branch
  // because of the redirect above, but the defensive guard stays.
  // followStatus may still be null (in flight) — Block is always
  // available, so we show the menu and let buildMenuOptions decide.
  const menuVisible = !!profile && followStatus !== 'self';

  // ── render branches ────────────────────────────────────────────────

  if (loadError === 'notfound') {
    return (
      <SafeAreaView style={styles.container}>
        <Header onBack={() => router.back()} />
        <View style={styles.centerPad}>
          <Ionicons name="person-outline" size={48} color="#6A6A6A" />
          <Text style={styles.errorTitle}>User not found</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => router.back()}>
            <Text style={styles.retryBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loadError === 'network' && !profile) {
    return (
      <SafeAreaView style={styles.container}>
        <Header onBack={() => router.back()} />
        <View style={styles.centerPad}>
          <Ionicons name="cloud-offline-outline" size={48} color="#6A6A6A" />
          <Text style={styles.errorTitle}>Couldn&rsquo;t load profile</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryBtnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.container}>
        <Header onBack={() => router.back()} />
        <View style={styles.centerPad}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      </SafeAreaView>
    );
  }

  const followBtn = (() => {
    if (followStatus === null || followStatus === 'self') return null;
    const primary = followStatus === 'none';
    const label =
      followStatus === 'none'
        ? 'Follow'
        : followStatus === 'pending'
          ? 'Requested'
          : 'Following';
    return (
      <TouchableOpacity
        style={[styles.followBtn, primary ? styles.followBtnPrimary : styles.followBtnSecondary]}
        onPress={onFollowButtonPress}
        activeOpacity={0.8}
        disabled={busy}
      >
        <Text
          style={[
            styles.followBtnLabel,
            primary ? styles.followBtnLabelPrimary : styles.followBtnLabelSecondary,
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  })();

  return (
    <SafeAreaView style={styles.container}>
      <Header
        onBack={() => router.back()}
        onMenu={menuVisible ? handleMenuPress : undefined}
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Identity block */}
        <View style={styles.identity}>
          {/* Avatar tap is a no-op; long-press expands to a full-size
              modal via ExpandableImage. */}
          <ExpandableImage source={profile.avatar_url ? { uri: profile.avatar_url } : null}>
            <View style={[styles.bigAvatar, { backgroundColor: pickColor(profile.user_id) }]}>
              {profile.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.bigAvatarImg} />
              ) : (
                <Text style={styles.bigAvatarInitial}>
                  {(profile.username || '?').charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
          </ExpandableImage>
          <Text style={styles.username}>@{profile.username}</Text>
          {profile.pronouns ? (
            <Text style={styles.pronouns}>{profile.pronouns}</Text>
          ) : null}
          {profile.bio ? (
            <Text style={styles.bio}>{profile.bio}</Text>
          ) : null}
        </View>

        {/* Counts row */}
        <View style={styles.countsRow}>
          <TouchableOpacity
            style={styles.countItem}
            activeOpacity={0.7}
            onPress={() => router.push(`/user/${profile.user_id}/followers` as any)}
          >
            <Text style={styles.countValue}>{profile.follower_count.toLocaleString()}</Text>
            <Text style={styles.countLabel}>Followers</Text>
          </TouchableOpacity>
          <View style={styles.countDivider} />
          <TouchableOpacity
            style={styles.countItem}
            activeOpacity={0.7}
            onPress={() => router.push(`/user/${profile.user_id}/following` as any)}
          >
            <Text style={styles.countValue}>{profile.following_count.toLocaleString()}</Text>
            <Text style={styles.countLabel}>Following</Text>
          </TouchableOpacity>
        </View>

        {followBtn}

        {profile.is_limited ? (
          /* Private + not-approved: lock surface in place of tabs.
             Follow button above already lets the viewer send the
             follow request. */
          <View style={styles.lockBox}>
            <Ionicons name="lock-closed-outline" size={48} color="#B3B3B3" />
            <Text style={styles.lockTitle}>This account is private.</Text>
            <Text style={styles.lockBody}>
              Follow @{profile.username} to see their game.
            </Text>
          </View>
        ) : (
          <>
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

            <View style={styles.tabContent}>
              {tab === 'stats' ? <UserStatsTab profile={profile} /> : null}
              {tab === 'leagues' ? (
                <UserLeaguesTab targetId={profile.user_id} viewerId={viewerId} />
              ) : null}
              {tab === 'liked' ? (
                <UserLikedSongsTab targetId={profile.user_id} viewerId={viewerId} />
              ) : null}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({
  onBack,
  onMenu,
}: {
  onBack: () => void;
  onMenu?: () => void;
}) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} hitSlop={8} style={styles.headerBtn}>
        <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
      </TouchableOpacity>
      <View style={styles.headerActions}>
        {onMenu ? (
          <TouchableOpacity hitSlop={8} style={styles.headerBtn} onPress={onMenu}>
            <Ionicons name="ellipsis-horizontal" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        ) : (
          // Preserve the header's right-side width when the menu is
          // hidden (e.g., loading / 404) so the back chevron stays in
          // the same visual position.
          <View style={styles.headerBtn} />
        )}
      </View>
    </View>
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

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerBtn: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  identity: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },
  bigAvatar: {
    width: 120, height: 120, borderRadius: 60,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  bigAvatarImg: { width: 120, height: 120, borderRadius: 60 },
  bigAvatarInitial: { fontSize: 48, fontWeight: '800', color: '#FFFFFF' },
  username: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginTop: 12 },
  pronouns: { fontSize: 13, color: '#B3B3B3', marginTop: 4 },
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

  followBtn: {
    marginHorizontal: 20,
    marginBottom: 14,
    paddingVertical: 11,
    borderRadius: 999,
    alignItems: 'center',
  },
  followBtnPrimary: { backgroundColor: '#7C3AED' },
  followBtnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  followBtnLabel: { fontSize: 14, fontWeight: '800', letterSpacing: 0.4 },
  followBtnLabelPrimary: { color: '#FFFFFF' },
  followBtnLabelSecondary: { color: '#FFFFFF' },

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
    marginBottom: -0.5,
  },
  tabItemActive: { borderBottomColor: '#FFFFFF' },

  tabContent: { paddingTop: 12 },

  lockBox: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 48,
    paddingBottom: 24,
    gap: 8,
  },
  lockTitle: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', marginTop: 8 },
  lockBody: { fontSize: 13, color: '#B3B3B3', textAlign: 'center' },

  centerPad: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingHorizontal: 24,
  },
  errorTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 24, paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#7C3AED',
  },
  retryBtnText: { color: '#FFFFFF', fontWeight: '800' },
});
