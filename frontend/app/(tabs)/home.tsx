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
  ScrollView,
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
import { FLOATING_NAV_CLEARANCE } from './_layout';

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
//   >24h → "2d 14h 23m"
//   >1h  → "14h 23m"
//   >1m  → "23m"
//   <1m  → "45s" (the only case that shows seconds)
const formatCountdown = (deadline: string, now: number = Date.now()): string => {
  const diffMs = parseDeadline(deadline).getTime() - now;
  if (diffMs <= 0) return '0s';
  const totalSeconds = Math.floor(diffMs / 1000);
  if (totalSeconds < 60) return `${Math.max(1, totalSeconds)}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutesAfterHours = totalMinutes % 60;
  if (hours < 24) return `${hours}h ${minutesAfterHours}m`;
  const days = Math.floor(hours / 24);
  const hoursAfterDays = hours % 24;
  return `${days}d ${hoursAfterDays}h ${minutesAfterHours}m`;
};

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [leagues, setLeagues] = useState<League[]>([]);
  const [activeRounds, setActiveRounds] = useState<{ [id: string]: Round | null }>({});
  const [leagueFilter, setLeagueFilter] = useState<'all' | 'submission' | 'voting'>('all');
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
    }, []),
  );

  useEffect(() => {
    const onLeagueChange = () => {
      fetchAll();
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    };
    const unsub = leagueEvents.subscribe(onLeagueChange);
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
          pillPrefix = 'Starts in';
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
          pillPrefix = 'Submit before';
        }
      } else if (activeRound.status === 'voting') {
        if (activeRound.has_user_voted) {
          pillText = 'VOTED';
          pillColor = MUTED;
        } else if (activeRound.voting_deadline) {
          pillDeadline = activeRound.voting_deadline;
          pillColor = PURPLE;
          pillPrefix = 'Vote before';
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
        activeOpacity={0.85}
      >
        {/* Cover image (or solid-accent fallback) with overlays. */}
        <View style={styles.leagueCover}>
          {displayImage ? (
            <Image
              source={{ uri: displayImage }}
              style={styles.leagueCoverImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.leagueCoverImage, styles.leagueCoverFallback]} />
          )}
          {/* Bottom-left: member avatar stack — relocated onto the cover. */}
          <View style={styles.leagueCoverAvatars}>
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
          </View>
        </View>

        {/* Body: eyebrow + headline. */}
        <View style={styles.leagueCardBody}>
          <Text style={styles.leagueCardEyebrow} numberOfLines={1}>
            {`Round ${item.current_round || 1} of ${item.total_rounds}`}
            {activeRound?.theme ? ` · ${activeRound.theme}` : ''}
          </Text>
          <View style={styles.leagueCardHeadlineRow}>
            <Text style={[styles.leagueCardHeadline, { flex: 1 }]} numberOfLines={2}>
              {item.name}
            </Text>
            {pillDeadline ? (
              <CountdownPill deadline={pillDeadline} color={pillColor} prefix={pillPrefix} />
            ) : pillText ? (
              <View style={[styles.statusPill, { borderColor: pillColor, backgroundColor: `${pillColor}22` }]}>
                <Text style={[styles.statusPillText, { color: pillColor }]}>{pillText}</Text>
              </View>
            ) : null}
          </View>

          {/* Progress row — same internal logic, moved inside the body. */}
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
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  const activeCount = leagues.length;

  // Filter the visible cards by the active chip. activeCount stays the
  // total so the "ACTIVE LEAGUES · N ACTIVE" header keeps reflecting
  // membership rather than the current filter view.
  const filteredLeagues =
    leagueFilter === 'all'
      ? leagues
      : leagues.filter((l) => activeRounds[l.id]?.status === leagueFilter);

  const listHeader = (
    <View>
      {/* Greeting row with ? + avatar (avatar taps into Settings). */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.wordmark}>music <Text style={{ fontStyle: 'italic' }}>comp</Text></Text>
        </View>

        <TouchableOpacity
          style={styles.headerIconBtn}
          onPress={() => router.push('/home-search' as any)}
        >
          <Ionicons name="search" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerIconBtn}
          onPress={() => router.push('/how-to-play' as any)}
        >
          <Ionicons name="help-circle-outline" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Primary / secondary CTA pills — Create League + Join With Code.
          Replaced the header "+" entry to the action sheet. */}
      <View style={styles.ctaRow}>
        <TouchableOpacity
          style={styles.ctaPrimary}
          activeOpacity={0.85}
          onPress={() => router.push('/create-league' as any)}
        >
          <Ionicons name="add" size={16} color="#FFFFFF" />
          <Text style={styles.ctaPrimaryLabel}>Create league</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.ctaSecondary}
          activeOpacity={0.85}
          onPress={() => router.push('/join-league' as any)}
        >
          <Text style={styles.ctaSecondaryLabel}>Join with code</Text>
        </TouchableOpacity>
      </View>

      <View style={{ marginTop: 4, marginBottom: 10 }}>
        <StoriesRing currentUser={user} />
      </View>

      {/* Active leagues — page section title, matches INBOX */}
      {activeCount > 0 && (
        <>
          <View style={styles.activeLeaguesHeader}>
            <Text style={styles.activeLeaguesTitle}>Now Playing</Text>
            <Text style={styles.activeLeaguesCount}>{activeCount} active</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterChipRow}
          >
            {(
              [
                { key: 'all', label: 'All' },
                { key: 'submission', label: 'Submission open' },
                { key: 'voting', label: 'Voting open' },
              ] as const
            ).map((opt) => {
              const active = leagueFilter === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.filterChip,
                    active && styles.filterChipActive,
                  ]}
                  activeOpacity={0.8}
                  onPress={() => setLeagueFilter(opt.key)}
                >
                  <Text
                    style={[
                      styles.filterChipLabel,
                      active && styles.filterChipLabelActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </>
      )}
    </View>
  );

  const showPublicRow = publicCount > 0;
  const listFooter =
    showPublicRow ? (
      <View style={{ marginTop: 24, gap: 10 }}>
        {showPublicRow && (
          <TouchableOpacity
            style={styles.navRowCard}
            onPress={() => router.push('/public-leagues' as any)}
            activeOpacity={0.85}
          >
            <View style={styles.navRowIconTile}>
              <Ionicons name="globe-outline" size={22} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.navRowTitle}>Public leagues</Text>
              <Text style={styles.navRowSub}>Browse open leagues to join</Text>
            </View>
            <View style={styles.navRowChevron}>
              <Ionicons name="chevron-forward" size={18} color="#B3B3B3" />
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
          data={filteredLeagues}
          keyExtractor={(item) => item.id}
          renderItem={renderLeagueItem}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          ListEmptyComponent={
            leagueFilter !== 'all' && leagues.length > 0 ? (
              <View style={styles.filterEmptyState}>
                <Text style={styles.filterEmptyText}>
                  {leagueFilter === 'submission'
                    ? 'No leagues are in submission right now.'
                    : 'No leagues are in voting right now.'}
                </Text>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No active leagues</Text>
              </View>
            )
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
  ctaRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  ctaPrimary: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#7C3AED',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  ctaPrimaryLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  ctaSecondary: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaSecondaryLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  homeSearchBar: {
    height: 52,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 20,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  homeSearchIcon: { marginRight: 10 },
  homeSearchText: {
    color: '#8B8B8B',
    fontSize: 15,
    fontWeight: '500',
  },
  headerIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: { paddingHorizontal: 20, paddingBottom: FLOATING_NAV_CLEARANCE + 20, flexGrow: 1 },
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
    marginBottom: 10,
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

  filterChipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 12,
  },
  filterChip: {
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  filterChipActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  filterChipLabel: {
    color: '#B3B3B3',
    fontSize: 14,
    fontWeight: '600',
  },
  filterChipLabelActive: {
    color: '#FFFFFF',
  },

  filterEmptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  filterEmptyText: {
    color: '#B3B3B3',
    fontSize: 14,
    textAlign: 'center',
  },

  leagueCardV2: {
    backgroundColor: '#181818',
    borderRadius: 28,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  leagueCover: {
    width: '100%',
    aspectRatio: 1.05,
    position: 'relative',
  },
  leagueCoverImage: {
    width: '100%',
    height: '100%',
  },
  leagueCoverFallback: {
    backgroundColor: '#7C3AED',
  },
  leagueCardHeadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  leagueCoverAvatars: {
    position: 'absolute',
    bottom: 12,
    left: 12,
  },
  leagueCardBody: {
    padding: 18,
  },
  leagueCardEyebrow: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B3B3B3',
    marginBottom: 6,
  },
  leagueCardHeadline: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
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

  // Card-style nav rows for Public / Past leagues entry points.
  navRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#181818',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    padding: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  navRowIconTile: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navRowTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  navRowSub: {
    fontSize: 12.5,
    color: '#B3B3B3',
    marginTop: 2,
  },
  navRowChevron: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
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
