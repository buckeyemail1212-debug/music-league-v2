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
  removeFollower,
  startConversation,
  FollowStatus,
  UserProfileResponse,
} from '../../src/services/api';
import { apiCache } from '../../src/services/apiCache';
import UserStatsTab from '../../src/components/user-profile-tabs/UserStatsTab';
import UserLikedSongsTab from '../../src/components/user-profile-tabs/UserLikedSongsTab';
import ExpandableImage from '../../src/components/ExpandableImage';
import { colors } from '../../src/theme/colors';

type TabKey = 'stats' | 'liked';

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
    apiCache.invalidate(`follow-counts:${viewerId}`);
    apiCache.invalidate(`user-following:${viewerId}:${viewerId}`);
    apiCache.invalidate(`user-followers:${viewerId}:${viewerId}`);
    apiCache.invalidate(`user-followers:${targetId}:${viewerId}`);
    apiCache.invalidate(`user-following:${targetId}:${viewerId}`);
  };

  const doFollow = async () => {
    if (busy) return;
    setBusy(true);
    const optimistic: FollowStatus = profile?.is_private
      ? 'requested'
      : (followStatus === 'follows_you' ? 'friends' : 'following');
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
          setFollowStatus(followStatus === 'friends' ? 'follows_you' : 'none');
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
    if (followStatus === 'none' || followStatus === 'follows_you') return doFollow();
    if (followStatus === 'following' || followStatus === 'friends') {
      return doUnfollow({
        title: `Unfollow @${profile?.username ?? ''}?`,
        message: "You'll need to follow them again to see their game.",
      });
    }
    if (followStatus === 'requested') {
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

  const confirmRemoveFollower = () => {
    if (!profile) return;
    const username = profile.username;
    Alert.alert(
      `Remove @${username} as a follower?`,
      `@${username} will no longer follow you. They won't be notified.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const prev = followStatus;
            // Removing a follower: they stop following us. If we still
            // follow them it drops friends -> following; otherwise
            // follows_you -> none.
            setFollowStatus(followStatus === 'friends' ? 'following' : 'none');
            try {
              await removeFollower(profile.user_id);
            } catch {
              setFollowStatus(prev);
              Alert.alert('Could not remove', 'Please try again.');
              return;
            }
            apiCache.invalidate(statusCacheKey(profile.user_id, viewerId));
            apiCache.invalidate(profileCacheKey(profile.user_id, viewerId));
            apiCache.invalidate(`user-followers:${viewerId}:${viewerId}`);
            apiCache.invalidate(`follow-counts:${viewerId}`);
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

    if (followStatus === 'following' || followStatus === 'friends') {
      opts.push({
        label: `Unfollow @${username}`,
        onPress: () =>
          doUnfollow({
            title: `Unfollow @${username}?`,
            message: "You'll need to follow them again to see their game.",
          }),
      });
    } else if (followStatus === 'requested') {
      opts.push({
        label: 'Cancel request',
        onPress: () =>
          doUnfollow({
            title: `Cancel follow request to @${username}?`,
            message: '',
          }),
      });
    }

    if (followStatus === 'follows_you' || followStatus === 'friends') {
      opts.push({
        label: `Remove follower`,
        onPress: confirmRemoveFollower,
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

  // ── message ────────────────────────────────────────────────────────

  const handleMessage = async () => {
    if (!profile) return;
    try {
      const res = await startConversation(targetId);
      const conversation = res.data.data.conversation;
      router.push({
        pathname: '/dm/[id]',
        params: {
          id: conversation.id,
          username: profile.username,
          avatar: profile.avatar_url ?? '',
          otherUserId: targetId,
        },
      });
    } catch (e: any) {
      if (e?.response?.status === 403 && e?.response?.data?.detail === 'not_friends') {
        Alert.alert(
          'Not friends yet',
          `You can message @${profile.username} once you're friends — you both need to follow each other.`,
        );
      } else {
        Alert.alert('Could not open chat', 'Please try again.');
      }
    }
  };

  const messageVisible = !!profile && followStatus !== 'self';

  // ── render branches ────────────────────────────────────────────────

  if (loadError === 'notfound') {
    return (
      <SafeAreaView style={styles.container}>
        <Header onBack={() => router.back()} />
        <View style={styles.centerPad}>
          <Ionicons name="person-outline" size={48} color={colors.textTertiary} />
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
          <Ionicons name="cloud-offline-outline" size={48} color={colors.textTertiary} />
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
          <ActivityIndicator color={colors.textPrimary} />
        </View>
      </SafeAreaView>
    );
  }

  const followBtn = (() => {
    if (followStatus === null || followStatus === 'self') return null;
    const primary = followStatus === 'none' || followStatus === 'follows_you';
    const label =
      followStatus === 'none'
        ? 'Follow'
        : followStatus === 'follows_you'
          ? 'Follow back'
          : followStatus === 'following'
            ? 'Following'
            : followStatus === 'friends'
              ? 'Friends'
              : 'Requested';
    return (
      <TouchableOpacity
        style={[styles.actionBtn, primary ? styles.followBtnPrimary : styles.followBtnSecondary]}
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
        username={profile.username}
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Top row — avatar left, name + stats right */}
        <View style={styles.headerTopRow}>
          <ExpandableImage source={profile.avatar_url ? { uri: profile.avatar_url } : null}>
            <View style={styles.headerAvatar}>
              {profile.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.headerAvatarImg} />
              ) : (
                <Text style={styles.headerAvatarInitial}>
                  {(profile.username || '?').charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
          </ExpandableImage>
          <View style={styles.headerNameStatsCol}>
            <Text style={styles.headerDisplayName} numberOfLines={1}>{profile.display_name || profile.username}</Text>
            <View style={styles.headerStatsRow}>
              <TouchableOpacity
                style={styles.headerStatItem}
                activeOpacity={0.7}
                onPress={() => router.push(`/user/${profile.user_id}/followers` as any)}
              >
                <Text style={styles.headerStatValue}>{profile.follower_count.toLocaleString()}</Text>
                <Text style={styles.headerStatLabel}>followers</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerStatItem}
                activeOpacity={0.7}
                onPress={() => router.push(`/user/${profile.user_id}/following` as any)}
              >
                <Text style={styles.headerStatValue}>{profile.following_count.toLocaleString()}</Text>
                <Text style={styles.headerStatLabel}>following</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerStatItem}
                activeOpacity={0.7}
                onPress={() => router.push('/(tabs)/leaderboard' as any)}
              >
                <Text style={styles.headerStatValue}>{profile.rank != null ? `#${profile.rank}` : '—'}</Text>
                <Text style={styles.headerStatLabel}>ranking</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Handle + pronouns + bio below */}
        <View style={styles.headerIdentityBlock}>
          {profile.pronouns ? <Text style={styles.headerPronouns}>{profile.pronouns}</Text> : null}
          {profile.bio ? <Text style={styles.headerBio}>{profile.bio}</Text> : null}
        </View>

        {followStatus !== null && followStatus !== 'self' ? (
          <View style={styles.actionRow}>
            {followBtn}
            {messageVisible ? (
              <TouchableOpacity
                style={[styles.actionBtn, styles.messageBtn]}
                onPress={handleMessage}
                activeOpacity={0.8}
              >
                <Text style={styles.messageBtnLabel}>Message</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {profile.is_limited ? (
          /* Private + not-approved: lock surface in place of tabs.
             Follow button above already lets the viewer send the
             follow request. */
          <View style={styles.lockBox}>
            <Ionicons name="lock-closed-outline" size={48} color={colors.textSecondary} />
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
                iconActive="heart"
                iconInactive="heart-outline"
                active={tab === 'liked'}
                onPress={() => setTab('liked')}
                label="Liked Songs"
              />
            </View>

            <View style={styles.tabContent}>
              {tab === 'stats' ? <UserStatsTab profile={profile} /> : null}
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
  onMessage,
  onMenu,
  username,
}: {
  onBack: () => void;
  onMessage?: () => void;
  onMenu?: () => void;
  username?: string;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <TouchableOpacity onPress={onBack} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        {username ? <Text style={styles.headerUsername} numberOfLines={1}>@{username}</Text> : null}
      </View>
      <View style={styles.headerActions}>
        {onMessage ? (
          <TouchableOpacity hitSlop={8} style={styles.headerBtn} onPress={onMessage}>
            <Ionicons name="paper-plane-outline" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : null}
        {onMenu ? (
          <TouchableOpacity hitSlop={8} style={styles.headerBtn} onPress={onMenu}>
            <Ionicons name="ellipsis-horizontal" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : (
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
        color={active ? colors.textPrimary : colors.textTertiary}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: 48 },

  headerTopRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 20, paddingTop: 16 },
  headerAvatar: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.surface3 },
  headerAvatarImg: { width: 88, height: 88, borderRadius: 44 },
  headerAvatarInitial: { fontSize: 36, fontWeight: '800', color: colors.onMedia },
  headerNameStatsCol: { flex: 1, marginLeft: 16 },
  headerStatsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 24, marginTop: 8 },
  headerStatItem: { flex: 1, alignItems: 'flex-start' },
  headerStatValue: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  headerStatLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  headerIdentityBlock: { paddingHorizontal: 20, marginTop: 12 },

  actionRow: { flexDirection: 'row', gap: 10, marginHorizontal: 20, marginBottom: 16, marginTop: 14 },
  actionBtn: { flex: 1, paddingVertical: 11, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  messageBtn: { backgroundColor: colors.border },
  messageBtnLabel: { fontSize: 14, fontWeight: '800', letterSpacing: 0.4, color: colors.textPrimary },
  headerDisplayName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  headerHandle: { fontSize: 14, color: colors.textSecondary, marginBottom: 6 },
  headerIdentityName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  headerPronouns: { fontSize: 13, color: colors.textSecondary },
  headerBio: { fontSize: 14, color: colors.textPrimary, marginTop: 4 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerBtn: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerUsername: {
    fontSize: 18, fontWeight: '700', color: colors.textPrimary,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 },

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
  bigAvatarInitial: { fontSize: 48, fontWeight: '800', color: colors.onMedia },
  username: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginTop: 12 },
  pronouns: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
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
  countValue: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  countLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textSecondary,
    letterSpacing: 0.8, marginTop: 2, textTransform: 'uppercase',
  },
  countDivider: { width: 1, height: 28, backgroundColor: colors.border },

  followBtn: {
    marginHorizontal: 20,
    marginBottom: 14,
    paddingVertical: 11,
    borderRadius: 999,
    alignItems: 'center',
  },
  followBtnPrimary: { backgroundColor: colors.accent },
  followBtnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1, borderColor: colors.borderStrong,
  },
  followBtnLabel: { fontSize: 14, fontWeight: '800', letterSpacing: 0.4 },
  followBtnLabelPrimary: { color: colors.onAccent },
  followBtnLabelSecondary: { color: colors.textPrimary },

  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    marginTop: 0,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -0.5,
  },
  tabItemActive: { borderBottomColor: colors.textPrimary },

  tabContent: { paddingTop: 16 },

  lockBox: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 48,
    paddingBottom: 24,
    gap: 8,
  },
  lockTitle: { fontSize: 16, fontWeight: '800', color: colors.textPrimary, marginTop: 8 },
  lockBody: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },

  centerPad: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingHorizontal: 24,
  },
  errorTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 24, paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  retryBtnText: { color: colors.onAccent, fontWeight: '800' },
});
