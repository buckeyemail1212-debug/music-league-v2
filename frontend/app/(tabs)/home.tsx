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
  getPublicLeagues,
  League,
  Round,
  LeagueStandings,
  PastLeague,
} from '../../src/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { leagueEvents } from '../../src/utils/leagueEvents';
import { pluralize } from '../../src/utils/pluralize';
import { getOrdinalSuffix } from '../../src/utils/ordinal';
import { pastLeaguesCache } from '../../src/utils/pastLeaguesCache';
import { publicLeaguesCache } from '../../src/utils/publicLeaguesCache';
import LeagueAvatar from '../../src/components/LeagueAvatar';
import CreateJoinSheet from '../../src/components/CreateJoinSheet';
import StoriesRing from '../../src/components/StoriesRing';

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

const parseDeadline = (d: string) =>
  new Date(d.endsWith('Z') || d.includes('+') ? d : d + 'Z');

// Live-ticking countdown pill. Owns its own timer so the rest of the home
// screen doesn't re-render every second just to move a single digit.
// Adaptive cadence: when the remaining time is under 2 minutes we tick
// every second to animate the seconds readout; above that, every 30s is
// plenty since only the minute digit changes.
function CountdownPill({
  deadline,
  color,
  prefix,
}: {
  deadline: string;
  color: string;
  prefix?: string;
}) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (cancelled) return;
      const remaining = parseDeadline(deadline).getTime() - Date.now();
      if (remaining <= 0) return; // stop ticking once expired
      const delay = remaining < 2 * 60 * 1000 ? 1000 : 30000;
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        setNowMs(Date.now());
        schedule();
      }, delay);
    };
    schedule();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [deadline]);

  const label = formatCountdown(deadline, nowMs);
  return (
    <View style={[styles.statusPill, { borderColor: color, backgroundColor: `${color}22` }]}>
      <Text style={[styles.statusPillText, { color }]}>
        {prefix ? `${prefix} ${label}` : label}
      </Text>
    </View>
  );
}

// Smart-format a countdown:
//   >24h → "2D 14H 23M"
//   >1h  → "14H 23M"
//   >1m  → "23M"
//   <1m  → "45S" (the only case that shows seconds)
const formatCountdown = (deadline: string, now: number = Date.now()): string => {
  const diffMs = parseDeadline(deadline).getTime() - now;
  if (diffMs <= 0) return '0S';
  const totalSeconds = Math.floor(diffMs / 1000);
  if (totalSeconds < 60) return `${Math.max(1, totalSeconds)}S`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}M`;
  const hours = Math.floor(totalMinutes / 60);
  const minutesAfterHours = totalMinutes % 60;
  if (hours < 24) return `${hours}H ${minutesAfterHours}M`;
  const days = Math.floor(hours / 24);
  const hoursAfterDays = hours % 24;
  return `${days}D ${hoursAfterDays}H ${minutesAfterHours}M`;
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
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [publicCount, setPublicCount] = useState<number>(
    () => publicLeaguesCache.get()?.length ?? 0,
  );

  const flatListRef = useRef<FlatList>(null);
  const dataLoaded = useRef(false);

  const fetchAll = async () => {
    try {
      const [leaguesRes, pastRes, publicRes] = await Promise.all([
        getLeagues(),
        getPastLeagues().catch(() => ({ data: { leagues: [] } } as any)),
        getPublicLeagues().catch(
          () => ({ data: { leagues: [], count: 0 } } as any),
        ),
      ]);
      const publicList = publicRes?.data?.leagues ?? [];
      setPublicCount(publicList.length);
      publicLeaguesCache.set(publicList);
      // A league is "active" iff it hasn't been marked completed. The old
      // `current_round >= total_rounds` heuristic incorrectly hid leagues
      // whose final round was ready/submission/voting (since
      // `current_round` is bumped when the final round unlocks, long
      // before that round actually finishes). `status === "completed"` is
      // set by the auto-advance helper only when the final round's voting
      // phase ends, which is the true Active→Past boundary.
      const active = leaguesRes.data.filter((l) => l.status !== 'completed');
      setLeagues(active);
      const past = pastRes?.data?.leagues ?? [];
      setPastLeagues(past);
      // Warm the shared cache so the Past Leagues page renders instantly
      // when the user taps through from the home row.
      pastLeaguesCache.set(past);
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
            // "Active" here means the round the creator/player should see
            // on the home card: scheduled (public R1 awaiting auto-start),
            // ready (awaiting manual start), submission (timer running),
            // or voting. Completed/locked are not surfaced.
            roundsData[l.id] =
              rounds.find(
                (r: Round) =>
                  r.status === 'ready' ||
                  r.status === 'scheduled' ||
                  r.status === 'submission' ||
                  r.status === 'voting',
              ) || null;
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

  const renderLeagueItem = ({ item }: { item: League }) => {
    const activeRound = activeRounds[item.id];
    const displayImage = item.league_image || cachedImages[item.id];
    const standings = leagueStandings[item.id];
    // Tie detection compares against ACTIVE members only — users who
    // hit "Leave" mid-league shouldn't drag the viewer's rank up or
    // create phantom ties, since they're frozen at points_at_leave.
    const activeOnly = (standings?.standings ?? []).filter((s) => !s.left);
    const mine = activeOnly.find((s) => s.user_id === user?.id) ?? null;
    const leader = activeOnly[0];
    const myPoints = mine?.total_points ?? 0;
    const leaderPoints = leader?.total_points ?? 0;
    // Tie-aware rank: position equals the count of active players with
    // strictly more points, plus one. Mirrors the computation used in
    // the standings tab, the league snapshot builder, and the standings
    // endpoint, so rank 1 means "no one above you".
    const rank = mine
      ? activeOnly.filter((s) => s.total_points > myPoints).length + 1
      : null;
    // Tied iff at least one OTHER active member has the exact same
    // total — the same vs total_points check the standings list uses
    // when grouping rows by rank.
    const tiedAtRank =
      mine != null &&
      activeOnly.some(
        (s) => s.user_id !== user?.id && s.total_points === myPoints,
      );
    const isLeading = rank === 1 && myPoints > 0 && !tiedAtRank;
    const progressPct = leaderPoints > 0 ? Math.min(1, myPoints / leaderPoints) : 0;

    // Status pill: state-aware, with a live countdown when the user still
    // needs to act. Colors are purple (action needed) or muted gray (no
    // action). Never yellow/orange, per spec.
    const PURPLE = '#7C3AED';
    const MUTED = '#6A6A6A';
    let pillText: string | null = null;
    let pillColor = MUTED;
    let pillDeadline: string | null = null;
    let pillPrefix: string | undefined;
    const isCreator = item.creator_id === user?.id;
    if (activeRound) {
      if (activeRound.status === 'scheduled') {
        // Public-league R1 waiting for its auto-start timer. Purple
        // countdown prefixed with "STARTS IN" so users can tell it apart
        // from a live submission phase at a glance.
        if (activeRound.starts_at) {
          pillDeadline = activeRound.starts_at;
          pillColor = PURPLE;
          pillPrefix = 'STARTS IN';
        } else {
          pillText = 'STARTING SOON';
          pillColor = PURPLE;
        }
      } else if (activeRound.status === 'ready') {
        // No timer yet — round hasn't been started. Creator sees
        // "READY TO START"; members see "WAITING TO START". Both muted.
        pillText = isCreator ? 'READY TO START' : 'WAITING TO START';
        pillColor = MUTED;
      } else if (activeRound.status === 'submission') {
        if (activeRound.has_user_submitted) {
          pillText = 'SUBMITTED';
          pillColor = MUTED;
        } else if (activeRound.submission_deadline) {
          pillDeadline = activeRound.submission_deadline;
          pillColor = PURPLE;
        }
      } else if (activeRound.status === 'voting') {
        if (activeRound.has_user_voted) {
          pillText = 'VOTED';
          pillColor = MUTED;
        } else if (activeRound.voting_deadline) {
          pillDeadline = activeRound.voting_deadline;
          pillColor = PURPLE;
        }
      }
    } else {
      // No active round surfaced. Only show COMPLETED when the league's
      // server-side status actually says so — `current_round >=
      // total_rounds` alone can fire while the final round is still in
      // progress (see active-filter comment above).
      const leagueFinished = item.status === 'completed';
      if (leagueFinished) {
        pillText = 'COMPLETED';
      } else if ((item.current_round || 0) > 0) {
        pillText = 'ROUND COMPLETE';
      }
      pillColor = MUTED;
    }

    // Public leagues bump current_round to 1 at creation (so R1 is
    // pre-generated and scheduled), but the league hasn't actually
    // started until the auto-start timer fires. Treat a scheduled R1 as
    // not-yet-started for UI purposes.
    const isScheduledR1 = activeRound?.status === 'scheduled';
    const hasStarted = item.current_round > 0 && !isScheduledR1;
    const hasAnyPoints = activeOnly.some((p) => (p.total_points || 0) > 0);

    return (
      <TouchableOpacity
        style={styles.leagueCardV2}
        onPress={() => router.push(`/league/${item.id}`)}
        onLongPress={() => displayImage && setZoomLeagueImage(displayImage)}
        delayLongPress={300}
        activeOpacity={0.75}
      >
        <View style={styles.leagueCardTopRow}>
          <LeagueAvatar
            image={displayImage}
            name={item.name}
            size={44}
            imageBorderRadius={8}
          />
          <View style={styles.leagueCardInfo}>
            <Text style={styles.leagueCardName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.leagueCardSubtext} numberOfLines={1}>
              {activeRound && activeRound.status === 'scheduled'
                ? `${pluralize(item.members.length, 'player')} · ${item.total_rounds} ${item.total_rounds === 1 ? 'round' : 'rounds'}`
                : hasStarted
                  ? `R${item.current_round}/${item.total_rounds} · ${pluralize(item.members.length, 'player')}`
                  : `${pluralize(item.members.length, 'player')} · Code ${item.league_code}`}
            </Text>
          </View>
          {pillDeadline ? (
            <CountdownPill deadline={pillDeadline} color={pillColor} prefix={pillPrefix} />
          ) : pillText ? (
            <View style={[styles.statusPill, { borderColor: pillColor, backgroundColor: `${pillColor}22` }]}>
              <Text style={[styles.statusPillText, { color: pillColor }]}>{pillText}</Text>
            </View>
          ) : null}
        </View>

        {hasStarted && hasAnyPoints && rank !== null ? (
          <View style={styles.leagueCardProgressRow}>
            <Text style={styles.leagueCardRank}>#{rank}</Text>
            <View style={styles.leagueCardMiddle}>
              <Text style={[styles.leagueCardGap, isLeading && { color: '#10B981' }]}>
                {tiedAtRank
                  ? `Tied for ${getOrdinalSuffix(rank)}`
                  : isLeading
                    ? 'Leading'
                    : (() => {
                        // Solo non-1st: render the gap to the highest-
                        // scoring ACTIVE member. Left users are already
                        // filtered out of `activeOnly`, so `leaderPoints`
                        // is the right comparison anchor.
                        const behind = Math.max(0, leaderPoints - myPoints);
                        return `${behind} ${behind === 1 ? 'pt' : 'pts'} behind`;
                      })()}
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

  const activeCount = leagues.length;

  const listHeader = (
    <View>
      {/* Greeting row with ? + avatar (avatar taps into Settings). */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.wordmark}>music comp</Text>
        </View>

        <TouchableOpacity
          style={styles.headerIconBtn}
          onPress={() => setCreateSheetOpen(true)}
        >
          <Ionicons name="add-circle-outline" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerIconBtn}
          onPress={() => router.push('/how-to-play' as any)}
        >
          <Ionicons name="help-circle-outline" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Search-bar tap target — opens /home-search. Not a live input. */}
      <TouchableOpacity
        style={styles.homeSearchBar}
        activeOpacity={0.75}
        onPress={() => router.push('/home-search' as any)}
      >
        <Ionicons
          name="search"
          size={18}
          color="#6A6A6A"
          style={styles.homeSearchIcon}
        />
        <Text style={styles.homeSearchText}>Search leagues and members</Text>
      </TouchableOpacity>

      <View style={{ marginTop: 4, marginBottom: 8 }}>
        <StoriesRing currentUser={user} />
      </View>

      {/* Active leagues — page section title, matches INBOX */}
      {activeCount > 0 && (
        <View style={styles.activeLeaguesHeader}>
          <Text style={styles.activeLeaguesTitle}>ACTIVE LEAGUES</Text>
          <Text style={styles.activeLeaguesCount}>{activeCount} ACTIVE</Text>
        </View>
      )}
    </View>
  );

  const showPublicRow = publicCount > 0;
  const showPastRow = pastLeagues.length > 0;
  const listFooter =
    showPublicRow || showPastRow ? (
      <View style={{ marginTop: leagues.length > 0 ? 20 : 6 }}>
        {showPublicRow && (
          <TouchableOpacity
            style={styles.pastEntry}
            onPress={() => router.push('/public-leagues' as any)}
            activeOpacity={0.75}
          >
            <Text style={styles.activeLeaguesTitle}>PUBLIC LEAGUES</Text>
            <View style={styles.pastEntryRight}>
              <Text style={styles.pastEntryCount}>{publicCount}</Text>
              <Ionicons name="chevron-forward" size={22} color="#B3B3B3" />
            </View>
          </TouchableOpacity>
        )}
        {showPastRow && (
          <TouchableOpacity
            style={styles.pastEntry}
            onPress={() => router.push('/past-leagues' as any)}
            activeOpacity={0.75}
          >
            <Text style={styles.activeLeaguesTitle}>PAST LEAGUES</Text>
            <View style={styles.pastEntryRight}>
              <Text style={styles.pastEntryCount}>{pastLeagues.length}</Text>
              <Ionicons name="chevron-forward" size={22} color="#B3B3B3" />
            </View>
          </TouchableOpacity>
        )}
      </View>
    ) : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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
              <Text style={styles.emptyTitle}>No active leagues</Text>
              <Text style={styles.emptyText}>
                Tap + to create a league or join one.
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

      <CreateJoinSheet
        visible={createSheetOpen}
        onClose={() => setCreateSheetOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },

  headerRow: {
    // Horizontal padding comes from the list container (styles.listContent)
    // so the greeting and icons align with "ACTIVE LEAGUES" and the league
    // card edges. Do not add paddingHorizontal here — it double-pads.
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 18,
    gap: 6,
  },
  greeting: { fontSize: 14, color: '#B3B3B3', fontWeight: '400' },
  username: { fontSize: 26, fontWeight: '700', color: '#FFFFFF', marginTop: 2 },
  wordmark: {
    fontSize: 26,
    fontWeight: '800',
    color: '#7C3AED',
  },
  homeSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181818',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 0,
    marginBottom: 12,
  },
  homeSearchIcon: { marginRight: 8 },
  homeSearchText: {
    color: '#6A6A6A',
    fontSize: 14,
  },
  headerIconBtn: {
    width: 44,
    height: 44,
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

  // ACTIVE LEAGUES is styled as a page-level section title (matches the
  // INBOX page title on the Inbox tab). Other section labels on this
  // screen (e.g. PAST LEAGUES) continue to use the small sectionHeader
  // treatment above.
  activeLeaguesHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 14,
    marginTop: 4,
  },
  activeLeaguesTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  activeLeaguesCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B3B3B3',
    marginBottom: 4,
    letterSpacing: 0.5,
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
    fontSize: 11, fontWeight: '700', color: '#B3B3B3',
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
  memberAvatarInlineText: { fontSize: 11, fontWeight: '600', color: '#FFFFFF' },
  memberAvatarInlineMore: { backgroundColor: '#3A3A3A' },
  memberAvatarInlineMoreText: { fontSize: 11, fontWeight: '600', color: '#B3B3B3' },

  // Past leagues entry row (taps through to /past-leagues)
  pastEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  pastEntryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pastEntryCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B3B3B3',
    letterSpacing: 0.5,
  },

  emptyState: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: '#FFFFFF' },
  emptyText: { fontSize: 14, color: '#B3B3B3', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  zoomOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center', alignItems: 'center',
  },
  zoomContainer: { width: '80%', aspectRatio: 1, borderRadius: 20, overflow: 'hidden' },
  zoomImage: { width: '100%', height: '100%' },
});
