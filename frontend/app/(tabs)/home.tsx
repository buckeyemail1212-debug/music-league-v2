import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Modal,
  Image,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import {
  getLeagues,
  getRounds,
  getLeagueStandings,
  getPastLeagues,
  League,
  Round,
  LeagueStandings,
  PastLeague,
} from '../../src/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { leagueEvents } from '../../src/utils/leagueEvents';
import { pluralize } from '../../src/utils/pluralize';
import LeagueAvatar from '../../src/components/LeagueAvatar';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

const parseDeadline = (d: string) =>
  new Date(d.endsWith('Z') || d.includes('+') ? d : d + 'Z');

const shortDay = (deadline: string): string => {
  const end = parseDeadline(deadline);
  const today = new Date();
  const diffDays = Math.floor(
    (new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime() -
      new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000,
  );
  if (diffDays <= 0) return 'TODAY';
  if (diffDays === 1) return 'TMRW';
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  return days[end.getDay()];
};

const formatFinishDate = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const ordinalBadge = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [leagues, setLeagues] = useState<League[]>([]);
  const [activeRounds, setActiveRounds] = useState<{ [id: string]: Round | null }>({});
  const [cachedImages, setCachedImages] = useState<{ [id: string]: string }>({});
  const [zoomLeagueImage, setZoomLeagueImage] = useState<string | null>(null);
  const [leagueStandings, setLeagueStandings] = useState<{ [leagueId: string]: LeagueStandings }>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pastLeagues, setPastLeagues] = useState<PastLeague[]>([]);
  const [pastExpanded, setPastExpanded] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const dataLoaded = useRef(false);

  useEffect(() => {
    const t = setInterval(() => {}, 1000);
    return () => clearInterval(t);
  }, []);

  const fetchAll = async () => {
    try {
      const [leaguesRes, pastRes] = await Promise.all([
        getLeagues(),
        getPastLeagues().catch(() => ({ data: { leagues: [] } } as any)),
      ]);
      const active = leaguesRes.data.filter(
        (l) => !(l.current_round > 0 && l.current_round >= l.total_rounds),
      );
      setLeagues(active);
      setPastLeagues(pastRes?.data?.leagues ?? []);
      dataLoaded.current = true;

      const imgCache: { [id: string]: string } = {};
      await Promise.all(
        active.map(async (l) => {
          if (!l.league_image) {
            try {
              const cached = user?.id
                ? await AsyncStorage.getItem(`league_image_${user.id}_${l.id}`)
                : null;
              if (cached) imgCache[l.id] = cached;
            } catch {}
          }
        }),
      );
      setCachedImages(imgCache);

      const roundsData: { [id: string]: Round | null } = {};
      const standingsData: { [id: string]: LeagueStandings } = {};
      await Promise.all(
        active.map(async (l) => {
          const [roundsRes, standingsRes] = await Promise.all([
            getRounds(l.id).catch(() => null),
            getLeagueStandings(l.id).catch(() => null),
          ]);
          if (roundsRes) {
            const rounds = roundsRes.data;
            roundsData[l.id] =
              rounds.find((r: Round) => r.status === 'submission' || r.status === 'voting') ||
              null;
          } else roundsData[l.id] = null;
          if (standingsRes) standingsData[l.id] = standingsRes.data;
        }),
      );
      setActiveRounds(roundsData);
      setLeagueStandings(standingsData);
    } catch (err) {
      console.error('Failed to fetch home data:', err);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchAll();
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    }, []),
  );

  useEffect(() => {
    const unsub = leagueEvents.subscribe(fetchAll);
    return () => {
      unsub();
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const togglePast = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPastExpanded((v) => !v);
  };

  const renderLeagueItem = ({ item }: { item: League }) => {
    const activeRound = activeRounds[item.id];
    const displayImage = item.league_image || cachedImages[item.id];
    const standings = leagueStandings[item.id];
    const sorted = standings?.standings ?? [];
    const mineIdx = sorted.findIndex((s) => s.user_id === user?.id);
    const mine = mineIdx >= 0 ? sorted[mineIdx] : null;
    const leader = sorted[0];
    const rank = mineIdx >= 0 ? mineIdx + 1 : null;
    const myPoints = mine?.total_points ?? 0;
    const leaderPoints = leader?.total_points ?? 0;
    const isLeading = rank === 1 && myPoints > 0;
    const progressPct = leaderPoints > 0 ? Math.min(1, myPoints / leaderPoints) : 0;

    let pillText: string | null = null;
    let pillColor = '#B3B3B3';
    if (activeRound) {
      if (activeRound.status === 'voting') {
        pillText = activeRound.has_user_voted ? 'VOTED' : 'VOTING OPEN';
        pillColor = '#10B981';
      } else if (activeRound.status === 'submission') {
        pillText = activeRound.has_user_submitted
          ? 'SUBMITTED'
          : `SUBMIT BY ${shortDay(activeRound.submission_deadline)}`;
        pillColor = activeRound.has_user_submitted ? '#10B981' : '#F59E0B';
      }
    } else if (item.current_round > 0) {
      pillText = 'COMPLETED';
      pillColor = '#6A6A6A';
    }

    const hasStarted = item.current_round > 0;
    const hasAnyPoints = sorted.some((p) => (p.total_points || 0) > 0);

    return (
      <TouchableOpacity
        style={styles.leagueCardV2}
        onPress={() => router.push(`/league/${item.id}`)}
        onLongPress={() => displayImage && setZoomLeagueImage(displayImage)}
        delayLongPress={300}
        activeOpacity={0.75}
      >
        <View style={styles.leagueCardTopRow}>
          <LeagueAvatar image={displayImage} size={44} imageBorderRadius={8} />
          <View style={styles.leagueCardInfo}>
            <Text style={styles.leagueCardName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.leagueCardSubtext} numberOfLines={1}>
              {hasStarted
                ? `R${item.current_round}/${item.total_rounds} · ${pluralize(item.members.length, 'player')}`
                : `${pluralize(item.members.length, 'player')} · Code ${item.league_code}`}
            </Text>
          </View>
          {pillText && (
            <View style={[styles.statusPill, { borderColor: pillColor, backgroundColor: `${pillColor}22` }]}>
              <Text style={[styles.statusPillText, { color: pillColor }]}>{pillText}</Text>
            </View>
          )}
        </View>

        {hasStarted && hasAnyPoints && rank !== null ? (
          <View style={styles.leagueCardProgressRow}>
            <Text style={styles.leagueCardRank}>#{rank}</Text>
            <View style={styles.leagueCardMiddle}>
              <Text style={[styles.leagueCardGap, isLeading && { color: '#10B981' }]}>
                {isLeading
                  ? 'LEADING'
                  : leaderPoints > myPoints
                    ? `${pluralize(leaderPoints - myPoints, 'PT', 'PTS')} BEHIND`
                    : 'TIED FOR 1ST'}
              </Text>
              <View style={styles.progressBarTrack}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.max(4, progressPct * 100)}%`,
                      backgroundColor: isLeading ? '#10B981' : '#7C3AED',
                    },
                  ]}
                />
              </View>
            </View>
            <Text style={styles.leagueCardTotal}>{myPoints}</Text>
          </View>
        ) : (
          <View style={styles.leagueCardProgressRow}>
            <View style={styles.memberAvatarsInline}>
              {item.members.slice(0, 5).map((m, i) => (
                <View
                  key={m.id}
                  style={[
                    styles.memberAvatarInline,
                    { marginLeft: i > 0 ? -8 : 0, zIndex: 5 - i },
                  ]}
                >
                  {m.profile_photo ? (
                    <Image source={{ uri: m.profile_photo }} style={styles.memberAvatarInlineImage} />
                  ) : (
                    <Text style={styles.memberAvatarInlineText}>
                      {m.username.charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
              ))}
              {item.members.length > 5 && (
                <View
                  style={[
                    styles.memberAvatarInline,
                    styles.memberAvatarInlineMore,
                    { marginLeft: -8, zIndex: 0 },
                  ]}
                >
                  <Text style={styles.memberAvatarInlineMoreText}>
                    +{item.members.length - 5}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.leagueCardMiddle}>
              <Text style={styles.leagueCardGap}>
                {hasStarted ? 'NO POINTS YET' : 'NOT STARTED'}
              </Text>
              <View style={styles.progressBarTrack} />
            </View>
            <Ionicons name="chevron-forward" size={18} color="#6A6A6A" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderPastRow = (p: PastLeague) => {
    return (
      <TouchableOpacity
        key={p.id}
        style={styles.pastRow}
        activeOpacity={0.75}
        onPress={() => router.push(`/past-league/${p.id}` as any)}
      >
        <LeagueAvatar image={p.league_image} size={40} imageBorderRadius={8} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={styles.pastNameRow}>
            <Text style={styles.pastName} numberOfLines={1}>
              {p.name}
            </Text>
            {p.is_deleted && (
              <View style={styles.deletedTag}>
                <Text style={styles.deletedTagText}>DELETED</Text>
              </View>
            )}
          </View>
          <Text style={styles.pastMeta} numberOfLines={1}>
            {formatFinishDate(p.finished_at)} · {p.rounds_completed}/{p.total_rounds}
            {p.winner ? ` · ${p.winner.username} won` : ''}
          </Text>
        </View>
        {p.my_place != null ? (
          <View style={styles.placeBadge}>
            <Text style={styles.placeBadgeText}>{ordinalBadge(p.my_place)}</Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={18} color="#6A6A6A" />
        )}
      </TouchableOpacity>
    );
  };

  const activeCount = leagues.length;

  const listHeader = (
    <View>
      {/* Greeting row with gear + help */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{getGreeting()},</Text>
          <Text style={styles.username}>{user?.display_name || user?.username}</Text>
        </View>
        <TouchableOpacity
          style={styles.headerIconBtn}
          hitSlop={10}
          onPress={() => router.push('/how-to-play' as any)}
        >
          <Ionicons name="help-circle-outline" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerIconBtn}
          hitSlop={10}
          onPress={() => router.push('/settings' as any)}
        >
          <Ionicons name="settings-outline" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Active leagues section header */}
      {activeCount > 0 && (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderTitle}>ACTIVE LEAGUES</Text>
          <Text style={styles.sectionHeaderCount}>{activeCount} ACTIVE</Text>
        </View>
      )}
    </View>
  );

  const listFooter =
    pastLeagues.length > 0 ? (
      <View style={{ marginTop: leagues.length > 0 ? 20 : 6 }}>
        <TouchableOpacity
          style={styles.pastToggle}
          onPress={togglePast}
          activeOpacity={0.8}
        >
          <Text style={styles.sectionHeaderTitle}>PAST LEAGUES</Text>
          <View style={styles.pastToggleRight}>
            <Text style={styles.sectionHeaderCount}>{pastLeagues.length}</Text>
            <Ionicons
              name={pastExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color="#B3B3B3"
            />
          </View>
        </TouchableOpacity>
        {pastExpanded && (
          <View style={styles.pastList}>
            {pastLeagues.map(renderPastRow)}
          </View>
        )}
      </View>
    ) : null;

  return (
    <SafeAreaView style={styles.container}>
      {loading && !dataLoaded.current ? (
        <View style={styles.listContent}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.skeletonLineShort} />
              <View style={styles.skeletonLineLong} />
            </View>
          </View>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.leagueCardV2, styles.skeletonCard, { height: 110 }]} />
          ))}
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={leagues}
          keyExtractor={(item) => item.id}
          renderItem={renderLeagueItem}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="musical-notes" size={56} color="#7C3AED" />
              <Text style={styles.emptyTitle}>No active leagues</Text>
              <Text style={styles.emptyText}>
                Tap the + button below to create a league or join one.
              </Text>
            </View>
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#7C3AED"
            />
          }
        />
      )}

      <Modal
        visible={!!zoomLeagueImage}
        transparent
        animationType="fade"
        onRequestClose={() => setZoomLeagueImage(null)}
      >
        <TouchableOpacity
          style={styles.zoomOverlay}
          activeOpacity={1}
          onPress={() => setZoomLeagueImage(null)}
        >
          <View style={styles.zoomContainer}>
            {zoomLeagueImage && (
              <Image source={{ uri: zoomLeagueImage }} style={styles.zoomImage} resizeMode="contain" />
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
    gap: 6,
  },
  greeting: { fontSize: 14, color: '#B3B3B3', fontWeight: '400' },
  username: { fontSize: 26, fontWeight: '700', color: '#FFFFFF', marginTop: 2 },
  headerIconBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },

  listContent: { paddingHorizontal: 20, paddingBottom: 40, flexGrow: 1 },
  skeletonCard: { opacity: 0.6, backgroundColor: '#181818' },
  skeletonLineLong: {
    height: 14, width: '60%', borderRadius: 4, backgroundColor: '#282828', marginBottom: 8,
  },
  skeletonLineShort: {
    height: 12, width: '35%', borderRadius: 4, backgroundColor: '#1F1F1F', marginBottom: 8,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  sectionHeaderCount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B3B3B3',
    letterSpacing: 1,
  },

  leagueCardV2: {
    backgroundColor: '#181818',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  leagueCardTopRow: { flexDirection: 'row', alignItems: 'center' },
  leagueCardInfo: { flex: 1, marginLeft: 12, marginRight: 8 },
  leagueCardName: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  leagueCardSubtext: { fontSize: 12, color: '#B3B3B3', marginTop: 2 },
  statusPill: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, borderWidth: 1,
  },
  statusPillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  leagueCardProgressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  leagueCardRank: { fontSize: 18, fontWeight: '700', color: '#7C3AED', width: 44 },
  leagueCardMiddle: { flex: 1, marginHorizontal: 8 },
  leagueCardGap: {
    fontSize: 10, fontWeight: '700', color: '#B3B3B3',
    letterSpacing: 0.8, marginBottom: 6,
  },
  progressBarTrack: {
    height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden',
  },
  progressBarFill: { height: 4, borderRadius: 2 },
  leagueCardTotal: {
    fontSize: 18, fontWeight: '700', color: '#FFFFFF',
    minWidth: 40, textAlign: 'right',
  },
  memberAvatarsInline: { flexDirection: 'row', alignItems: 'center', width: 78 },
  memberAvatarInline: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#282828', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#181818', overflow: 'hidden',
  },
  memberAvatarInlineImage: { width: 24, height: 24, borderRadius: 12 },
  memberAvatarInlineText: { fontSize: 10, fontWeight: '600', color: '#FFFFFF' },
  memberAvatarInlineMore: { backgroundColor: '#3A3A3A' },
  memberAvatarInlineMoreText: { fontSize: 9, fontWeight: '600', color: '#B3B3B3' },

  // Past leagues
  pastToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  pastToggleRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pastList: {
    marginTop: 4,
    backgroundColor: '#181818',
    borderRadius: 12,
    overflow: 'hidden',
  },
  pastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  pastNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pastName: { color: '#FFFFFF', fontWeight: '700', fontSize: 14, flexShrink: 1 },
  pastMeta: { color: '#B3B3B3', fontSize: 12, marginTop: 2 },
  deletedTag: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  deletedTagText: {
    color: '#EF4444',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  placeBadge: {
    minWidth: 44,
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(124,58,237,0.15)',
  },
  placeBadgeText: {
    color: '#7C3AED',
    fontWeight: '800',
    fontSize: 13,
  },
  pastEmpty: { padding: 20 },
  pastEmptyText: { color: '#B3B3B3', fontSize: 13, textAlign: 'center' },

  emptyState: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingVertical: 64, paddingHorizontal: 40,
  },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: '#FFFFFF', marginTop: 14 },
  emptyText: { fontSize: 14, color: '#B3B3B3', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  zoomOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center', alignItems: 'center',
  },
  zoomContainer: { width: '80%', aspectRatio: 1, borderRadius: 20, overflow: 'hidden' },
  zoomImage: { width: '100%', height: '100%' },
});
