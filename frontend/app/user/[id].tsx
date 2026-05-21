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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import {
  followUser,
  getFollowStatus,
  getUserProfile,
  unfollowUser,
  FollowStatus,
  UserProfileResponse,
} from '../../src/services/api';
import { apiCache } from '../../src/services/apiCache';

const TASTE_COLORS: Record<string, string> = {
  Indie: '#7C3AED',
  Electronic: '#14B8A6',
  'Hip-Hop': '#F97316',
  'R&B': '#EC4899',
  Pop: '#EF4444',
  Country: '#F59E0B',
  Rock: '#3B82F6',
  Other: '#6A6A6A',
};

const SUBMISSION_COLORS = ['#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899'];
const pickColor = (seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) >>> 0;
  return SUBMISSION_COLORS[h % SUBMISSION_COLORS.length];
};

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const PROFILE_TTL_MS = 60 * 1000;

// Cache key includes viewer because the same target returns a different
// payload depending on whether the viewer is an approved follower.
const profileCacheKey = (targetId: string, viewerId: string) =>
  `user-profile:${targetId}:${viewerId}`;
const statusCacheKey = (targetId: string, viewerId: string) =>
  `user-follow-status:${targetId}:${viewerId}`;

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

  // Self-redirect: if the viewer landed on their own /user/{id}, bounce to
  // the My Game tab so back-stack doesn't get weird. router.replace, not
  // push, per the spec.
  useEffect(() => {
    if (targetId && viewerId && targetId === viewerId) {
      router.replace('/(tabs)/profile' as any);
    }
  }, [targetId, viewerId, router]);

  const load = useCallback(async () => {
    if (!targetId || !viewerId) return;
    if (targetId === viewerId) return; // redirect effect will handle it

    setLoadError(null);

    // Profile + follow-status load in parallel via apiCache.swr so the
    // first paint is instant when warm and a stale entry refreshes in
    // the background.
    apiCache
      .swr(
        profileCacheKey(targetId, viewerId),
        () => getUserProfile(targetId).then((r) => r.data.data),
        (data) => setProfile(data),
        PROFILE_TTL_MS,
      )
      .then((data) => setProfile(data))
      .catch((err) => {
        if (err?.response?.status === 404) {
          setLoadError('notfound');
        } else {
          setLoadError((prev) => prev ?? 'network');
        }
      });

    apiCache
      .swr(
        statusCacheKey(targetId, viewerId),
        () => getFollowStatus(targetId).then((r) => r.data.data.status),
        (status) => setFollowStatus(status),
        PROFILE_TTL_MS,
      )
      .then((status) => setFollowStatus(status))
      .catch(() => {
        // Status is a soft requirement — leave it null and the button
        // will render a disabled placeholder.
      });
  }, [targetId, viewerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Backend may report status='self' when viewer == target — same redirect
  // path as the id-equality check above, just covers the case where
  // viewerId wasn't ready at first render.
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
    // Optimistic — flip to whatever the backend tells us; default to
    // pending if the target is private, otherwise approved. The actual
    // response wins.
    const optimistic: FollowStatus = profile?.is_private ? 'pending' : 'approved';
    setFollowStatus(optimistic);
    try {
      const res = await followUser(targetId);
      setFollowStatus(res.data.data.status);
      invalidateAfterFollowChange();
      // Background refetch so follower_count + (if newly approved)
      // the full payload land.
      load();
    } catch (err) {
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
          } catch (err) {
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

  // ── render branches ───────────────────────────────────────────────────

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
    const variant =
      followStatus === 'none' ? 'primary' : 'secondary';
    const label =
      followStatus === 'none'
        ? 'Follow'
        : followStatus === 'pending'
          ? 'Requested'
          : 'Following';
    return (
      <TouchableOpacity
        style={[styles.followBtn, variant === 'primary' ? styles.followBtnPrimary : styles.followBtnSecondary]}
        onPress={onFollowButtonPress}
        activeOpacity={0.8}
        disabled={busy}
      >
        <Text
          style={[
            styles.followBtnLabel,
            variant === 'primary' ? styles.followBtnLabelPrimary : styles.followBtnLabelSecondary,
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  })();

  return (
    <SafeAreaView style={styles.container}>
      <Header onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Identity block */}
        <View style={styles.identity}>
          <View
            style={[styles.bigAvatar, { backgroundColor: pickColor(profile.user_id) }]}
          >
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.bigAvatarImg} />
            ) : (
              <Text style={styles.bigAvatarInitial}>
                {(profile.username || '?').charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
          <Text style={styles.username}>@{profile.username}</Text>
          {profile.is_private && (
            <View style={styles.privateBadge}>
              <Ionicons name="lock-closed" size={11} color="#B3B3B3" />
              <Text style={styles.privateBadgeText}>Private</Text>
            </View>
          )}

          {followBtn}

          <View style={styles.countsRow}>
            <View style={styles.countItem}>
              <Text style={styles.countValue}>{profile.follower_count.toLocaleString()}</Text>
              <Text style={styles.countLabel}>Followers</Text>
            </View>
            <View style={styles.countDivider} />
            <View style={styles.countItem}>
              <Text style={styles.countValue}>{profile.following_count.toLocaleString()}</Text>
              <Text style={styles.countLabel}>Following</Text>
            </View>
          </View>
        </View>

        {profile.is_limited ? (
          <View style={[styles.group, styles.privateNotice]}>
            <Ionicons name="lock-closed-outline" size={28} color="#B3B3B3" />
            <Text style={styles.privateNoticeTitle}>This account is private</Text>
            <Text style={styles.privateNoticeBody}>
              Follow @{profile.username} to see their game.
            </Text>
          </View>
        ) : (
          <FullProfileBody profile={profile} router={router} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} hitSlop={8} style={styles.headerBtn}>
        <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
      </TouchableOpacity>
      <View style={styles.headerActions}>
        <TouchableOpacity hitSlop={8} style={styles.headerBtn} onPress={() => { /* share — Tier 2 */ }}>
          <Ionicons name="share-outline" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity hitSlop={8} style={styles.headerBtn} onPress={() => { /* menu — Tier 2 */ }}>
          <Ionicons name="ellipsis-horizontal" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function FullProfileBody({
  profile,
  router,
}: {
  profile: UserProfileResponse;
  router: ReturnType<typeof useRouter>;
}) {
  const stats = profile.stats;
  const taste = profile.taste;
  const topVoters = profile.top_voters ?? [];
  const recents = (profile.recent_submissions ?? []).slice(0, 5);

  return (
    <>
      {/* Stat tiles — em-dash for null (not yet loaded) consistent with My Game. */}
      <View style={styles.statsGrid}>
        <StatTile label="LEAGUES PLAYED" value={stats?.leagues_count ?? null} />
        <StatTile label="TOTAL PTS" value={stats?.total_points ?? null} />
        <StatTile label="ROUND WINS" value={stats?.round_wins ?? null} />
        <StatTile label="SUBMISSIONS" value={stats?.submissions_count ?? null} />
        <StatTile label="LEAGUE WINS" value={stats?.league_wins ?? null} />
        <StatTile label="ROUNDS PLAYED" value={stats?.rounds_played ?? null} />
      </View>

      <Text style={styles.sectionLabel}>THEIR TASTE · ALL-TIME</Text>
      <View style={[styles.group, styles.tasteCard]}>
        {taste && taste.total > 0 && taste.breakdown.length > 0 ? (
          <>
            <View style={styles.tasteBar}>
              {taste.breakdown.map((b, i) => {
                const color = TASTE_COLORS[b.genre] ?? '#6A6A6A';
                const isFirst = i === 0;
                const isLast = i === taste.breakdown.length - 1;
                return (
                  <View
                    key={b.genre}
                    style={{
                      flex: b.pct,
                      height: '100%',
                      backgroundColor: color,
                      borderTopLeftRadius: isFirst ? 6 : 0,
                      borderBottomLeftRadius: isFirst ? 6 : 0,
                      borderTopRightRadius: isLast ? 6 : 0,
                      borderBottomRightRadius: isLast ? 6 : 0,
                    }}
                  />
                );
              })}
            </View>
            <View style={styles.tasteList}>
              {taste.breakdown.map((b) => {
                const color = TASTE_COLORS[b.genre] ?? '#6A6A6A';
                return (
                  <View key={b.genre} style={styles.tasteRow}>
                    <View style={[styles.tasteDot, { backgroundColor: color }]} />
                    <Text style={styles.tasteGenre}>{b.genre}</Text>
                    <Text style={styles.tastePct}>{b.pct}%</Text>
                  </View>
                );
              })}
            </View>
          </>
        ) : (
          <Text style={styles.emptyBlurb}>
            No taste data yet — songs submitted by @{profile.username} will populate this.
          </Text>
        )}
      </View>

      <Text style={styles.sectionLabel}>TOP VOTERS</Text>
      <View style={[styles.group, styles.topVotersCard]}>
        {topVoters.length === 0 ? (
          <Text style={styles.emptyBlurb}>
            No top voters yet.
          </Text>
        ) : (
          <View style={styles.topVotersRow}>
            {topVoters.map((v) => (
              <TouchableOpacity
                key={v.user_id}
                style={styles.topVoterItem}
                activeOpacity={0.7}
                onPress={() => router.push(`/user/${v.user_id}` as any)}
              >
                <View
                  style={[
                    styles.topVoterAvatar,
                    { backgroundColor: pickColor(v.user_id) },
                  ]}
                >
                  {v.avatar_url ? (
                    <Image source={{ uri: v.avatar_url }} style={styles.topVoterAvatarImg} />
                  ) : (
                    <Text style={styles.topVoterInitial}>
                      {(v.username || '?').charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
                <Text style={styles.topVoterName} numberOfLines={1}>
                  {(v.username || '').slice(0, 8)}
                </Text>
                <Text style={styles.topVoterCount}>
                  {v.vote_count} {v.vote_count === 1 ? 'vote' : 'votes'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <Text style={styles.sectionLabel}>RECENT SUBMISSIONS</Text>
      <View style={styles.group}>
        {recents.length > 0 ? (
          recents.map((sub, idx, arr) => {
            const last = idx === arr.length - 1;
            const leagueDeleted = sub.league_status === 'deleted';
            const roundCompleted = sub.round_status === 'completed';
            const leagueCompleted = sub.league_status === 'completed';

            let labelPrimary: string;
            let showScored: boolean;
            if (leagueDeleted) {
              labelPrimary = 'League deleted';
              showScored = roundCompleted;
            } else if (sub.round_status === 'submission') {
              labelPrimary = 'Open · Submission';
              showScored = false;
            } else if (sub.round_status === 'voting') {
              labelPrimary = 'Open · Voting';
              showScored = false;
            } else if (roundCompleted && leagueCompleted) {
              labelPrimary = 'Final result';
              showScored = true;
            } else if (roundCompleted) {
              labelPrimary = 'Completed';
              showScored = true;
            } else {
              labelPrimary = 'Closed';
              showScored = false;
            }

            const points = sub.points_earned ?? sub.points;
            const placement = sub.placement ?? null;
            const totalInRound = sub.total_submissions_in_round ?? null;
            const placementText =
              showScored && placement != null && totalInRound != null
                ? `${ordinal(placement)} of ${totalInRound}`
                : null;
            const pointsText =
              showScored && points != null
                ? `${points} ${points === 1 ? 'pt' : 'pts'}`
                : null;

            const labelParts = [labelPrimary, placementText, pointsText]
              .filter(Boolean)
              .join(' · ');
            const roundContext = `Round ${sub.round_number} · ${sub.league_name || 'League'}`;

            return (
              <View
                key={sub.submission_id}
                style={[styles.submissionRow, last && styles.rowLast]}
              >
                <View
                  style={[
                    styles.submissionArt,
                    { backgroundColor: pickColor(sub.song?.title || sub.submission_id) },
                  ]}
                >
                  {sub.song?.cover_url ? (
                    <Image source={{ uri: sub.song.cover_url }} style={styles.submissionArtImage} />
                  ) : (
                    <Ionicons name="musical-note" size={20} color="#FFFFFF" />
                  )}
                </View>
                <View style={styles.submissionInfo}>
                  <Text style={styles.submissionTitle} numberOfLines={1}>
                    {sub.song?.title}
                  </Text>
                  <Text style={styles.submissionArtist} numberOfLines={1}>
                    {sub.song?.artist}
                  </Text>
                  <Text style={styles.submissionContext} numberOfLines={1}>
                    {roundContext}
                  </Text>
                  <Text style={styles.submissionState} numberOfLines={1}>
                    {labelParts}
                  </Text>
                </View>
              </View>
            );
          })
        ) : (
          <Text style={styles.emptyBlurb}>
            No submissions yet.
          </Text>
        )}
      </View>
    </>
  );
}

function StatTile({ label, value }: { label: string; value: number | null }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statTileValue}>
        {value === null ? '—' : value.toLocaleString()}
      </Text>
      <Text style={styles.statTileLabel}>{label}</Text>
    </View>
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
  headerBtn: {
    minWidth: 40, minHeight: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  identity: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  bigAvatar: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  bigAvatarImg: { width: 96, height: 96, borderRadius: 48 },
  bigAvatarInitial: {
    fontSize: 40, fontWeight: '800', color: '#FFFFFF',
  },
  username: {
    fontSize: 20, fontWeight: '800', color: '#FFFFFF',
    marginTop: 10,
  },
  privateBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 6,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  privateBadgeText: {
    fontSize: 11, fontWeight: '700', color: '#B3B3B3',
    letterSpacing: 0.5,
  },

  followBtn: {
    marginTop: 16,
    paddingHorizontal: 32, paddingVertical: 10,
    borderRadius: 999,
    minWidth: 160,
    alignItems: 'center',
  },
  followBtnPrimary: { backgroundColor: '#7C3AED' },
  followBtnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  followBtnLabel: { fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  followBtnLabelPrimary: { color: '#FFFFFF' },
  followBtnLabelSecondary: { color: '#FFFFFF' },

  countsRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 18, gap: 24,
  },
  countItem: { alignItems: 'center', minWidth: 70 },
  countValue: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  countLabel: {
    fontSize: 11, fontWeight: '700', color: '#B3B3B3',
    letterSpacing: 0.8, marginTop: 2, textTransform: 'uppercase',
  },
  countDivider: {
    width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.1)',
  },

  privateNotice: {
    marginHorizontal: 20,
    paddingVertical: 28, paddingHorizontal: 20,
    alignItems: 'center', gap: 8,
  },
  privateNoticeTitle: {
    fontSize: 16, fontWeight: '800', color: '#FFFFFF',
  },
  privateNoticeBody: {
    fontSize: 13, color: '#B3B3B3', textAlign: 'center',
  },

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

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 6,
  },
  statTile: {
    width: '48%',
    backgroundColor: '#181818',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  statTileValue: { fontSize: 26, fontWeight: '800', color: '#FFFFFF' },
  statTileLabel: {
    fontSize: 11, fontWeight: '800', color: '#B3B3B3',
    letterSpacing: 1, marginTop: 6,
  },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#B3B3B3',
    letterSpacing: 1.2,
    marginHorizontal: 20, marginTop: 18, marginBottom: 8,
    textTransform: 'uppercase',
  },
  group: {
    backgroundColor: '#181818',
    marginHorizontal: 20, marginBottom: 8,
    borderRadius: 12, overflow: 'hidden',
  },
  emptyBlurb: {
    fontSize: 13, color: '#B3B3B3',
    lineHeight: 19, padding: 16, textAlign: 'center',
  },
  rowLast: { borderBottomWidth: 0 },

  tasteCard: { padding: 16 },
  tasteBar: {
    flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden',
    backgroundColor: '#282828',
  },
  tasteList: { marginTop: 14 },
  tasteRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  tasteDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  tasteGenre: { flex: 1, fontSize: 14, fontWeight: '500', color: '#FFFFFF' },
  tastePct: { fontSize: 13, fontWeight: '700', color: '#B3B3B3' },

  topVotersCard: { padding: 16 },
  topVotersRow: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  topVoterItem: { alignItems: 'center', width: 64 },
  topVoterAvatar: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  topVoterAvatarImg: { width: 52, height: 52, borderRadius: 26 },
  topVoterInitial: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  topVoterName: {
    fontSize: 12, fontWeight: '700', color: '#FFFFFF',
    marginTop: 6, textAlign: 'center',
  },
  topVoterCount: {
    fontSize: 11, fontWeight: '700', color: '#B3B3B3',
    marginTop: 2, letterSpacing: 0.4,
  },

  submissionRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  submissionArt: {
    width: 48, height: 48, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  submissionArtImage: { width: 48, height: 48, borderRadius: 6 },
  submissionInfo: { flex: 1, marginRight: 8 },
  submissionTitle: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  submissionArtist: { fontSize: 12, color: '#B3B3B3', marginTop: 2 },
  submissionContext: { color: '#B3B3B3', fontSize: 11, marginTop: 6 },
  submissionState: {
    color: '#6A6A6A', fontSize: 11, marginTop: 2, fontWeight: '600',
  },
});
