import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ExpandableImage from '../ExpandableImage';
import { useAuth } from '../../context/AuthContext';
import {
  getLeagues,
  getUserStats,
  getMySubmissions,
  getLifetimeStats,
  getUserTaste,
  getLeagueWins,
  getRoundsPlayed,
  getTopVoters,
  League,
  MySubmission,
  UserStats,
  LifetimeStats,
  TasteBreakdown,
  TopVoter,
} from '../../services/api';
import { apiCache } from '../../services/apiCache';
import { leagueEvents } from '../../utils/leagueEvents';
import Skeleton from '../Skeleton';

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

export default function StatsTab() {
  const { user } = useAuth();
  const router = useRouter();

  // null = unloaded → tile renders em-dash. Real values (including 0)
  // render as themselves. Each SWR call resolves independently.
  const [leaguesCount, setLeaguesCount] = useState<number | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [mySubmissions, setMySubmissions] = useState<MySubmission[] | null>(null);
  const [lifetimeStats, setLifetimeStats] = useState<LifetimeStats | null>(null);
  const [taste, setTaste] = useState<TasteBreakdown | null>(null);
  const [leagueWins, setLeagueWins] = useState<number | null>(null);
  const [roundsPlayed, setRoundsPlayed] = useState<number | null>(null);
  const [topVoters, setTopVoters] = useState<TopVoter[]>([]);

  const loadStats = useCallback(() => {
    const userId = user?.id;
    const run = <T,>(
      key: string,
      fetcher: () => Promise<T>,
      onUpdate: (data: T) => void,
    ) => {
      if (!userId) {
        fetcher().then(onUpdate).catch(() => {});
        return;
      }
      apiCache.swr(key, fetcher, onUpdate).catch(() => {});
    };

    run(
      `leagues:${userId}`,
      () => getLeagues().then((r) => r.data),
      (data: League[]) => setLeaguesCount(data.length),
    );
    run(`auth-stats:${userId}`, () => getUserStats().then((r) => r.data), setUserStats);
    run(
      `auth-submissions:${userId}`,
      () => getMySubmissions().then((r) => r.data.submissions),
      setMySubmissions,
    );
    run(
      `auth-lifetime-stats:${userId}`,
      () => getLifetimeStats().then((r) => r.data),
      setLifetimeStats,
    );
    run(`auth-taste:${userId}`, () => getUserTaste().then((r) => r.data), setTaste);
    run(
      `users-me-stats-league-wins:${userId}`,
      () => getLeagueWins().then((r) => r.data.data.count),
      setLeagueWins,
    );
    run(
      `users-me-stats-rounds-played:${userId}`,
      () => getRoundsPlayed().then((r) => r.data.data.count),
      setRoundsPlayed,
    );
    run(
      `users-me-stats-top-voters:${userId}`,
      () => getTopVoters().then((r) => r.data.data),
      setTopVoters,
    );
  }, [user?.id]);

  useFocusEffect(useCallback(() => { loadStats(); }, [loadStats]));

  useEffect(() => {
    const unsub = leagueEvents.subscribe(() => {
      apiCache.invalidate('leagues:');
      apiCache.invalidate('auth-');
      apiCache.invalidate('users-me-stats-');
      loadStats();
    });
    return () => { unsub(); };
  }, [loadStats]);

  const displayedSubmissions = (mySubmissions ?? []).slice(0, 5);
  const roundWinsCount =
    mySubmissions === null
      ? null
      : mySubmissions.filter((s) => s.placement === 1).length;

  return (
    <View>
      {/* Stat tiles */}
      <View style={styles.statsGrid}>
        <StatTile label="LEAGUES PLAYED" value={userStats?.leagues_count ?? leaguesCount} />
        <StatTile label="TOTAL PTS" value={lifetimeStats?.all_time_points ?? null} />
        <StatTile label="ROUND WINS" value={roundWinsCount} />
        <StatTile label="SUBMISSIONS" value={lifetimeStats?.total_submissions ?? null} />
        <StatTile label="LEAGUE WINS" value={leagueWins} />
        <StatTile label="ROUNDS PLAYED" value={roundsPlayed} />
      </View>

      {/* Taste */}
      <Text style={styles.sectionLabel}>YOUR TASTE · ALL-TIME</Text>
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
          <View>
            <View style={[styles.tasteBar, styles.tasteBarEmpty]} />
            <Text style={styles.emptyBlurb}>
              Submit songs in your leagues and we&rsquo;ll build your taste profile here.
            </Text>
          </View>
        )}
      </View>

      {/* Top Voters */}
      <Text style={styles.sectionLabel}>TOP VOTERS</Text>
      <View style={[styles.group, styles.topVotersCard]}>
        {topVoters.length === 0 ? (
          <Text style={styles.emptyBlurb}>
            Once others vote your songs to the top of their rankings, they&rsquo;ll show up here.
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
                <ExpandableImage source={v.avatar_url ? { uri: v.avatar_url } : null}>
                  <View
                    style={[styles.topVoterAvatar, { backgroundColor: pickColor(v.user_id) }]}
                  >
                    {v.avatar_url ? (
                      <Image source={{ uri: v.avatar_url }} style={styles.topVoterAvatarImg} />
                    ) : (
                      <Text style={styles.topVoterInitial}>
                        {(v.username || '?').charAt(0).toUpperCase()}
                      </Text>
                    )}
                  </View>
                </ExpandableImage>
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

      {/* Recent Submissions */}
      <Text style={styles.sectionLabel}>RECENT SUBMISSIONS</Text>
      <View style={styles.group}>
        {displayedSubmissions.length > 0 ? (
          displayedSubmissions.map((sub, idx, arr) => {
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
            const labelParts = [labelPrimary, placementText, pointsText].filter(Boolean).join(' · ');
            const roundContext = `Round ${sub.round_number} · ${sub.league_name || 'League'}`;

            return (
              <TouchableOpacity
                key={sub.submission_id}
                style={[styles.submissionRow, last && styles.rowLast]}
                activeOpacity={0.75}
                onPress={() => router.push(`/round/${sub.round_id}` as any)}
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
                  <Text style={styles.submissionTitle} numberOfLines={1}>{sub.song?.title}</Text>
                  <Text style={styles.submissionArtist} numberOfLines={1}>{sub.song?.artist}</Text>
                  <Text style={styles.submissionContext} numberOfLines={1}>{roundContext}</Text>
                  <Text style={styles.submissionState} numberOfLines={1}>{labelParts}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#6A6A6A" />
              </TouchableOpacity>
            );
          })
        ) : (
          <Text style={styles.emptyBlurb}>
            Songs you submit to your leagues will show up here.
          </Text>
        )}
      </View>

      {/* Past leagues nav */}
      <TouchableOpacity
        style={[styles.group, styles.navRow]}
        activeOpacity={0.75}
        onPress={() => router.push('/past-leagues' as any)}
      >
        <View style={styles.navIcon}>
          <Ionicons name="time-outline" size={20} color="#FFFFFF" />
        </View>
        <View style={styles.submissionInfo}>
          <Text style={styles.submissionTitle}>Past leagues</Text>
          <Text style={styles.submissionArtist}>Your finished competitions</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#6A6A6A" />
      </TouchableOpacity>
    </View>
  );
}

function StatTile({ label, value }: { label: string; value: number | null }) {
  return (
    <View style={styles.statTile}>
      {value === null
        ? <Skeleton width={50} height={26} borderRadius={6} />
        : <Text style={styles.statTileValue}>{value.toLocaleString()}</Text>}
      <Text style={styles.statTileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 0,
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

  emptyBlurb: {
    fontSize: 13, color: '#B3B3B3', lineHeight: 19,
    padding: 16, textAlign: 'center',
  },
  tasteBarEmpty: { backgroundColor: '#282828' },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#B3B3B3',
    letterSpacing: 1.2,
    marginHorizontal: 20, marginTop: 16, marginBottom: 8,
    textTransform: 'uppercase',
  },
  group: {
    backgroundColor: '#181818',
    marginHorizontal: 20, marginBottom: 8,
    borderRadius: 12, overflow: 'hidden',
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

  navRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12, gap: 12,
  },
  navIcon: {
    width: 48, height: 48, borderRadius: 6, backgroundColor: '#282828',
    alignItems: 'center', justifyContent: 'center',
  },
});
