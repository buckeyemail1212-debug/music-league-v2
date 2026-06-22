import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { UserProfileResponse } from '../../services/api';
import ExpandableImage from '../ExpandableImage';
import { formatPoints } from '../../utils/formatPoints';

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

export default function UserStatsTab({ profile }: { profile: UserProfileResponse }) {
  const router = useRouter();

  const stats = profile.stats;
  const taste = profile.taste;
  const topVoters = profile.top_voters ?? [];
  // Recent list is pre-filtered for anti-cheat by the backend, so we
  // just render whatever lands. Cap at 5 to match the My Game surface.
  const recents = (profile.recent_submissions ?? []).slice(0, 5);

  return (
    <View>
      <View style={styles.statsGrid}>
        <StatTile label="LEAGUES PLAYED" value={stats?.leagues_count ?? null} />
        <StatTile label="TOTAL PTS" value={stats?.total_points ?? null} format={formatPoints} />
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
          <Text style={styles.emptyBlurb}>No top voters yet.</Text>
        ) : (
          <View>
            {topVoters.map((v, idx) => {
              const maxVotes = topVoters[0]?.vote_count || 1;
              const pct = Math.max(8, Math.round((v.vote_count / maxVotes) * 100));
              return (
                <TouchableOpacity
                  key={v.user_id}
                  style={styles.voterRow}
                  activeOpacity={0.7}
                  onPress={() => router.push(`/user/${v.user_id}` as any)}
                >
                  <View style={styles.voterAvatarWrap}>
                    <View style={[styles.topVoterAvatar, { backgroundColor: pickColor(v.user_id) }]}>
                      {v.avatar_url ? (
                        <Image source={{ uri: v.avatar_url }} style={styles.topVoterAvatarImg} />
                      ) : (
                        <Text style={styles.topVoterInitial}>{(v.username || '?').charAt(0).toUpperCase()}</Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.voterInfo}>
                    <Text style={styles.voterName} numberOfLines={1}>{v.username}</Text>
                    <View style={styles.voterBarTrack}>
                      <View style={[styles.voterBarFill, { width: `${pct}%` }]} />
                    </View>
                  </View>
                  <Text style={styles.voterCount}>{v.vote_count}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      <Text style={styles.sectionLabel}>RECENT SUBMISSIONS</Text>
      <View style={styles.group}>
        {recents.length === 0 ? (
          <Text style={styles.emptyBlurb}>No submissions yet.</Text>
        ) : (
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
            const labelParts = [labelPrimary, placementText].filter(Boolean).join(' · ');
            const roundContext = `Round ${sub.round_number} · ${sub.league_name || 'League'}`;

            // Intentionally non-tappable. Tapping would route into
            // /round/[id], where the viewer (as a non-member of this
            // league) would 403. Rendering this as a static row keeps
            // the surface read-only.
            return (
              <View key={sub.submission_id} style={[styles.submissionRow, last && styles.rowLast]}>
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
                {showScored && points != null && (
                  <View style={styles.pointsPill}>
                    <Text style={styles.pointsPillText}>{formatPoints(points)} {points === 1 ? 'pt' : 'pts'}</Text>
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

function StatTile({
  label,
  value,
  format,
}: {
  label: string;
  value: number | null;
  format?: (n: number) => string;
}) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statTileValue}>
        {value === null ? '—' : format ? format(value) : value.toLocaleString()}
      </Text>
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
  voterRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  voterAvatarWrap: { position: 'relative', marginRight: 12 },
  voterBadge: { position: 'absolute', top: -2, right: -2, backgroundColor: '#7C3AED', width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#181818' },
  voterBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  voterInfo: { flex: 1, marginRight: 12 },
  voterName: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', marginBottom: 6 },
  voterBarTrack: { height: 6, backgroundColor: '#282828', borderRadius: 3, overflow: 'hidden' },
  voterBarFill: { height: '100%', backgroundColor: '#7C3AED', borderRadius: 3 },
  voterCount: { color: '#B3B3B3', fontSize: 14, fontWeight: '700' },
  pointsPill: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, marginLeft: 4 },
  pointsPillText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },

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
  submissionState: { color: '#6A6A6A', fontSize: 11, marginTop: 2, fontWeight: '600' },
});
