import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import ExpandableImage from './ExpandableImage';
import {
  followUser,
  getFollowStatus,
  getUserFollowers,
  getUserFollowing,
  getUserProfile,
  unfollowUser,
  FollowListResponse,
  FollowListUser,
  FollowStatus,
} from '../services/api';
import { apiCache } from '../services/apiCache';

type Mode = 'followers' | 'following';

const LIST_TTL_MS = 60 * 1000;
const STATUS_TTL_MS = 60 * 1000;
const PAGE_LIMIT = 50;

const SUBMISSION_COLORS = ['#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899'];
const pickColor = (seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) >>> 0;
  return SUBMISSION_COLORS[h % SUBMISSION_COLORS.length];
};

const listCacheKey = (mode: Mode, targetId: string, viewerId: string) =>
  `user-${mode}:${targetId}:${viewerId}`;
const statusCacheKey = (rowId: string, viewerId: string) =>
  `user-follow-status:${rowId}:${viewerId}`;

export default function FollowListScreen({ mode }: { mode: Mode }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const targetId = id ?? '';
  const viewerId = user?.id ?? '';

  const [data, setData] = useState<FollowListResponse | null>(null);
  const [targetUsername, setTargetUsername] = useState<string>('');
  const [loadError, setLoadError] = useState<'private' | 'notfound' | 'network' | null>(null);

  const load = useCallback(() => {
    if (!targetId || !viewerId) return;
    setLoadError(null);

    const fetcher = mode === 'followers' ? getUserFollowers : getUserFollowing;
    apiCache
      .swr(
        listCacheKey(mode, targetId, viewerId),
        () => fetcher(targetId, { limit: PAGE_LIMIT, offset: 0 }).then((r) => r.data.data),
        (d) => setData(d),
        LIST_TTL_MS,
      )
      .then((d) => setData(d))
      .catch((err) => {
        const status = err?.response?.status;
        if (status === 403) setLoadError('private');
        else if (status === 404) setLoadError('notfound');
        else setLoadError((prev) => prev ?? 'network');
      });

    // Header username is best-effort — pull from profile cache if warm,
    // otherwise fire-and-forget. Profile endpoint enforces its own gate
    // separately; a 403 there is OK because we already showed the list
    // result above.
    apiCache
      .swr(
        `user-profile:${targetId}:${viewerId}`,
        () => getUserProfile(targetId).then((r) => r.data.data),
        (p) => setTargetUsername(p.username || ''),
        60 * 1000,
      )
      .then((p) => setTargetUsername(p.username || ''))
      .catch(() => {});
  }, [mode, targetId, viewerId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const headerTitle = useMemo(() => {
    const noun = mode === 'followers' ? 'Followers' : 'Following';
    if (targetUsername) {
      return `${noun} · @${targetUsername}`;
    }
    return noun;
  }, [mode, targetUsername]);

  const onFollowChanged = useCallback(() => {
    // After a row's follow state flips, the list itself might change
    // (e.g. unfollowing someone in your own following list). Invalidate
    // both list directions so subsequent reads refetch.
    apiCache.invalidate(`user-followers:${targetId}:${viewerId}`);
    apiCache.invalidate(`user-following:${targetId}:${viewerId}`);
    load();
  }, [targetId, viewerId, load]);

  // ── render branches ───────────────────────────────────────────────────

  if (loadError === 'notfound') {
    return (
      <SafeAreaView style={styles.container}>
        <Header onBack={() => router.back()} title={headerTitle} />
        <Centered>
          <Ionicons name="person-outline" size={48} color="#6A6A6A" />
          <Text style={styles.errorTitle}>User not found</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => router.back()}>
            <Text style={styles.retryBtnText}>Go back</Text>
          </TouchableOpacity>
        </Centered>
      </SafeAreaView>
    );
  }

  if (loadError === 'private') {
    return (
      <SafeAreaView style={styles.container}>
        <Header onBack={() => router.back()} title={headerTitle} />
        <Centered>
          <Ionicons name="lock-closed-outline" size={40} color="#B3B3B3" />
          <Text style={styles.errorTitle}>This account is private</Text>
          <Text style={styles.errorBody}>
            Follow @{targetUsername || 'this user'} to see their {mode === 'followers' ? 'followers' : 'following'}.
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => router.back()}>
            <Text style={styles.retryBtnText}>Back to profile</Text>
          </TouchableOpacity>
        </Centered>
      </SafeAreaView>
    );
  }

  if (loadError === 'network' && !data) {
    return (
      <SafeAreaView style={styles.container}>
        <Header onBack={() => router.back()} title={headerTitle} />
        <Centered>
          <Ionicons name="cloud-offline-outline" size={48} color="#6A6A6A" />
          <Text style={styles.errorTitle}>Couldn&rsquo;t load</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryBtnText}>Try again</Text>
          </TouchableOpacity>
        </Centered>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.container}>
        <Header onBack={() => router.back()} title={headerTitle} />
        <Centered>
          <ActivityIndicator color="#FFFFFF" />
        </Centered>
      </SafeAreaView>
    );
  }

  const emptyText =
    mode === 'followers' ? 'No followers yet' : 'Not following anyone yet';

  return (
    <SafeAreaView style={styles.container}>
      <Header onBack={() => router.back()} title={headerTitle} />
      {data.users.length === 0 ? (
        <Centered>
          <Text style={styles.emptyText}>{emptyText}</Text>
        </Centered>
      ) : (
        <FlatList
          data={data.users}
          keyExtractor={(row) => row.user_id}
          renderItem={({ item }) => (
            <FollowRow
              row={item}
              viewerId={viewerId}
              onPress={() => router.push(`/user/${item.user_id}` as any)}
              onFollowChanged={onFollowChanged}
            />
          )}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

function Header({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} hitSlop={8} style={styles.headerBtn}>
        <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
      <View style={styles.headerBtn} />
    </View>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.center}>{children}</View>;
}

function FollowRow({
  row,
  viewerId,
  onPress,
  onFollowChanged,
}: {
  row: FollowListUser;
  viewerId: string;
  onPress: () => void;
  onFollowChanged: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.row}>
      {/* Long-press is on the avatar only — the row's TouchableOpacity
          still owns the tap-to-navigate gesture. The inner Pressable
          (inside ExpandableImage) doesn't define onPress, so short
          taps bubble up to the row handler. */}
      <ExpandableImage source={row.avatar_url ? { uri: row.avatar_url } : null}>
        <View
          style={[styles.avatar, { backgroundColor: pickColor(row.user_id) }]}
        >
          {row.avatar_url ? (
            <Image source={{ uri: row.avatar_url }} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarInitial}>
              {(row.username || '?').charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
      </ExpandableImage>
      <View style={styles.rowInfo}>
        <Text style={styles.rowUsername} numberOfLines={1}>@{row.username}</Text>
      </View>
      {row.user_id !== viewerId && (
        <RowFollowButton
          rowUserId={row.user_id}
          rowUsername={row.username}
          viewerId={viewerId}
          onChanged={onFollowChanged}
        />
      )}
    </TouchableOpacity>
  );
}

function RowFollowButton({
  rowUserId,
  rowUsername,
  viewerId,
  onChanged,
}: {
  rowUserId: string;
  rowUsername: string;
  viewerId: string;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState<FollowStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    apiCache
      .swr(
        statusCacheKey(rowUserId, viewerId),
        () => getFollowStatus(rowUserId).then((r) => r.data.data.status),
        (s) => { if (mounted) setStatus(s); },
        STATUS_TTL_MS,
      )
      .then((s) => { if (mounted) setStatus(s); })
      .catch(() => {});
    return () => { mounted = false; };
  }, [rowUserId, viewerId]);

  const invalidate = () => {
    apiCache.invalidate(statusCacheKey(rowUserId, viewerId));
    apiCache.invalidate(`user-profile:${rowUserId}:${viewerId}`);
    onChanged();
  };

  const doFollow = async () => {
    if (busy) return;
    setBusy(true);
    const prev = status;
    setStatus('approved'); // optimistic; backend may return 'pending'
    try {
      const res = await followUser(rowUserId);
      setStatus(res.data.data.status);
      invalidate();
    } catch {
      setStatus(prev ?? 'none');
      Alert.alert('Could not follow', 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const doUnfollow = (copy: { title: string; message: string }) => {
    Alert.alert(copy.title, copy.message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'OK',
        style: 'destructive',
        onPress: async () => {
          if (busy) return;
          setBusy(true);
          const prev = status;
          setStatus('none');
          try {
            await unfollowUser(rowUserId);
            invalidate();
          } catch {
            setStatus(prev);
            Alert.alert('Could not update', 'Please try again.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const onPress = () => {
    if (!status) return;
    if (status === 'none') return doFollow();
    if (status === 'approved') {
      return doUnfollow({
        title: `Unfollow @${rowUsername}?`,
        message: 'You’ll need to follow them again to see their game.',
      });
    }
    if (status === 'pending') {
      return doUnfollow({
        title: 'Cancel follow request?',
        message: `Your request to follow @${rowUsername} will be withdrawn.`,
      });
    }
  };

  if (status === null || status === 'self') return null;

  const primary = status === 'none';
  const label =
    status === 'none' ? 'Follow' : status === 'pending' ? 'Requested' : 'Following';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      disabled={busy}
      style={[styles.followBtn, primary ? styles.followBtnPrimary : styles.followBtnSecondary]}
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
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerBtn: {
    minWidth: 40, minHeight: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 17, fontWeight: '700', color: '#FFFFFF',
  },

  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingHorizontal: 24,
  },
  emptyText: { fontSize: 14, color: '#B3B3B3' },
  errorTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  errorBody: { fontSize: 13, color: '#B3B3B3', textAlign: 'center' },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 24, paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#7C3AED',
  },
  retryBtnText: { color: '#FFFFFF', fontWeight: '800' },

  listContent: { paddingVertical: 4 },
  separator: { height: 0.5, backgroundColor: 'rgba(255,255,255,0.06)' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 44, height: 44, borderRadius: 22 },
  avatarInitial: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  rowInfo: { flex: 1 },
  rowUsername: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  followBtn: {
    paddingHorizontal: 16, paddingVertical: 7,
    borderRadius: 999,
    minWidth: 96,
    alignItems: 'center',
  },
  followBtnPrimary: { backgroundColor: '#7C3AED' },
  followBtnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  followBtnLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  followBtnLabelPrimary: { color: '#FFFFFF' },
  followBtnLabelSecondary: { color: '#FFFFFF' },
});
