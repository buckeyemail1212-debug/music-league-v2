import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getHighestLeagueScore, HighestLeagueScore } from '../src/services/api';
import { useAuth } from '../src/context/AuthContext';

const formatDate = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function HighestLeagueScorePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<HighestLeagueScore | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getHighestLeagueScore();
        if (cancelled) return;
        setData(res.data?.data ?? null);
      } catch {
        if (!cancelled) {
          setErrored(true);
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>HIGHEST LEAGUE SCORE</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#7C3AED" />
        </View>
      ) : !data ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            {errored
              ? 'Could not load this stat. Please try again.'
              : 'No completed leagues yet.'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Top card */}
          <View style={styles.topCard}>
            <View style={styles.trophyIconBox}>
              <Ionicons name="trophy" size={32} color="#FFFFFF" />
            </View>
            <Text style={styles.leagueName}>{data.league_name}</Text>
            <View style={styles.metaRow}>
              <View style={styles.pill}>
                <Text style={styles.pillText}>
                  {data.total_rounds} {data.total_rounds === 1 ? 'ROUND' : 'ROUNDS'}
                </Text>
              </View>
              {data.finished_at ? (
                <Text style={styles.metaDate}>Finished {formatDate(data.finished_at)}</Text>
              ) : null}
            </View>
            <View style={styles.scoreWrap}>
              <Text style={styles.scoreLabel}>YOUR FINAL SCORE</Text>
              <Text style={styles.scoreValue}>{data.user_final_score}</Text>
            </View>
          </View>

          {/* Members */}
          <Text style={styles.sectionLabel}>MEMBERS</Text>
          <View style={styles.card}>
            {data.member_usernames.length === 0 ? (
              <Text style={styles.emptyText}>No members recorded.</Text>
            ) : (
              data.member_usernames.map((name, i) => {
                const isLast = i === data.member_usernames.length - 1;
                return (
                  <View
                    key={`${name}-${i}`}
                    style={[styles.memberRow, !isLast && styles.rowBorder]}
                  >
                    <View style={styles.memberAvatar}>
                      <Text style={styles.memberAvatarLetter}>
                        {(name || '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {name}
                    </Text>
                  </View>
                );
              })
            )}
          </View>

          {/* Your submissions */}
          <Text style={styles.sectionLabel}>YOUR SUBMISSIONS</Text>
          <View style={styles.card}>
            {data.user_submissions.length === 0 ? (
              <Text style={styles.emptyText}>No submissions recorded.</Text>
            ) : (
              data.user_submissions.map((s, i) => {
                const isLast = i === data.user_submissions.length - 1;
                return (
                  <View
                    key={`${s.round_number}-${i}`}
                    style={[styles.subRow, !isLast && styles.rowBorder]}
                  >
                    <View style={styles.roundBadge}>
                      <Text style={styles.roundBadgeText}>
                        R{s.round_number ?? '?'}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.subTitle} numberOfLines={1}>
                        {s.song_title || '—'}
                      </Text>
                      <Text style={styles.subArtist} numberOfLines={1}>
                        {s.artist}
                      </Text>
                    </View>
                    <Text style={styles.subPoints}>
                      {s.round_points} {s.round_points === 1 ? 'pt' : 'pts'}
                    </Text>
                  </View>
                );
              })
            )}
          </View>

          {/* Final standings */}
          <Text style={styles.sectionLabel}>FINAL STANDINGS</Text>
          <View style={styles.card}>
            {data.final_standings.length === 0 ? (
              <Text style={styles.emptyText}>No standings recorded.</Text>
            ) : (
              data.final_standings.map((s, i) => {
                const isLast = i === data.final_standings.length - 1;
                const isMe =
                  !!user?.username &&
                  s.username.toLowerCase() === user.username.toLowerCase();
                return (
                  <View
                    key={`${s.username}-${i}`}
                    style={[styles.standingRow, !isLast && styles.rowBorder]}
                  >
                    <Text style={[styles.rank, s.rank === 1 && styles.rankGold]}>
                      #{s.rank}
                    </Text>
                    <View style={styles.memberAvatar}>
                      <Text style={styles.memberAvatarLetter}>
                        {(s.username || '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[styles.memberName, isMe && styles.me]} numberOfLines={1}>
                      {s.username}
                      {isMe ? '  (you)' : ''}
                    </Text>
                    <Text style={styles.memberPoints}>{s.score}</Text>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerBtn: { padding: 6 },
  headerTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: '#FFFFFF',
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingBottom: 40 },
  emptyText: { color: '#B3B3B3', padding: 16, textAlign: 'center' },

  topCard: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  trophyIconBox: {
    width: 72, height: 72, borderRadius: 16,
    backgroundColor: '#F59E0B',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  leagueName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 10,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 4,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B3B3B3',
    letterSpacing: 0.5,
  },
  metaDate: { fontSize: 12, color: '#B3B3B3' },
  scoreWrap: {
    marginTop: 20,
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#181818',
  },
  scoreLabel: {
    fontSize: 10,
    color: '#B3B3B3',
    fontWeight: '700',
    letterSpacing: 1,
  },
  scoreValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#7C3AED',
    marginTop: 4,
  },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B3B3B3',
    letterSpacing: 1.2,
    marginHorizontal: 20,
    marginTop: 18,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: '#181818',
    marginHorizontal: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  memberAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#282828',
    alignItems: 'center', justifyContent: 'center',
  },
  memberAvatarLetter: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  memberName: { flex: 1, fontSize: 14, color: '#FFFFFF' },
  memberPoints: { fontSize: 14, fontWeight: '700', color: '#FFFFFF', minWidth: 40, textAlign: 'right' },
  me: { color: '#7C3AED', fontWeight: '700' },

  standingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  rank: {
    width: 34,
    fontSize: 14,
    fontWeight: '800',
    color: '#B3B3B3',
  },
  rankGold: { color: '#F59E0B' },

  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  roundBadge: {
    width: 44, height: 44, borderRadius: 8,
    backgroundColor: '#282828',
    alignItems: 'center', justifyContent: 'center',
  },
  roundBadgeText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  subTitle: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  subArtist: { fontSize: 12, color: '#B3B3B3', marginTop: 2 },
  subPoints: { fontSize: 13, fontWeight: '700', color: '#7C3AED' },
});
