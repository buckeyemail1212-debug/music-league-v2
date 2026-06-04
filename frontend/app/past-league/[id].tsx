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
  const [segment, setSegment] = useState<'standings' | 'songs'>('standings');

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
  const isNotFinished = league.ended_status === 'not_finished';
  // Active players competed for placement; left users render at the
  // bottom but not in the rank column.
  const activeStandings = league.standings.filter((s) => !s.left);
  const leftStandings = league.standings.filter((s) => s.left);

  const mySubByRoundId: Record<string, typeof league.my_submissions[number]> = {};
  for (const sub of league.my_submissions) {
    mySubByRoundId[sub.round_id] = sub;
  }
  const userId = user?.id ?? '';

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
            <LeagueAvatar
              image={league.league_image}
              name={league.name}
              size={280}
              imageBorderRadius={56}
            />
          </View>
          <Text style={styles.leagueName}>{league.name}</Text>
          <View style={styles.metaRow}>
            {isNotFinished && (
              <View style={styles.notFinishedPill}>
                <Text style={styles.notFinishedText}>NOT FINISHED</Text>
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
          {!isNotFinished && league.my_place != null && (
            <View style={styles.placeWrap}>
              <Text style={styles.placeLabel}>YOUR FINAL PLACE</Text>
              <Text style={styles.placeValue}>{ordinal(league.my_place)}</Text>
            </View>
          )}
        </View>

        {isNotFinished && (
          <View style={styles.bannerCard}>
            <Ionicons name="alert-circle" size={18} color="#B3B3B3" style={{ marginRight: 8 }} />
            <Text style={styles.bannerText}>
              League ended early
              {league.creator_username ? ` by ${league.creator_username}` : ''}.
              Final results not available.
            </Text>
          </View>
        )}

        <View style={styles.tabContainer}>
          {(['standings', 'songs'] as const).map((tab) => {
            const active = segment === tab;
            const label = tab === 'standings' ? 'Standings' : 'Songs you submitted';
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setSegment(tab)}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Final standings */}
        {segment === 'standings' && (
          league.standings.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.emptyText}>No standings recorded.</Text>
            </View>
          ) : (
            <View style={styles.standingsListWrap}>
              {activeStandings.map((s, i) => {
                const isMe = s.user_id === user?.id;
                return (
                  <View
                    key={s.user_id}
                    style={[styles.standingCard, isMe && styles.standingCardMe]}
                  >
                    <Text
                      style={[
                        styles.rank,
                        i === 0 && !isNotFinished && styles.rankGold,
                      ]}
                    >
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
              })}
              {leftStandings.map((s) => {
                const isMe = s.user_id === user?.id;
                return (
                  <View
                    key={`left-${s.user_id}`}
                    style={[
                      styles.standingCard,
                      styles.standingCardLeft,
                      isMe && styles.standingCardMe,
                    ]}
                  >
                    <Text style={[styles.rank, styles.rankMuted]}>—</Text>
                    <View style={[styles.memberAvatar, { opacity: 0.55 }]}>
                      {s.profile_photo ? (
                        <Image source={{ uri: s.profile_photo }} style={styles.memberAvatarImg} />
                      ) : (
                        <Text style={styles.memberAvatarLetter}>
                          {s.username.charAt(0).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={styles.memberLeftWrap}>
                      <Text
                        style={[styles.memberName, styles.memberNameLeft, isMe && styles.me]}
                        numberOfLines={1}
                      >
                        {s.username}
                        {isMe ? '  (you)' : ''}
                      </Text>
                      <View style={styles.leftBadge}>
                        <Text style={styles.leftBadgeText}>LEFT</Text>
                      </View>
                    </View>
                    <Text style={[styles.memberPoints, styles.memberPointsLeft]}>
                      {s.total_points}
                    </Text>
                  </View>
                );
              })}
            </View>
          )
        )}

        {/* Per-round results */}
        {segment === 'songs' && (
          !league.rounds || league.rounds.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.emptyText}>No round data available.</Text>
            </View>
          ) : (
            <View style={styles.roundsListWrap}>
              {league.rounds
                .filter((r) => r.status === 'completed')
                .sort((a, b) => (a.round_number ?? 0) - (b.round_number ?? 0))
                .map((r) => {
                  const mySub = mySubByRoundId[r.round_id];
                  const myPlacement = r.placements?.[userId];
                  const winner = r.winner;
                  return (
                    <View key={r.round_id} style={styles.roundCard}>
                      {/* Round header strip */}
                      <View style={styles.roundHeader}>
                        <Text style={styles.roundHeaderText}>
                          R{r.round_number}{r.theme ? ` · ${r.theme}` : ''}
                        </Text>
                        {myPlacement != null && (
                          <View style={styles.placementChip}>
                            <Text style={styles.placementChipText}>
                              You: {ordinal(myPlacement)}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Winner block */}
                      {winner ? (
                        <View style={styles.winnerBlock}>
                          <View style={styles.winnerArt}>
                            {winner.song?.cover_url ? (
                              <Image
                                source={{ uri: winner.song.cover_url }}
                                style={styles.winnerArtImg}
                              />
                            ) : (
                              <Text style={styles.winnerArtLetter}>
                                {(winner.song?.title || '?').charAt(0).toUpperCase()}
                              </Text>
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.winnerLabel}>WINNER</Text>
                            <Text style={styles.winnerTitle} numberOfLines={1}>
                              {winner.song?.title || '—'}
                            </Text>
                            <Text style={styles.winnerArtist} numberOfLines={1}>
                              {winner.song?.artist || ''}
                            </Text>
                            <Text style={styles.winnerByLine} numberOfLines={1}>
                              Won by {winner.username}
                            </Text>
                          </View>
                        </View>
                      ) : (
                        <Text style={styles.noWinnerText}>No winner — round had no votes.</Text>
                      )}

                      {/* Your submission line */}
                      <View style={styles.yourSubBlock}>
                        {mySub && mySub.song ? (
                          <>
                            <View style={styles.yourSubArt}>
                              {mySub.song.cover_url ? (
                                <Image
                                  source={{ uri: mySub.song.cover_url }}
                                  style={styles.yourSubArtImg}
                                />
                              ) : (
                                <Text style={styles.yourSubArtLetter}>
                                  {(mySub.song.title || '?').charAt(0).toUpperCase()}
                                </Text>
                              )}
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.yourSubLabel}>YOUR SUBMISSION</Text>
                              <Text style={styles.yourSubTitle} numberOfLines={1}>
                                {mySub.song.title || '—'}
                              </Text>
                              <Text style={styles.yourSubArtist} numberOfLines={1}>
                                {mySub.song.artist || ''}
                              </Text>
                            </View>
                          </>
                        ) : (
                          <Text style={styles.yourSubMissingText}>
                            You didn't submit for this round.
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })}
            </View>
          )
        )}
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
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: '#FFFFFF',
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingBottom: 40 },
  emptyText: { color: '#B3B3B3', padding: 16, textAlign: 'center' },

  topCard: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  thumbWrap: {
    marginBottom: 22,
  },
  leagueName: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'nowrap',
    justifyContent: 'center',
    marginTop: 10,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 999,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  metaDate: { fontSize: 13, color: '#9A9A9A' },
  placeWrap: {
    marginTop: 20,
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: 28,
    paddingVertical: 22,
    borderRadius: 22,
    backgroundColor: '#222225',
  },
  placeLabel: {
    fontSize: 11,
    color: '#B3B3B3',
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  placeValue: {
    fontSize: 54,
    fontWeight: '800',
    color: '#7C5CFF',
    letterSpacing: -1,
    lineHeight: 60,
  },

  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 0,
    gap: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tabActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B3B3B3',
  },
  tabTextActive: {
    color: '#FFFFFF',
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
    marginTop: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },

  standingsListWrap: {
    marginHorizontal: 16,
    marginTop: 20,
  },
  standingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: '#1A1A1C',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  standingCardMe: {
    backgroundColor: 'rgba(124, 92, 255, 0.14)',
    borderColor: '#7C3AED',
  },
  standingCardLeft: {
    opacity: 0.55,
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
  rankMuted: {
    color: '#6A6A6A',
  },
  standingRowLeft: {
    opacity: 0.7,
  },
  memberLeftWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberNameLeft: {
    color: '#B3B3B3',
    flexShrink: 1,
  },
  memberPointsLeft: {
    color: '#B3B3B3',
  },
  leftBadge: {
    marginLeft: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  leftBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B3B3B3',
    letterSpacing: 0.5,
  },
  notFinishedPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 4,
  },
  notFinishedText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B3B3B3',
    letterSpacing: 0.5,
  },
  bannerCard: {
    marginHorizontal: 20,
    marginBottom: 8,
    marginTop: -8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  bannerText: {
    flex: 1,
    color: '#D9D9D9',
    fontSize: 13,
    lineHeight: 18,
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

  roundsListWrap: {
    marginHorizontal: 16,
    marginTop: 20,
  },
  roundCard: {
    backgroundColor: '#161618',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  roundHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  roundHeaderText: {
    color: '#7C3AED',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  placementChip: {
    backgroundColor: 'rgba(124, 58, 237, 0.18)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 8,
  },
  placementChipText: {
    color: '#7C3AED',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  winnerBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  winnerArt: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#2A2A2D',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 12,
  },
  winnerArtImg: { width: 56, height: 56, borderRadius: 8 },
  winnerArtLetter: { color: '#FFFFFF', fontWeight: '700' },
  winnerLabel: {
    color: '#F5A524',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 2,
  },
  winnerTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  winnerArtist: {
    color: '#B3B3B3',
    fontSize: 13,
    marginTop: 1,
  },
  winnerByLine: {
    color: '#9A9A9A',
    fontSize: 12,
    marginTop: 4,
  },
  noWinnerText: {
    color: '#9A9A9A',
    fontSize: 13,
    fontStyle: 'italic',
    paddingVertical: 12,
  },
  yourSubBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  yourSubArt: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#2A2A2D',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 12,
  },
  yourSubArtImg: { width: 44, height: 44, borderRadius: 6 },
  yourSubArtLetter: { color: '#FFFFFF', fontWeight: '700' },
  yourSubLabel: {
    color: '#9A9A9A',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 2,
  },
  yourSubTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  yourSubArtist: {
    color: '#9A9A9A',
    fontSize: 12,
    marginTop: 1,
  },
  yourSubMissingText: {
    color: '#9A9A9A',
    fontSize: 13,
    fontStyle: 'italic',
    paddingVertical: 12,
  },
});
