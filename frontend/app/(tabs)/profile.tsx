import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Modal,
  Image,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../src/context/AuthContext';
import {
  getLeagues,
  getUserStats,
  getMySubmissions,
  getLifetimeStats,
  getUserTaste,
  MySubmission,
  UserStats,
  LifetimeStats,
  TasteBreakdown,
} from '../../src/services/api';
import { leagueEvents } from '../../src/utils/leagueEvents';
import AlbumArt from '../../src/components/AlbumArt';

const getLikedKey = (userId: string) => `liked_songs_${userId}`;

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

interface LikedSong {
  deezer_id: number;
  title: string;
  artist: string;
  album?: string;
  cover_url?: string;
  preview_url?: string;
}

function LikedSongRow({ song, onUnlike }: { song: LikedSong; onUnlike: () => void }) {
  const q = encodeURIComponent(`${song.title} ${song.artist}`);
  const open = (service: 'spotify' | 'apple' | 'youtube') => {
    const urls: Record<string, string> = {
      spotify: `https://open.spotify.com/search/${q}`,
      apple: `https://music.apple.com/search?term=${q}`,
      youtube: `https://www.youtube.com/results?search_query=${q}`,
    };
    Linking.openURL(urls[service]);
  };

  return (
    <View style={likedStyles.row}>
      <AlbumArt uri={song.cover_url ?? ''} size={44} borderRadius={4} />
      <View style={likedStyles.info}>
        <Text style={likedStyles.title} numberOfLines={1}>{song.title}</Text>
        <Text style={likedStyles.artist} numberOfLines={1}>{song.artist}</Text>
        <View style={likedStyles.links}>
          <TouchableOpacity
            style={[likedStyles.linkBtn, { backgroundColor: '#1DB954' }]}
            onPress={() => open('spotify')}
          >
            <FontAwesome name="spotify" size={11} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[likedStyles.linkBtn, { backgroundColor: '#FA243C' }]}
            onPress={() => open('apple')}
          >
            <Ionicons name="logo-apple" size={11} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[likedStyles.linkBtn, { backgroundColor: '#FF0000' }]}
            onPress={() => open('youtube')}
          >
            <Ionicons name="logo-youtube" size={11} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity style={likedStyles.trashBtn} onPress={onUnlike} hitSlop={8}>
        <Ionicons name="trash-outline" size={20} color="#6A6A6A" />
      </TouchableOpacity>
    </View>
  );
}

export default function MyGameScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [leaguesCount, setLeaguesCount] = useState(0);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [mySubmissions, setMySubmissions] = useState<MySubmission[]>([]);
  const [lifetimeStats, setLifetimeStats] = useState<LifetimeStats | null>(null);
  const [taste, setTaste] = useState<TasteBreakdown | null>(null);

  const [likedSongs, setLikedSongs] = useState<LikedSong[]>([]);
  const [showLiked, setShowLiked] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      // The My Game tiles read from lifetime endpoints only. We skip the
      // per-league standings fan-out that used to feed a
      // Math.max(lifetime, active-league-sum) tile so Clear Account Data
      // actually shows zeros post-clear — the lifetime endpoints are the
      // sole source of truth for the aggregate view.
      const [leaguesRes, statsRes, subsRes, lifetimeRes, tasteRes] = await Promise.all([
        getLeagues(),
        getUserStats().catch(() => null),
        getMySubmissions().catch(() => null),
        getLifetimeStats().catch(() => null),
        getUserTaste().catch(() => null),
      ]);
      setLeaguesCount(leaguesRes.data.length);
      setUserStats(statsRes?.data ?? null);
      setMySubmissions(subsRes?.data?.submissions ?? []);
      setLifetimeStats(lifetimeRes?.data ?? null);
      setTaste(tasteRes?.data ?? null);
    } catch {}
  }, []);

  // Placement + total_submissions_in_round now arrive inline with each
  // submission from /auth/submissions, so the per-row getResults fan-out
  // that used to live here is gone.

  const loadLikedSongs = useCallback(async () => {
    if (!user?.id) return;
    try {
      const raw = await AsyncStorage.getItem(getLikedKey(user.id));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
          setLikedSongs(parsed);
        } else {
          setLikedSongs([]);
        }
      } else {
        setLikedSongs([]);
      }
    } catch {
      setLikedSongs([]);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) loadLikedSongs();
  }, [user?.id, loadLikedSongs]);

  useFocusEffect(
    useCallback(() => {
      loadLikedSongs();
      loadStats();
    }, [loadLikedSongs, loadStats]),
  );

  // Also refresh when a league is created / deleted anywhere in the app,
  // so the "Leagues" stat on this tab stays in sync without waiting for
  // a re-focus.
  useEffect(() => {
    const unsub = leagueEvents.subscribe(loadStats);
    return () => {
      unsub();
    };
  }, [loadStats]);

  const unlikeSong = async (song: LikedSong) => {
    if (!user?.id) return;
    const next = likedSongs.filter((s) => s.deezer_id !== song.deezer_id);
    setLikedSongs(next);
    await AsyncStorage.setItem(getLikedKey(user.id), JSON.stringify(next)).catch(() => {});
  };

  const displayedSubmissions = mySubmissions.slice(0, 5);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.pageTitle}>MY GAME</Text>
          <Text style={styles.pageSubtitle}>Your taste, your stats, your songs.</Text>
        </View>

        {/* 2x2 Stats grid — backed solely by lifetime stats so Clear
            Account Data actually zeros the tiles. Per-league standings
            remain visible on each league's own detail page. */}
        <View style={styles.statsGrid}>
          <StatTile
            label="LEAGUES PLAYED"
            value={userStats?.leagues_count ?? leaguesCount}
          />
          <StatTile
            label="TOTAL PTS"
            value={lifetimeStats?.all_time_points ?? 0}
          />
          <StatTile
            label="WINS"
            value={lifetimeStats?.total_wins ?? 0}
          />
          <StatTile
            label="SUBMISSIONS"
            value={lifetimeStats?.total_submissions ?? 0}
          />
        </View>

        {/* Your Taste · All-Time */}
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
                Submit songs in your leagues and we'll build your taste profile here.
              </Text>
            </View>
          )}
        </View>

        {/* Recent submissions */}
        <Text style={styles.sectionLabel}>RECENT SUBMISSIONS</Text>
        <View style={styles.group}>
          {displayedSubmissions.length > 0 ? (
            displayedSubmissions.map((sub, idx, arr) => {
              const last = idx === arr.length - 1;

              // State label + whether to surface points/placement.
              // Matrix (spec):
              //   round submission              → "Open · Submission", hide
              //   round voting                  → "Open · Voting", hide
              //   round completed + league active    → "Completed", show
              //   round completed + league completed → "Final result", show
              //   league deleted + round was completed → "League deleted", show frozen
              //   league deleted + round not completed → "League deleted", hide
              const leagueDeleted = sub.league_status === 'deleted';
              const roundCompleted = sub.round_status === 'completed';
              const leagueCompleted = sub.league_status === 'completed';

              let labelPrimary: string;
              let showScored: boolean;
              if (leagueDeleted) {
                labelPrimary = 'League deleted';
                // Only surface scored data if the round actually finished
                // before the league was deleted.
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
                // skipped or unexpected states
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

        {/* Liked Songs */}
        <Text style={styles.sectionLabel}>LIKED SONGS</Text>
        <View style={styles.group}>
          <TouchableOpacity
            style={[styles.row, styles.rowLast]}
            onPress={() => setShowLiked(true)}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <View style={styles.likedIconBox}>
                <Ionicons name="heart" size={20} color="#FFFFFF" />
              </View>
              <View>
                <Text style={styles.rowLabel}>Your liked songs</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#B3B3B3" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Liked Songs Modal */}
      <Modal visible={showLiked} animationType="slide" onRequestClose={() => setShowLiked(false)}>
        <View style={likedStyles.container}>
          <View style={[likedStyles.header, { paddingTop: insets.top + 16 }]}>
            <TouchableOpacity
              onPress={() => setShowLiked(false)}
              activeOpacity={0.7}
              style={likedStyles.backBtn}
            >
              <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={likedStyles.headerTitle}>Liked Songs</Text>
            <View style={likedStyles.headerSpacer} />
          </View>
          {likedSongs.length === 0 ? (
            <View style={likedStyles.empty}>
              <Ionicons name="heart-outline" size={52} color="rgba(255,255,255,0.15)" />
              <Text style={likedStyles.emptyTitle}>No liked songs yet</Text>
              <Text style={likedStyles.emptyText}>
                Heart songs in the Discover tab to save them here.
              </Text>
            </View>
          ) : (
            <FlatList
              data={likedSongs}
              keyExtractor={(item) => String(item.deezer_id)}
              renderItem={({ item }) => (
                <LikedSongRow song={item} onUnlike={() => unlikeSong(item)} />
              )}
              contentContainerStyle={[likedStyles.list, { paddingBottom: insets.bottom + 16 }]}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={likedStyles.separator} />}
            />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statTileValue}>{value.toLocaleString()}</Text>
      <Text style={styles.statTileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  scroll: { paddingBottom: 48 },

  headerRow: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#B3B3B3',
    marginTop: 4,
  },

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
  statTileValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  statTileLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B3B3B3',
    letterSpacing: 1,
    marginTop: 6,
  },
  emptyBlurb: {
    fontSize: 13,
    color: '#B3B3B3',
    lineHeight: 19,
    padding: 16,
    textAlign: 'center',
  },
  tasteBarEmpty: {
    backgroundColor: '#282828',
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
  group: {
    backgroundColor: '#181818',
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  rowLast: { borderBottomWidth: 0 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  rowLabel: { fontSize: 14, color: '#FFFFFF', fontWeight: '500' },

  likedIconBox: {
    width: 44, height: 44, borderRadius: 8,
    backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center',
  },
  likedSubtitle: { fontSize: 13, color: '#B3B3B3', marginTop: 2 },

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

  submissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  submissionArt: {
    width: 48, height: 48, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  submissionArtImage: { width: 48, height: 48, borderRadius: 6 },
  submissionArtInitial: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  submissionInfo: { flex: 1, marginRight: 8 },
  submissionTitle: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  submissionArtist: { fontSize: 12, color: '#B3B3B3', marginTop: 2 },
  leaguePill: {
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: 'rgba(124,58,237,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  leaguePillText: {
    color: '#A78BFA',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  placeCol: { alignItems: 'center', minWidth: 56 },
  placeOrdinal: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  placeOf: { color: '#B3B3B3', fontSize: 10, letterSpacing: 0.5, marginTop: 2 },
  submissionPending: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F59E0B',
    letterSpacing: 0.6,
  },
  submissionContext: {
    color: '#B3B3B3',
    fontSize: 11,
    marginTop: 6,
  },
  submissionState: {
    color: '#6A6A6A',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
  },
});

const likedStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backBtn: {
    minWidth: 44, minHeight: 44,
    alignItems: 'flex-start', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#FFFFFF' },
  headerSpacer: { minWidth: 44 },
  list: { paddingHorizontal: 16, paddingTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  separator: { height: 0.5, backgroundColor: 'rgba(255,255,255,0.1)' },
  info: { flex: 1 },
  title: { fontSize: 14, fontWeight: '500', color: '#FFFFFF' },
  artist: { fontSize: 13, color: '#B3B3B3', marginTop: 2 },
  links: { flexDirection: 'row', gap: 6, marginTop: 6 },
  linkBtn: {
    width: 24, height: 24, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  trashBtn: { padding: 4 },
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40, gap: 12,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  emptyText: { fontSize: 14, color: '#B3B3B3', textAlign: 'center', lineHeight: 20 },
});
