import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getPastLeagues, PastLeague } from '../../src/services/api';
import { useAuth } from '../../src/context/AuthContext';
import LeagueAvatar from '../../src/components/LeagueAvatar';

const formatDate = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export default function PastLeaguePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [league, setLeague] = useState<PastLeague | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getPastLeagues();
        if (cancelled) return;
        const found = res.data.leagues.find((l) => l.id === id) ?? null;
        setLeague(found);
      } catch {
        if (!cancelled) setLeague(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.headerBtn}>
            <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={{ width: 26 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator color="#7C3AED" />
        </View>
      </SafeAreaView>
    );
  }

  if (!league) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.headerBtn}>
            <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={{ width: 26 }} />
        </View>
        <View style={styles.center}>
          <Text style={styles.emptyText}>League not found in your history.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const finishedAt = formatDate(league.finished_at);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>PAST LEAGUE</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Top card */}
        <View style={styles.topCard}>
          <View style={styles.thumbWrap}>
            <LeagueAvatar image={league.league_image} size={72} imageBorderRadius={12} />
          </View>
          <Text style={styles.leagueName}>{league.name}</Text>
          <View style={styles.metaRow}>
            {league.is_deleted && (
              <View style={[styles.pill, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
                <Text style={[styles.pillText, { color: '#EF4444' }]}>DELETED</Text>
              </View>
            )}
            <View style={styles.pill}>
              <Text style={styles.pillText}>
                {league.rounds_completed}/{league.total_rounds} ROUNDS
              </Text>
            </View>
            {finishedAt ? (
              <Text style={styles.metaDate}>{finishedAt}</Text>
            ) : null}
          </View>
          {league.my_place != null && (
            <View style={styles.placeWrap}>
              <Text style={styles.placeLabel}>YOUR FINAL PLACE</Text>
              <Text style={styles.placeValue}>{ordinal(league.my_place)}</Text>
            </View>
          )}
        </View>

        {/* Final standings */}
        <Text style={styles.sectionLabel}>FINAL STANDINGS</Text>
        <View style={styles.card}>
          {league.standings.length === 0 ? (
            <Text style={styles.emptyText}>No standings recorded.</Text>
          ) : (
            league.standings.map((s, i) => {
              const isMe = s.user_id === user?.id;
              return (
                <View
                  key={s.user_id}
                  style={[
                    styles.standingRow,
                    i !== league.standings.length - 1 && styles.rowBorder,
                  ]}
                >
                  <Text style={[styles.rank, i === 0 && styles.rankGold]}>
                    #{i + 1}
                  </Text>
                  <View style={styles.memberAvatar}>
                    {s.profile_photo ? (
                      <Image source={{ uri: s.profile_photo }} style={styles.memberAvatarImg} />
                    ) : (
                      <Text style={styles.memberAvatarLetter}>
                        {s.username.charAt(0).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.memberName, isMe && styles.me]} numberOfLines={1}>
                    {s.username}
                    {isMe ? '  (you)' : ''}
                  </Text>
                  <Text style={styles.memberPoints}>{s.total_points}</Text>
                </View>
              );
            })
          )}
        </View>

        {/* My submissions */}
        <Text style={styles.sectionLabel}>SONGS YOU SUBMITTED</Text>
        <View style={styles.card}>
          {league.my_submissions.length === 0 ? (
            <Text style={styles.emptyText}>No submissions from you in this league.</Text>
          ) : (
            league.my_submissions.map((s, i) => (
              <View
                key={s.submission_id}
                style={[
                  styles.subRow,
                  i !== league.my_submissions.length - 1 && styles.rowBorder,
                ]}
              >
                <View style={styles.subArt}>
                  {s.song?.cover_url ? (
                    <Image source={{ uri: s.song.cover_url }} style={styles.subArtImg} />
                  ) : (
                    <Text style={styles.subArtLetter}>
                      {(s.song?.title || '?').charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subTitle} numberOfLines={1}>
                    {s.song?.title || '—'}
                  </Text>
                  <Text style={styles.subArtist} numberOfLines={1}>
                    {s.song?.artist}
                  </Text>
                  {s.round_theme ? (
                    <Text style={styles.subTheme} numberOfLines={1}>
                      R{s.round_number} · {s.round_theme}
                    </Text>
                  ) : (
                    <Text style={styles.subTheme}>R{s.round_number}</Text>
                  )}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
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
  thumbWrap: {
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
  placeWrap: {
    marginTop: 20,
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#181818',
  },
  placeLabel: {
    fontSize: 10,
    color: '#B3B3B3',
    fontWeight: '700',
    letterSpacing: 1,
  },
  placeValue: {
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
  rankGold: {
    color: '#F59E0B',
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  memberAvatarImg: { width: 32, height: 32, borderRadius: 16 },
  memberAvatarLetter: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  memberName: {
    flex: 1,
    color: '#FFFFFF',
    fontWeight: '500',
    fontSize: 14,
  },
  me: { fontWeight: '800' },
  memberPoints: {
    color: '#7C3AED',
    fontWeight: '800',
    fontSize: 15,
  },

  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  subArt: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#282828',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subArtImg: { width: 44, height: 44, borderRadius: 6 },
  subArtLetter: { color: '#FFFFFF', fontWeight: '700' },
  subTitle: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  subArtist: {
    color: '#B3B3B3',
    fontSize: 12,
    marginTop: 2,
  },
  subTheme: {
    color: '#7C3AED',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: 0.5,
  },
});
