import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Share,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  Dimensions,
  Image,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { SharedChat } from '../../src/components/SharedChat';
import ShareResultsModal, {
  ShareResultsData,
} from '../../src/components/ShareResultsModal';
import { leagueEvents } from '../../src/utils/leagueEvents';
import {
  getLeague,
  getRounds,
  createRound,
  advanceRound,
  startRound,
  deleteLeague,
  leaveLeague,
  getLeagueStandings,
  getChatStatus,
  getResults,
  joinPublicLeague,
  getMySubmissions,
  likeSong,
  unlikeSong,
  getLikedSongs,
  League,
  Round,
  LeagueStandings,
  MySubmission,
} from '../../src/services/api';
import { PreviewPlayButton } from '../../src/components/PreviewPlayButton';
import { format } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';

const AVATAR_COLORS = ['#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899', '#14B8A6', '#F97316'];
const avatarColor = (seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

export default function LeagueDetailScreen() {
  const { id, openChat: openChatParam } = useLocalSearchParams<{ id: string; openChat?: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [league, setLeague] = useState<League | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [standings, setStandings] = useState<LeagueStandings | null>(null);
  const [lastRoundPoints, setLastRoundPoints] = useState<{ [userId: string]: number }>({});
  const [mySubmissions, setMySubmissions] = useState<MySubmission[] | null>(null);
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creatingRound, setCreatingRound] = useState(false);
  const [advancing, setAdvancing] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'rounds' | 'standings' | 'submissions'>('rounds');
  
  // Start round modal state
  const [showStartRoundModal, setShowStartRoundModal] = useState(false);
  const [roundTheme, setRoundTheme] = useState('');
  const [submissionHours, setSubmissionHours] = useState('24');
  const [votingHours, setVotingHours] = useState('24');
  const [showSubmissionPicker, setShowSubmissionPicker] = useState(false);
  const [showVotingPicker, setShowVotingPicker] = useState(false);
  const [selectedTimezone, setSelectedTimezone] = useState<'EST' | 'PST'>(() => {
    // Auto-detect timezone based on device timezone
    try {
      const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // Map IANA timezone to EST or PST
      const pacificTimezones = ['America/Los_Angeles', 'America/Vancouver', 'America/Tijuana', 'America/Phoenix', 'America/Denver'];
      if (pacificTimezones.some(tz => deviceTimezone.includes(tz) || deviceTimezone.includes('Pacific'))) {
        return 'PST';
      }
      // Default to EST for other US timezones and default
      return 'EST';
    } catch {
      return 'EST';
    }
  });

  // Chat state
  const [showChatModal, setShowChatModal] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  // Members modal state
  const [showMembersModal, setShowMembersModal] = useState(false);

  const [overflowOpen, setOverflowOpen] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  // Share modal state — opens the redesigned share UI with view
  // toggles (Story / Square / Top 3) and the SHARE TO grid.
  const [showShareModal, setShowShareModal] = useState(false);
  const dataLoaded   = useRef(false);

  // Time options for the (currently dead-UI) Start Round modal. MUST
  // mirror the backend's ALLOWED_PHASE_HOURS = (12, 24, 48, 72, 168) —
  // anything outside that set is rejected by `_validate_phase_hours`.
  // The previous list (1, 3, 6, 24, 48, 72, 96, 120, 144, 168) included
  // values that are no longer valid; even though `handleStartRound`
  // currently ignores this state, leaving the stale list here is a
  // foot-gun for anyone who re-wires the modal.
  const timeOptions = [
    { label: '12 hrs', value: '12' },
    { label: '1 day', value: '24' },
    { label: '2 days', value: '48' },
    { label: '3 days', value: '72' },
    { label: '7 days', value: '168' },
  ];

  // Get display label for selected hours
  const getTimeLabel = (hours: string) => {
    const option = timeOptions.find(o => o.value === hours);
    return option ? option.label : '1 day';
  };

  // Calculate remaining time from UTC deadline
  const getTimeRemaining = (deadlineStr: string | null): string => {
    if (!deadlineStr) return '';
    
    // Parse UTC date
    let deadline: Date;
    if (deadlineStr.endsWith('Z') || deadlineStr.includes('+')) {
      deadline = new Date(deadlineStr);
    } else {
      deadline = new Date(deadlineStr + 'Z');
    }
    
    const now = new Date();
    const diff = deadline.getTime() - now.getTime();
    
    if (diff <= 0) return 'Expired';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h ${minutes}m left`;
    return `${minutes}m left`;
  };

  // Check if league is complete
  const isLeagueComplete = league && standings && 
    league.total_rounds > 0 && 
    standings.rounds_completed >= league.total_rounds;

  const fetchData = async () => {
    try {
      const [leagueRes, roundsRes, standingsRes] = await Promise.all([
        getLeague(id!),
        getRounds(id!),
        getLeagueStandings(id!),
      ]);
      setLeague(leagueRes.data);
      setRounds(roundsRes.data);
      setStandings(standingsRes.data);
      dataLoaded.current = true;

      // Compute per-user point gain from the most recent completed round for rank-delta arrows.
      try {
        const completed = roundsRes.data.filter(r => r.status === 'completed');
        if (completed.length > 0) {
          const latest = completed.reduce((a, b) => (a.round_number > b.round_number ? a : b));
          const resultsRes = await getResults(latest.id);
          const pts: { [uid: string]: number } = {};
          for (const r of resultsRes.data.rankings) {
            pts[r.user_id] = (pts[r.user_id] || 0) + r.points;
          }
          setLastRoundPoints(pts);
        } else {
          setLastRoundPoints({});
        }
      } catch {
        setLastRoundPoints({});
      }
      
      // Check for unread messages
      try {
        const chatStatusRes = await getChatStatus(id!);
        setHasUnread(chatStatusRes.data.has_unread);
      } catch (e) {
        // Ignore chat status errors
      }

      // Fetch user's submissions for this league
      try {
        const subsRes = await getMySubmissions();
        setMySubmissions(subsRes.data.submissions.filter((s) => s.league_id === id));
      } catch {
        // Non-fatal — submissions tab will show empty
      }

      // Fetch liked songs for heart state
      try {
        const likesRes = await getLikedSongs(200);
        setLikedIds(new Set(likesRes.data.data.songs.map((s) => s.deezer_id)));
      } catch {
        // Non-fatal
      }
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 403 || status === 404) {
        // User no longer has access (league deleted, removed from private league, etc).
        // Navigate away silently instead of showing an alert.
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/(tabs)');
        }
        return;
      }
      console.error('Failed to fetch league:', error);
      Alert.alert('Error', 'Failed to load league details');
    } finally {
      setLoading(false);
    }
  };


  // Check for unread messages (silent background check)
  const checkUnreadMessages = async () => {
    if (!id || showChatModal) return;
    try {
      const chatStatusRes = await getChatStatus(id);
      setHasUnread(chatStatusRes.data.has_unread);
    } catch {
      // Ignore errors
    }
  };

  // Auto-refresh unread indicator while on league page
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    
    if (id && !showChatModal) {
      // Check for unread messages every 5 seconds
      intervalId = setInterval(checkUnreadMessages, 5000);
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [id, showChatModal]);

  // Auto-open chat if navigated with openChat param
  useEffect(() => {
    if (openChatParam === 'true' && !loading) {
      setShowChatModal(true);
    }
  }, [openChatParam, loading]);

  useFocusEffect(
    useCallback(() => {
      setShowChatModal(false);
      fetchData();
    }, [id])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleCopyCode = async () => {
    if (!league) return;
    try {
      await Clipboard.setStringAsync(league.league_code);
      Alert.alert('Copied!', `League code ${league.league_code} copied to clipboard`);
    } catch (error) {
      console.error('Copy failed:', error);
    }
  };

  // Build the share-modal payload from current standings. Only active
  // members can win the league — left users are filtered before ranking.
  const buildShareData = (): ShareResultsData | null => {
    if (!league || !standings) return null;
    const ranked = standings.standings.filter((p) => !p.left);
    if (ranked.length === 0) return null;
    let currentRank = 1;
    let prev: number | null = null;
    const entries = ranked.slice(0, 5).map((p, i) => {
      if (prev !== null && p.total_points < prev) currentRank = i + 1;
      prev = p.total_points;
      return {
        rank: currentRank,
        username: p.username,
        user_id: p.user_id,
        points: p.total_points,
        isViewer: !!user?.id && p.user_id === user.id,
      };
    });
    const viewerEntry = entries.find((e) => e.isViewer);
    return {
      variant: 'standings',
      leagueName: league.name,
      entries,
      shareLink: `https://musiccompapp.com/league/${league.id}`,
      viewerPlace: viewerEntry?.rank ?? null,
    };
  };

  const handleStartRound = async () => {
    if (!league) return;

    // The league's defaults were set at creation. Round creation is a
    // single tap — no confirmation popup, no inputs.
    setCreatingRound(true);
    try {
      const nextRoundNumber = (league.current_round || 0) + 1;
      const savedThemes = Array.isArray(league.themes) ? league.themes : null;
      const savedTheme = savedThemes?.[nextRoundNumber - 1]?.trim() || '';
      const subHours = league.submission_hours ?? 24;
      const voteHours = league.voting_hours ?? 24;

      await createRound(league.id, {
        theme: savedTheme,
        submission_hours: subHours,
        voting_hours: voteHours,
        timezone: selectedTimezone,
      });
      await fetchData();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to start round');
    } finally {
      setCreatingRound(false);
    }
  };

  const handleAdvanceRound = async (roundId: string, status: string) => {
    const nextPhase = status === 'submission' ? 'voting' : 'completed';
    Alert.alert(
      'Advance Round',
      `Move to ${nextPhase} phase?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Advance',
          onPress: async () => {
            setAdvancing(roundId);
            try {
              await advanceRound(roundId);
              await fetchData();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to advance round');
            } finally {
              setAdvancing(null);
            }
          },
        },
      ]
    );
  };

  const startedRound = rounds.some(
    (r) =>
      r.status === 'submission' ||
      r.status === 'voting' ||
      r.status === 'completed' ||
      r.status === 'skipped',
  );

  const handleDeleteLeague = () => {
    if (!league) return;
    const title = startedRound ? 'End League Early?' : 'Delete League?';
    const body = startedRound
      ? 'This will end the league immediately. Members will see it in Past Leagues marked as "NOT FINISHED". Final results will not be calculated. This cannot be undone.'
      : 'This will permanently delete the league and all its rounds. This cannot be undone.';
    const confirmLabel = startedRound ? 'End League' : 'Delete';
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: confirmLabel,
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteLeague(id!);
            // Fan out to the home / past-leagues / profile subscribers
            // so they refetch before/as the user lands back there. Without
            // this, the active-league count and the past-league row
            // stay stale until the next app focus.
            leagueEvents.emit();
            router.replace('/(tabs)/home' as any);
          } catch (error: any) {
            Alert.alert(
              'Error',
              error.response?.data?.detail || 'Failed to delete league',
            );
          }
        },
      },
    ]);
  };

  const handleLeaveLeague = () => {
    if (!league) return;
    Alert.alert(
      `Leave ${league.name}?`,
      "You can't rejoin this league once you leave. You'll keep any points you've earned, but you can't participate in future rounds. Are you sure?",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave League',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveLeague(id!);
              leagueEvents.emit();
              router.replace('/(tabs)/home' as any);
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to leave league');
            }
          },
        },
      ]
    );
  };

  const handleShareLeagueCode = async () => {
    if (!league) return;
    
    const deepLink = Linking.createURL(`/join/${league.league_code}`);
    const message = `Join my Music Comp "${league.name}"!\n\nCode: ${league.league_code}\n\nOr click this link: ${deepLink}`;
    
    try {
      await Share.share({
        message: message,
        title: `Join ${league.name}`,
      });
    } catch (error) {
      // If share fails, just copy to clipboard
      await Clipboard.setStringAsync(league.league_code);
      Alert.alert('Copied!', 'League code copied to clipboard');
    }
  };

  const isCreator = league?.creator_id === user?.id;
  // Non-member gating: the league screen is reachable through profile
  // surfaces, so anyone could land here. Members see the full screen;
  // non-members see a redacted view (no chat, no leave/trash, no
  // standings on active leagues, no inner round content for
  // not-yet-completed rounds).
  const isMember =
    !!(user?.id && league?.members?.some((m: any) => m.id === user.id));
  const isActive = rounds.some((r) => r.status !== 'completed' && r.status !== 'skipped');
  const activeRound = rounds.find(
    (r) => r.status === 'submission' || r.status === 'voting',
  );

  const [joiningPublic, setJoiningPublic] = useState(false);

  const handleJoinPublicLeague = async () => {
    if (!league || joiningPublic) return;
    setJoiningPublic(true);
    try {
      await joinPublicLeague(league.id);
      // Refetch league data so isMember flips and the full view
      // unlocks without a manual reload.
      await fetchData();
      leagueEvents.emit();
    } catch (e: any) {
      const status = e?.response?.status;
      const detail = e?.response?.data?.detail || '';
      if (status === 403 && /block/i.test(detail)) {
        Alert.alert('Could not join', "You can't join this league because of a block.");
      } else {
        Alert.alert('Could not join', detail || 'Please try again.');
      }
    } finally {
      setJoiningPublic(false);
    }
  };

  const renderRoundItem = ({ item }: { item: Round }) => {
    const isLocked = item.status === 'locked';
    const isReady = item.status === 'ready';
    const isScheduled = item.status === 'scheduled';
    const isSkipped = item.status === 'skipped';
    const isCompleted = item.status === 'completed' || isSkipped;
    const isLive = item.status === 'submission' || item.status === 'voting';

    if (!isMember && !isCompleted) {
      return (
        <View style={styles.roundCard}>
          <View style={styles.roundContent}>
            <View style={styles.roundRow}>
              <View style={[styles.roundNumberBadge, styles.roundPuckDim]}>
                <Text style={[styles.roundNumberBadgeText, { color: 'rgba(255,255,255,0.38)' }]}>{item.round_number}</Text>
              </View>
              <View style={styles.roundInfo}>
                <Text style={[styles.roundThemeSubheader, { color: 'rgba(255,255,255,0.5)' }]} numberOfLines={1}>
                  {`Round ${item.round_number}`}
                </Text>
              </View>
              <View style={styles.roundTrailingCircle}>
                <Ionicons name="lock-closed" size={14} color="#6A6A6A" />
              </View>
            </View>
          </View>
        </View>
      );
    }

    // Badge color: locked or scheduled → gray (not yet open for action);
    // everything else (ready, submission, voting, completed, skipped) →
    // primary purple.
    const badgeColor = isLocked || isScheduled ? '#3A3A3A' : '#7C3AED';
    const nameColor = isLocked || isScheduled ? '#6A6A6A' : '#FFFFFF';
    const displayName = item.theme?.trim() || `Round ${item.round_number}`;
    const creatorUsername = league?.creator_username || 'the creator';

    let statusText = '';
    if (isLocked) {
      statusText = `Opens when R${item.round_number - 1} ends`;
    } else if (isScheduled) {
      // Public-league R1 waiting for its auto-start timer.
      const startsIn = item.starts_at
        ? getTimeRemaining(item.starts_at).replace(/ left$/, '')
        : 'soon';
      statusText = `Starts in ${startsIn}`;
    } else if (isReady) {
      statusText = isCreator
        ? 'Ready to start'
        : `Ready · Waiting for ${creatorUsername} to start the round`;
    } else if (isSkipped) {
      statusText = 'Skipped · No submissions';
    } else if (isCompleted) {
      statusText = `Completed · ${item.submissions_count} songs`;
    } else {
      const deadline =
        item.status === 'submission'
          ? item.submission_deadline
          : item.voting_deadline;
      const timeLeft = deadline ? getTimeRemaining(deadline) : '';
      statusText = timeLeft;
    }

    const onPress = () => {
      if (isLocked) {
        Alert.alert(
          'Round locked',
          `This round is locked. It opens when Round ${item.round_number - 1} ends.`,
        );
        return;
      }
      if (isScheduled) {
        Alert.alert(
          'Round starts automatically',
          'Round 1 starts when the countdown hits zero. Nothing to do until then.',
        );
        return;
      }
      if (isReady) {
        // Ready rounds have nothing to show yet — the round detail page
        // expects real deadlines. Route to start-in-place via the button.
        return;
      }
      router.push(`/round/${item.id}`);
    };

    const onStart = async () => {
      if (!league || starting === item.id) return;
      setStarting(item.id);
      try {
        await startRound(league.id, item.round_number);
        await fetchData();
      } catch (e: any) {
        Alert.alert(
          'Error',
          e?.response?.data?.detail || 'Failed to start round',
        );
      } finally {
        setStarting(null);
      }
    };

    const puckStyle = (isLive || isReady) ? styles.roundPuckAccent : styles.roundPuckDim;
    const puckTextStyle = (isLocked || isScheduled)
      ? { color: 'rgba(255,255,255,0.38)' }
      : (isCompleted ? { color: '#B3B3B3' } : { color: '#FFFFFF' });
    const themeColor = (isLocked || isScheduled) ? 'rgba(255,255,255,0.5)' : '#FFFFFF';

    return (
      <View style={styles.roundCard}>
        <TouchableOpacity
          style={styles.roundContent}
          onPress={onPress}
          activeOpacity={isReady ? 1 : 0.7}
        >
          <View style={styles.roundRow}>
            <View style={[styles.roundNumberBadge, puckStyle]}>
              <Text style={[styles.roundNumberBadgeText, puckTextStyle]}>{item.round_number}</Text>
            </View>
            <View style={styles.roundInfo}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text
                  style={[styles.roundThemeSubheader, { color: themeColor, flexShrink: 1 }]}
                  numberOfLines={1}
                >
                  {displayName}
                </Text>
                {isLive && (
                  <Text style={styles.roundInlineCount}>
                    {item.status === 'submission'
                      ? `${item.submissions_count}/${item.total_members} submitted`
                      : `${item.votes_count}/${item.total_members} voted`}
                  </Text>
                )}
              </View>
              {isLive && (() => {
                const userDone = item.status === 'submission'
                  ? !!item.has_user_submitted
                  : !!item.has_user_voted;
                const chipLabel = item.status === 'submission'
                  ? (userDone ? 'SUBMITTED' : 'SUBMIT')
                  : (userDone ? 'VOTED' : 'VOTE');
                return (
                  <View style={styles.roundLiveChip}>
                    <View style={[styles.roundLiveDot, userDone && { backgroundColor: '#22C55E' }]} />
                    <Text style={styles.roundLiveChipText}>
                      {chipLabel} · {statusText}
                    </Text>
                  </View>
                );
              })()}
              {!isLive && (
                <Text style={styles.roundMetaText} numberOfLines={2}>
                  {(isLocked ? '\u{1F512} ' : '')}{statusText}
                </Text>
              )}
            </View>
            {isLocked || isScheduled ? (
              <View style={styles.roundTrailingCircle}>
                <Ionicons name="lock-closed" size={14} color="#6A6A6A" />
              </View>
            ) : isReady && isCreator ? (
              <TouchableOpacity
                style={styles.startRoundInline}
                onPress={onStart}
                disabled={starting === item.id}
                activeOpacity={0.8}
              >
                {starting === item.id ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.startRoundInlineText}>Start Round</Text>
                )}
              </TouchableOpacity>
            ) : isReady ? null : isCompleted ? (
              <View style={styles.roundTrailingCircle}>
                <Ionicons name="chevron-forward" size={16} color="#B3B3B3" />
              </View>
            ) : (
              <View style={styles.roundTrailingAccent}>
                <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
              </View>
            )}
          </View>
        </TouchableOpacity>

        {isCreator && isLive && (
          <TouchableOpacity
            style={styles.advanceButton}
            onPress={() => handleAdvanceRound(item.id, item.status)}
            activeOpacity={0.7}
            disabled={advancing === item.id}
          >
            {advancing === item.id ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.advanceButtonText}>
                Advance to {item.status === 'submission' ? 'Voting' : 'Results'}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (loading && !dataLoaded.current) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      </SafeAreaView>
    );
  }

  if (!league) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>League not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.topBarBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        {loading && dataLoaded.current && (
          <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" style={{ marginRight: 8 }} />
        )}
        <View style={styles.topBarActions}>
          <TouchableOpacity style={styles.topBarBtn} onPress={() => setShowMembersModal(true)}>
            <Ionicons name="people-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          {isMember && (
            <TouchableOpacity style={styles.topBarBtn} onPress={() => setShowChatModal(true)}>
              <Ionicons name="chatbubble-outline" size={20} color="#FFFFFF" />
              {hasUnread && <View style={styles.topBarBadge} />}
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.topBarBtn} onPress={() => setOverflowOpen(!overflowOpen)}>
            <Ionicons name="ellipsis-horizontal" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Overflow popover */}
      {overflowOpen && (
        <>
          <TouchableWithoutFeedback onPress={() => setOverflowOpen(false)}>
            <View style={styles.overflowBackdrop} />
          </TouchableWithoutFeedback>
          <View style={[styles.overflowPopover, { top: insets.top + 60 }]}>
            {!league.is_public && !startedRound && (
              <TouchableOpacity
                style={styles.overflowCodeRow}
                activeOpacity={0.7}
                onPress={async () => {
                  await Clipboard.setStringAsync(league.league_code);
                  setCodeCopied(true);
                  setTimeout(() => setCodeCopied(false), 1500);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.overflowCodeLabel}>JOIN CODE</Text>
                  <Text style={styles.overflowCodeValue}>{league.league_code}</Text>
                </View>
                {codeCopied ? (
                  <Text style={styles.overflowCopiedText}>Copied!</Text>
                ) : (
                  <TouchableOpacity
                    style={styles.overflowCopyBtn}
                    onPress={async () => {
                      await Clipboard.setStringAsync(league.league_code);
                      setCodeCopied(true);
                      setTimeout(() => setCodeCopied(false), 1500);
                    }}
                  >
                    <Ionicons name="copy-outline" size={16} color="rgba(255,255,255,0.55)" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            )}
            {isMember && (
              <>
                <View style={styles.overflowDivider} />
                {isCreator ? (
                  <TouchableOpacity
                    style={styles.overflowItem}
                    activeOpacity={0.7}
                    onPress={() => { setOverflowOpen(false); handleDeleteLeague(); }}
                  >
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                    <Text style={styles.overflowItemDestructive}>Delete league</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.overflowItem}
                    activeOpacity={0.7}
                    onPress={() => { setOverflowOpen(false); handleLeaveLeague(); }}
                  >
                    <Ionicons name="log-out-outline" size={20} color="#EF4444" />
                    <Text style={styles.overflowItemDestructive}>Leave league</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </>
      )}

      {/* Cover card */}
      <View style={styles.coverCard}>
        {league.league_image ? (
          <Image source={{ uri: league.league_image }} style={styles.coverImage} />
        ) : (
          <View style={styles.coverEmpty}>
            <Text style={styles.coverInitial}>
              {league.name.trim() ? league.name.trim()[0].toUpperCase() : '?'}
            </Text>
          </View>
        )}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.75)']}
          style={styles.coverGradient}
        >
          <View style={styles.coverLivePill}>
            <Text style={styles.coverLivePillText}>
              {(() => {
                const total = league.total_rounds || 0;
                const active = rounds.find(
                  (r) => r.status === 'submission' || r.status === 'voting',
                );
                const completedCount = rounds.filter(
                  (r) => r.status === 'completed' || r.status === 'skipped',
                ).length;
                if (total > 0 && completedCount >= total) return 'Completed';
                if (active) {
                  const phase = active.status === 'voting' ? 'Voting open' : 'Submitting open';
                  return `Round ${active.round_number} of ${total > 0 ? total : '?'} · ${phase}`;
                }
                return 'Not started';
              })()}
            </Text>
          </View>
          <Text style={styles.coverTitle}>{league.name}</Text>
        </LinearGradient>
      </View>

      {/* Join CTA for non-members viewing a public league */}
      {!isMember && league.is_public && (
        <TouchableOpacity
          style={styles.joinPublicCta}
          onPress={handleJoinPublicLeague}
          disabled={joiningPublic}
          activeOpacity={0.85}
        >
          {joiningPublic ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.joinPublicCtaText}>Join League</Text>
          )}
        </TouchableOpacity>
      )}


      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        {(['rounds', 'standings', 'submissions'] as const).map((tab) => {
          const active = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Meta strip */}
      {(() => {
        const playerCount = league.members?.length ?? 0;
        const totalRnds = rounds.length;
        const completedRnds = rounds.filter(r => r.status === 'completed' || r.status === 'skipped').length;
        const liveRound = rounds.find(r => r.status === 'submission' || r.status === 'voting');
        const playedCount = mySubmissions?.length ?? 0;

        let left = '';
        let right = '';
        if (activeTab === 'rounds') {
          left = `${playerCount} ${playerCount === 1 ? 'player' : 'players'} · ${totalRnds} ${totalRnds === 1 ? 'round' : 'rounds'}`;
          right = liveRound
            ? `R${liveRound.round_number} ${liveRound.status === 'voting' ? 'voting' : 'submitting'}`
            : completedRnds === totalRnds && totalRnds > 0 ? 'Completed' : 'Not started';
        } else if (activeTab === 'standings') {
          left = `${playerCount} ${playerCount === 1 ? 'player' : 'players'} · ${completedRnds}/${totalRnds} rounds played`;
          right = completedRnds > 0 ? `After R${completedRnds}` : '';
        } else {
          left = `Your submissions · ${playedCount}/${totalRnds} played`;
        }

        return (
          <View style={styles.metaStrip}>
            <Text style={styles.metaStripText}>{left}</Text>
            {right ? <Text style={styles.metaStripText}>{right}</Text> : null}
          </View>
        );
      })()}

      {/* Rounds Tab */}
      {activeTab === 'rounds' && (
        <FlatList
          data={rounds}
          keyExtractor={(item) => item.id}
          renderItem={renderRoundItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#7C3AED"
            />
          }
        />
      )}

      {/* Standings Tab */}
      {activeTab === 'standings' && (
        <ScrollView
          style={styles.standingsContainer}
          contentContainerStyle={styles.standingsContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#7C3AED"
            />
          }
        >
          {!isMember && isActive ? (
            <View style={styles.nonMemberStandingsLock}>
              <Ionicons name="lock-closed-outline" size={40} color="#B3B3B3" />
              <Text style={styles.nonMemberStandingsLockText}>
                Standings hidden until league completes
              </Text>
            </View>
          ) : standings && standings.standings.length > 0 && standings.standings.some(p => p.total_points > 0) ? (
            (() => {
              // Active members are ranked normally. Users who left the
              // league (left=true) always render below all active rows
              // regardless of point totals — they don't compete for
              // placement, and we don't want them on the podium.
              const activePlayers = standings.standings.filter(p => !p.left);
              const leftPlayers = standings.standings.filter(p => p.left);

              // Tie-aware current ranks across active members only.
              let currentRank = 1;
              let prevPoints: number | null = null;
              const rankedPlayers = activePlayers.map((p, i) => {
                if (prevPoints !== null && p.total_points < prevPoints) currentRank = i + 1;
                prevPoints = p.total_points;
                return { ...p, rank: currentRank };
              });

              // Previous-round ranks (subtract last round points, then re-rank)
              const prevSorted = activePlayers
                .map(p => ({
                  user_id: p.user_id,
                  prevTotal: p.total_points - (lastRoundPoints[p.user_id] || 0),
                }))
                .sort((a, b) => b.prevTotal - a.prevTotal);
              let pRank = 1, pPts: number | null = null;
              const prevRankMap: { [uid: string]: number } = {};
              prevSorted.forEach((p, i) => {
                if (pPts !== null && p.prevTotal < pPts) pRank = i + 1;
                pPts = p.prevTotal;
                prevRankMap[p.user_id] = pRank;
              });
              const hasDeltaData = Object.keys(lastRoundPoints).length > 0;

              const getPhoto = (uid: string) =>
                league?.members?.find(m => m.id === uid)?.profile_photo;

              // Group players by their assigned rank. Players who tie share
              // one podium position and render as overlapping avatars.
              const byRank: { [rank: number]: typeof rankedPlayers } = {};
              for (const p of rankedPlayers) {
                (byRank[p.rank] ||= []).push(p);
              }
              const firstGroup = byRank[1] ?? [];
              // Pick the next two DISTINCT rank numbers for 2nd / 3rd slots.
              const otherRanks = Object.keys(byRank)
                .map(Number)
                .filter(r => r !== 1)
                .sort((a, b) => a - b);
              const secondGroup = otherRanks[0] != null ? byRank[otherRanks[0]] : [];
              const thirdGroup = otherRanks[1] != null ? byRank[otherRanks[1]] : [];

              const PodiumSlot = ({
                group,
                size,
                podiumHeight,
                podiumStyle,
                placeLabel,
              }: {
                group: typeof rankedPlayers;
                size: number;
                podiumHeight: number;
                podiumStyle: any;
                placeLabel: string;
              }) => {
                if (!group.length) return <View style={standingStyles.podiumCol} />;
                const isTie = group.length > 1;
                const sharedPoints = group[0].total_points;
                const anyMe = !!user?.id && group.some(p => p.user_id === user.id);
                const displayName = isTie
                  ? `${group.length} tied`
                  : group[0].username;
                const shown = group.slice(0, 4);
                const overflow = group.length - shown.length;
                return (
                  <View style={standingStyles.podiumCol}>
                    {isTie ? (
                      <View style={[
                        standingStyles.podiumAvatarStack,
                        { height: size },
                      ]}>
                        {shown.map((p, i) => {
                          const color = avatarColor(p.username);
                          const photo = getPhoto(p.user_id);
                          const aSize = Math.round(size * 0.78);
                          const isMe = !!user?.id && p.user_id === user.id;
                          return (
                            <View
                              key={p.user_id}
                              style={[
                                standingStyles.podiumAvatar,
                                {
                                  width: aSize,
                                  height: aSize,
                                  borderRadius: aSize / 2,
                                  backgroundColor: color,
                                  marginLeft: i === 0 ? 0 : -Math.round(aSize * 0.35),
                                  zIndex: shown.length - i,
                                  borderWidth: 2,
                                  borderColor: '#181818',
                                },
                                isMe && standingStyles.podiumAvatarMe,
                              ]}
                            >
                              {photo
                                ? <Image source={{ uri: photo }} style={{ width: aSize, height: aSize, borderRadius: aSize / 2 }} />
                                : <Text style={[standingStyles.podiumAvatarInitial, { fontSize: aSize * 0.4 }]}>
                                    {p.username.charAt(0).toUpperCase()}
                                  </Text>}
                            </View>
                          );
                        })}
                        {overflow > 0 && (
                          <View
                            style={[
                              standingStyles.podiumAvatar,
                              {
                                width: Math.round(size * 0.78),
                                height: Math.round(size * 0.78),
                                borderRadius: Math.round(size * 0.78) / 2,
                                backgroundColor: '#3A3A3A',
                                marginLeft: -Math.round(size * 0.78 * 0.35),
                                zIndex: 0,
                                borderWidth: 2,
                                borderColor: '#181818',
                              },
                            ]}
                          >
                            <Text style={[standingStyles.podiumAvatarInitial, { fontSize: size * 0.28 }]}>
                              +{overflow}
                            </Text>
                          </View>
                        )}
                      </View>
                    ) : (
                      <View
                        style={[
                          standingStyles.podiumAvatar,
                          {
                            width: size,
                            height: size,
                            borderRadius: size / 2,
                            backgroundColor: avatarColor(group[0].username),
                          },
                          anyMe && standingStyles.podiumAvatarMe,
                        ]}
                      >
                        {getPhoto(group[0].user_id)
                          ? <Image source={{ uri: getPhoto(group[0].user_id)! }} style={{ width: size, height: size, borderRadius: size / 2 }} />
                          : <Text style={[standingStyles.podiumAvatarInitial, { fontSize: size * 0.4 }]}>
                              {group[0].username.charAt(0).toUpperCase()}
                            </Text>}
                      </View>
                    )}
                    <Text style={standingStyles.podiumName} numberOfLines={1}>{displayName}</Text>
                    <Text style={standingStyles.podiumPoints}>{sharedPoints}</Text>
                    <View style={[standingStyles.podiumBox, { height: podiumHeight }, podiumStyle]}>
                      <Text style={standingStyles.podiumPlace}>{placeLabel}</Text>
                    </View>
                  </View>
                );
              };

              return (
                <>
                  {/* Podium */}
                  <View style={standingStyles.podiumCard}>
                    <View style={standingStyles.podiumRow}>
                      <PodiumSlot
                        group={secondGroup}
                        size={56}
                        podiumHeight={64}
                        podiumStyle={standingStyles.podiumBoxSecond}
                        placeLabel="2nd"
                      />
                      <PodiumSlot
                        group={firstGroup}
                        size={76}
                        podiumHeight={88}
                        podiumStyle={standingStyles.podiumBoxFirst}
                        placeLabel="1st"
                      />
                      <PodiumSlot
                        group={thirdGroup}
                        size={56}
                        podiumHeight={48}
                        podiumStyle={standingStyles.podiumBoxThird}
                        placeLabel="3rd"
                      />
                    </View>
                  </View>

                  {/* Column headers */}
                  <View style={standingStyles.columnHeaders}>
                    <Text style={standingStyles.columnHeaderText}>RANK / PLAYER</Text>
                    <Text style={standingStyles.columnHeaderText}>PTS</Text>
                  </View>

                  {/* Rankings list */}
                  {rankedPlayers.map((player) => {
                    const isMe = !!user?.id && player.user_id === user.id;
                    const prevRank = prevRankMap[player.user_id];
                    const delta = prevRank ? prevRank - player.rank : 0;
                    const photo = getPhoto(player.user_id);
                    const color = avatarColor(player.username);

                    return (
                      <View
                        key={player.user_id}
                        style={[standingStyles.listRow, isMe && standingStyles.listRowMe]}
                      >
                        <Text style={standingStyles.listRank}>{player.rank}</Text>
                        <View style={[standingStyles.listAvatar, { backgroundColor: color }]}>
                          {photo
                            ? <Image source={{ uri: photo }} style={standingStyles.listAvatarImg} />
                            : <Text style={standingStyles.listAvatarInitial}>{player.username.charAt(0).toUpperCase()}</Text>
                          }
                        </View>
                        <View style={standingStyles.listNameWrap}>
                          <Text style={standingStyles.listName} numberOfLines={1}>
                            {player.username}
                          </Text>
                          {isMe && (
                            <View style={standingStyles.youBadge}>
                              <Text style={standingStyles.youBadgeText}>YOU</Text>
                            </View>
                          )}
                        </View>
                        <View style={standingStyles.listPtsWrap}>
                          {hasDeltaData && delta !== 0 && (
                            <View style={standingStyles.deltaWrap}>
                              <Ionicons
                                name={delta > 0 ? 'arrow-up' : 'arrow-down'}
                                size={11}
                                color={delta > 0 ? '#10B981' : '#EF4444'}
                              />
                              <Text
                                style={[
                                  standingStyles.deltaText,
                                  { color: delta > 0 ? '#10B981' : '#EF4444' },
                                ]}
                              >
                                {Math.abs(delta)}
                              </Text>
                            </View>
                          )}
                          <Text style={standingStyles.listPts}>{player.total_points}</Text>
                        </View>
                      </View>
                    );
                  })}
                  {leftPlayers.length > 0 && leftPlayers.map((player) => {
                    const isMe = !!user?.id && player.user_id === user.id;
                    const color = avatarColor(player.username);
                    return (
                      <View
                        key={`left-${player.user_id}`}
                        style={[
                          standingStyles.listRow,
                          standingStyles.listRowLeft,
                          isMe && standingStyles.listRowMe,
                        ]}
                      >
                        <Text
                          style={[standingStyles.listRank, standingStyles.listRankMuted]}
                        >
                          —
                        </Text>
                        <View
                          style={[
                            standingStyles.listAvatar,
                            { backgroundColor: color, opacity: 0.55 },
                          ]}
                        >
                          <Text style={standingStyles.listAvatarInitial}>
                            {player.username.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={standingStyles.listNameWrap}>
                          <Text
                            style={[standingStyles.listName, standingStyles.listNameLeft]}
                            numberOfLines={1}
                          >
                            {player.username}
                          </Text>
                          <View style={standingStyles.leftBadge}>
                            <Text style={standingStyles.leftBadgeText}>LEFT</Text>
                          </View>
                        </View>
                        <View style={standingStyles.listPtsWrap}>
                          <Text
                            style={[standingStyles.listPts, standingStyles.listPtsLeft]}
                          >
                            {player.total_points}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </>
              );
            })()
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="podium" size={60} color="#333" />
              <Text style={styles.emptyTitle}>No Standings Yet</Text>
              <Text style={styles.emptyText}>Standings will be updated once rounds are completed</Text>
            </View>
          )}

          {/* Share Results Button — opens the redesigned share modal */}
          {standings && standings.standings.length > 0 && standings.standings.some(p => p.total_points > 0) && (
            <TouchableOpacity
              style={styles.shareResultsButton}
              onPress={() => setShowShareModal(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.shareResultsText}>Share Results</Text>
            </TouchableOpacity>
          )}

          {showShareModal && buildShareData() && (
            <ShareResultsModal
              visible={showShareModal}
              onClose={() => setShowShareModal(false)}
              data={buildShareData()!}
            />
          )}
        </ScrollView>
      )}

      {activeTab === 'submissions' && (() => {
        if (rounds.length === 0) {
          return (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Text style={{ color: '#B3B3B3', fontSize: 14 }}>No rounds yet</Text>
            </View>
          );
        }
        const sortedRounds = [...rounds].sort((a, b) => a.round_number - b.round_number);
        return (
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
          >
            {sortedRounds.map((round) => {
              const sub = mySubmissions?.find((s) => s.round_id === round.id);
              const isRoundLive = round.status === 'submission' || round.status === 'voting';
              const isRoundDone = round.status === 'completed' || round.status === 'skipped';

              let cardState: string;
              let stateLabel: string;
              if (round.status === 'locked') {
                cardState = 'locked';
                stateLabel = 'LOCKED';
              } else if (round.status === 'ready' || round.status === 'scheduled') {
                cardState = 'not_started';
                stateLabel = 'NOT STARTED';
              } else if (isRoundLive && sub) {
                cardState = 'active_played';
                stateLabel = round.status === 'voting' ? 'VOTING OPEN' : 'SUBMISSIONS OPEN';
              } else if (isRoundLive && !sub) {
                cardState = 'active_unplayed';
                stateLabel = round.status === 'voting' ? 'VOTING OPEN' : 'SUBMISSIONS OPEN';
              } else if (isRoundDone && sub) {
                cardState = 'finished_played';
                stateLabel = 'FINISHED';
              } else {
                cardState = 'forfeited';
                stateLabel = 'FORFEITED';
              }

              const isPreStart = cardState === 'locked' || cardState === 'not_started';
              const tappable = !isPreStart;

              const puckBg = (cardState === 'active_played' || cardState === 'active_unplayed')
                ? '#7C3AED' : '#2A2A2A';
              const puckTextColor = (cardState === 'active_played' || cardState === 'active_unplayed')
                ? '#FFFFFF'
                : isPreStart ? 'rgba(255,255,255,0.38)' : '#B3B3B3';
              const labelColor = cardState === 'forfeited' ? '#EF4444'
                : isRoundLive ? '#22C55E'
                : isPreStart ? 'rgba(255,255,255,0.38)' : '#B3B3B3';
              const themeTextColor = isPreStart ? 'rgba(255,255,255,0.5)' : '#FFFFFF';

              const formatDur = (sec: number) => {
                const m = Math.floor(sec / 60);
                const s = sec % 60;
                return `${m}:${s < 10 ? '0' : ''}${s}`;
              };

              return (
                <TouchableOpacity
                  key={round.id}
                  style={styles.subCard}
                  activeOpacity={tappable ? 0.7 : 1}
                  onPress={tappable ? () => router.push(`/round/${round.id}`) : undefined}
                  disabled={!tappable}
                >
                  {/* Header zone */}
                  <View style={styles.subHeader}>
                    <View style={[styles.subPuck, { backgroundColor: puckBg }]}>
                      <Text style={[styles.subPuckText, { color: puckTextColor }]}>{round.round_number}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <View style={styles.subLabelRow}>
                        {isRoundLive && <View style={[styles.subLiveDot, cardState === 'active_played' && { backgroundColor: '#22C55E' }]} />}
                        <Text style={[styles.subLabel, { color: labelColor }]}>
                          ROUND {round.round_number} · {stateLabel}
                        </Text>
                      </View>
                      <Text style={[styles.subTheme, { color: themeTextColor }]} numberOfLines={1}>
                        {round.theme?.trim() || `Round ${round.round_number}`}
                      </Text>
                    </View>
                  </View>

                  {/* Divider */}
                  <View style={styles.subDivider} />

                  {/* Song zone: finished_played */}
                  {cardState === 'finished_played' && sub && (
                    <View style={styles.subSongRow}>
                      <Image source={{ uri: sub.song.cover_url }} style={styles.subCover} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.subSongTitle} numberOfLines={1}>{sub.song.title}</Text>
                        <Text style={styles.subSongMeta} numberOfLines={1}>
                          {sub.song.artist} · {formatDur(sub.song.duration)}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.subHeartBtn}
                        activeOpacity={0.7}
                        onPress={async () => {
                          const did = sub.song.deezer_id;
                          const wasLiked = likedIds.has(did);
                          setLikedIds((prev) => { const next = new Set(prev); wasLiked ? next.delete(did) : next.add(did); return next; });
                          try {
                            if (wasLiked) { await unlikeSong(did); }
                            else { await likeSong({ deezer_id: did, title: sub.song.title, artist: sub.song.artist, album: sub.song.album, cover_url: sub.song.cover_url, preview_url: sub.song.preview_url }); }
                          } catch {
                            setLikedIds((prev) => { const rev = new Set(prev); wasLiked ? rev.add(did) : rev.delete(did); return rev; });
                          }
                        }}
                      >
                        <Ionicons name={likedIds.has(sub.song.deezer_id) ? 'heart' : 'heart-outline'} size={18} color={likedIds.has(sub.song.deezer_id) ? '#EF4444' : '#B3B3B3'} />
                      </TouchableOpacity>
                      <View style={styles.subPlayBtn}>
                        <PreviewPlayButton previewUrl={sub.song.preview_url} deezerId={sub.song.deezer_id} songId={`league-sub-${round.id}`} size={14} />
                      </View>
                      <View style={styles.subScoreBadge}>
                        <Text style={styles.subScoreText}>+{sub.points_earned ?? sub.points ?? 0} PTS</Text>
                      </View>
                    </View>
                  )}

                  {/* Song zone: active_played */}
                  {cardState === 'active_played' && sub && (
                    <View style={styles.subSongRow}>
                      <Image source={{ uri: sub.song.cover_url }} style={styles.subCover} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.subSongTitle} numberOfLines={1}>{sub.song.title}</Text>
                        <Text style={styles.subSongMeta} numberOfLines={1}>
                          {sub.song.artist} · {formatDur(sub.song.duration)}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.subHeartBtn}
                        activeOpacity={0.7}
                        onPress={async () => {
                          const did = sub.song.deezer_id;
                          const wasLiked = likedIds.has(did);
                          setLikedIds((prev) => { const next = new Set(prev); wasLiked ? next.delete(did) : next.add(did); return next; });
                          try {
                            if (wasLiked) { await unlikeSong(did); }
                            else { await likeSong({ deezer_id: did, title: sub.song.title, artist: sub.song.artist, album: sub.song.album, cover_url: sub.song.cover_url, preview_url: sub.song.preview_url }); }
                          } catch {
                            setLikedIds((prev) => { const rev = new Set(prev); wasLiked ? rev.add(did) : rev.delete(did); return rev; });
                          }
                        }}
                      >
                        <Ionicons name={likedIds.has(sub.song.deezer_id) ? 'heart' : 'heart-outline'} size={18} color={likedIds.has(sub.song.deezer_id) ? '#EF4444' : '#B3B3B3'} />
                      </TouchableOpacity>
                      <View style={styles.subPlayBtn}>
                        <PreviewPlayButton previewUrl={sub.song.preview_url} deezerId={sub.song.deezer_id} songId={`league-sub-${round.id}`} size={14} />
                      </View>
                    </View>
                  )}

                  {/* CTA zone: active_unplayed */}
                  {cardState === 'active_unplayed' && (
                    <View style={styles.subSubmitCta}>
                      <Text style={styles.subSubmitCtaText}>Submit your song</Text>
                      <View style={styles.subSubmitKnob}>
                        <Ionicons name="chevron-forward" size={16} color="#7C3AED" />
                      </View>
                    </View>
                  )}

                  {/* Lock zone */}
                  {cardState === 'locked' && (
                    <View style={styles.subLockRow}>
                      <View style={styles.subLockCircle}>
                        <Ionicons name="lock-closed" size={14} color="#6A6A6A" />
                      </View>
                      <Text style={styles.subLockText}>Opens when R{round.round_number - 1} ends</Text>
                    </View>
                  )}

                  {/* Not started zone */}
                  {cardState === 'not_started' && (
                    <View style={styles.subLockRow}>
                      <View style={styles.subLockCircle}>
                        <Ionicons name="time-outline" size={14} color="#6A6A6A" />
                      </View>
                      <Text style={styles.subLockText}>This round hasn't started yet.</Text>
                    </View>
                  )}

                  {/* Forfeited zone */}
                  {cardState === 'forfeited' && (
                    <Text style={styles.subForfeitText}>You didn't submit this round.</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        );
      })()}

      {/* Start Round Modal */}
      <Modal
        visible={showStartRoundModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowStartRoundModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); setShowStartRoundModal(false); }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
          <TouchableWithoutFeedback onPress={() => {}}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandleBar} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Start New Round</Text>
              <TouchableOpacity onPress={() => setShowStartRoundModal(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalForm}>
                <Text style={styles.inputLabel}>Theme</Text>
                <TextInput
                  style={styles.modalInput}
                  value={roundTheme}
                  onChangeText={setRoundTheme}
                  autoComplete="off"
                  autoCorrect={false}
                  textContentType="none"
                  importantForAutofill="no"
                  spellCheck={false}
                />

                <Text style={styles.inputLabel}>Submission Time</Text>
                <TouchableOpacity 
                  style={styles.dropdownButton}
                  onPress={() => setShowSubmissionPicker(!showSubmissionPicker)}
                >
                  <Ionicons name="time" size={20} color="#7C3AED" />
                  <Text style={styles.dropdownButtonText}>{getTimeLabel(submissionHours)}</Text>
                  <Ionicons name={showSubmissionPicker ? "chevron-up" : "chevron-down"} size={20} color="#7C3AED" />
                </TouchableOpacity>
                {showSubmissionPicker && (
                  <View style={styles.dropdownList}>
                    <ScrollView style={styles.dropdownScroll} nestedScrollEnabled={true}>
                      {timeOptions.map((option) => (
                        <TouchableOpacity
                          key={`sub-${option.value}`}
                          style={[
                            styles.dropdownItem,
                            submissionHours === option.value && styles.dropdownItemSelected
                          ]}
                          onPress={() => {
                            setSubmissionHours(option.value);
                            setShowSubmissionPicker(false);
                          }}
                        >
                          <Text style={[
                            styles.dropdownItemText,
                            submissionHours === option.value && styles.dropdownItemTextSelected
                          ]}>{option.label}</Text>
                          {submissionHours === option.value && (
                            <Ionicons name="checkmark" size={18} color="#7C3AED" />
                          )}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                <Text style={styles.inputLabel}>Voting Time</Text>
                <TouchableOpacity 
                  style={styles.dropdownButton}
                  onPress={() => setShowVotingPicker(!showVotingPicker)}
                >
                  <Ionicons name="time" size={20} color="#7C3AED" />
                  <Text style={styles.dropdownButtonText}>{getTimeLabel(votingHours)}</Text>
                  <Ionicons name={showVotingPicker ? "chevron-up" : "chevron-down"} size={20} color="#7C3AED" />
                </TouchableOpacity>
                {showVotingPicker && (
                  <View style={styles.dropdownList}>
                    <ScrollView style={styles.dropdownScroll} nestedScrollEnabled={true}>
                      {timeOptions.map((option) => (
                        <TouchableOpacity
                          key={`vote-${option.value}`}
                          style={[
                            styles.dropdownItem,
                            votingHours === option.value && styles.dropdownItemSelected
                          ]}
                          onPress={() => {
                            setVotingHours(option.value);
                            setShowVotingPicker(false);
                          }}
                        >
                          <Text style={[
                            styles.dropdownItemText,
                            votingHours === option.value && styles.dropdownItemTextSelected
                          ]}>{option.label}</Text>
                          {votingHours === option.value && (
                            <Ionicons name="checkmark" size={18} color="#7C3AED" />
                          )}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                <Text style={styles.inputLabel}>Your Timezone (Auto-detected)</Text>

                <View style={styles.timezoneContainer}>
                  <TouchableOpacity
                    style={[
                      styles.timezoneOption,
                      selectedTimezone === 'EST' && styles.timezoneOptionSelected
                    ]}
                    onPress={() => setSelectedTimezone('EST')}
                  >
                    <Text style={[
                      styles.timezoneText,
                      selectedTimezone === 'EST' && styles.timezoneTextSelected
                    ]}>EST / EDT</Text>
                    <Text style={[
                      styles.timezoneSubtext,
                      selectedTimezone === 'EST' && styles.timezoneSubtextSelected
                    ]}>Eastern</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.timezoneOption,
                      selectedTimezone === 'PST' && styles.timezoneOptionSelected
                    ]}
                    onPress={() => setSelectedTimezone('PST')}
                  >
                    <Text style={[
                      styles.timezoneText,
                      selectedTimezone === 'PST' && styles.timezoneTextSelected
                    ]}>PST / PDT</Text>
                    <Text style={[
                      styles.timezoneSubtext,
                      selectedTimezone === 'PST' && styles.timezoneSubtextSelected
                    ]}>Pacific</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.submitButton, creatingRound && styles.buttonDisabled]}
                  onPress={handleStartRound}
                  disabled={creatingRound}
                >
                  {creatingRound ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitButtonText}>Start Round</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
          </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Chat Modal */}
      <Modal
        visible={showChatModal}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowChatModal(false)}
      >
        <SafeAreaView style={styles.chatModalContainer}>
          <SharedChat
            leagueId={id!}
            leagueName={league?.name || 'League Chat'}
            onClose={() => {
              setShowChatModal(false);
                    }}
          />
        </SafeAreaView>
      </Modal>

      {/* Members Modal */}
      <Modal
        visible={showMembersModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowMembersModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowMembersModal(false)}>
          <View style={styles.membersModalOverlay}>
        <TouchableWithoutFeedback onPress={() => {}}>
          <View style={styles.membersModalContent}>
            <View style={styles.membersModalHeader}>
              <Text style={styles.membersModalTitle}>League Members</Text>
              <TouchableOpacity onPress={() => setShowMembersModal(false)}>
                <Ionicons name="close" size={24} color="#B3B3B3" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.membersList}>
              {league.members.map((member, index) => (
                <View key={member.id} style={styles.memberItem}>
                  <View style={styles.memberNumber}>
                    <Text style={styles.memberNumberText}>{index + 1}</Text>
                  </View>
                  <View style={styles.memberAvatar}>
                    {member.profile_photo ? (
                      <Image source={{ uri: member.profile_photo }} style={styles.memberAvatarImg} />
                    ) : (
                      <View style={styles.memberAvatarPlaceholder}>
                        <Text style={styles.memberInitial}>{member.username?.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.memberDetails}>
                    <Text style={styles.memberName}>{member.username}</Text>
                    <Text style={styles.memberUsername}>@{member.username}</Text>
                  </View>
                  {league.creator_id === member.id && (
                    <View style={styles.creatorBadge}>
                      <Text style={styles.creatorBadgeText}>Creator</Text>
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#B3B3B3',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  topBarActions: {
    flexDirection: 'row',
    gap: 6,
  },
  topBarBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  coverCard: {
    marginHorizontal: 16,
    borderRadius: 24,
    overflow: 'hidden',
    aspectRatio: 1.1,
    backgroundColor: '#1a1a1a',
  },
  coverImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  } as any,
  coverEmpty: {
    width: '100%',
    height: '100%',
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverInitial: {
    fontSize: 64,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  coverGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18,
    paddingBottom: 18,
    paddingTop: 60,
  },
  coverLivePill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 8,
  },
  coverLivePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  coverTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  overflowBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 90,
  },
  overflowPopover: {
    position: 'absolute',
    right: 12,
    zIndex: 100,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    minWidth: 220,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
    overflow: 'hidden',
  },
  overflowCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    margin: 8,
    borderRadius: 12,
    padding: 12,
  },
  overflowCodeLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
  },
  overflowCodeValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 2,
    marginTop: 2,
  },
  overflowCopyBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  overflowCopiedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7C3AED',
    marginLeft: 8,
  },
  overflowDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 8,
  },
  overflowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  overflowItemDestructive: {
    fontSize: 14,
    fontWeight: '600',
    color: '#EF4444',
  },
  codeBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#181818',
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 8,
  },
  codeInfo: {
    flex: 1,
  },
  codeLabel: {
    fontSize: 12,
    color: '#B3B3B3',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  codeValue: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 3,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  memberCount: {
    fontSize: 14,
    color: '#B3B3B3',
  },
  memberAvatarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberAvatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#121212',
    overflow: 'hidden',
  },
  memberAvatarImage: {
    width: '100%',
    height: '100%',
  },
  memberAvatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarInitial: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  memberAvatarMore: {
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberMoreText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#B3B3B3',
  },
  startRoundButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7C3AED',
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 50,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  startRoundText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B3B3B3',
    paddingHorizontal: 16,
    marginTop: 24,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  roundCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    marginBottom: 10,
    overflow: 'hidden',
  },
  roundContent: {
    padding: 14,
  },
  roundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  roundNumberBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundPuckAccent: {
    backgroundColor: '#7C3AED',
  },
  roundPuckDim: {
    backgroundColor: '#2A2A2A',
  },
  roundNumberBadgeText: {
    fontWeight: '800',
    fontSize: 16,
  },
  roundInfo: {
    flex: 1,
  },
  roundThemeSubheader: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 3,
  },
  roundMetaText: {
    fontSize: 11.5,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.55)',
  },
  roundLiveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#2A2A2A',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 6,
    marginTop: 2,
  },
  roundLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  roundLiveChipText: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  roundInlineCount: {
    fontSize: 11,
    color: '#6A6A6A',
    fontWeight: '600',
    marginLeft: 8,
    flexShrink: 0,
  },
  roundTrailingCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundTrailingAccent: {
    width: 44,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  advanceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#7C3AED',
    borderTopWidth: 0,
    gap: 6,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  advanceButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  startRoundInline: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 92,
  },
  startRoundInlineText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 14,
    marginBottom: 10,
  },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subPuck: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subPuckText: {
    fontSize: 15,
    fontWeight: '800',
  },
  subLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  subLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  subTheme: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  subDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 12,
  },
  subSongRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subCover: {
    width: 46,
    height: 46,
    borderRadius: 8,
    backgroundColor: '#2A2A2A',
  },
  subSongTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subSongMeta: {
    fontSize: 11.5,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
  },
  subScoreBadge: {
    backgroundColor: '#7C3AED',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
  },
  subScoreText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subHeartBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  subPlayBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  subSubmitCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    height: 44,
    paddingLeft: 16,
    paddingRight: 4,
  },
  subSubmitCtaText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subSubmitKnob: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subLockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  subLockCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subLockText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.55)',
  },
  subForfeitText: {
    fontSize: 12.5,
    fontWeight: '500',
    fontStyle: 'italic',
    color: 'rgba(255,255,255,0.38)',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#B3B3B3',
    textAlign: 'center',
    marginTop: 8,
  },
  // Tab styles
  metaStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  metaStripText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#B3B3B3',
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
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
  // Non-member surfaces
  joinPublicCta: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 4,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
  },
  joinPublicCtaText: {
    color: '#FFFFFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.4,
  },
  nonMemberStandingsLock: {
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: 32,
    gap: 12,
  },
  nonMemberStandingsLockText: {
    fontSize: 14, fontWeight: '700', color: '#B3B3B3', textAlign: 'center',
  },

  // Standings styles
  standingsContainer: {
    flex: 1,
  },
  standingsContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
  },
  standingsHeader: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  standingsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  roundsCompleted: {
    fontSize: 13,
    color: '#B3B3B3',
    marginTop: 4,
  },
  standingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181818',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  firstPlace: {
    backgroundColor: 'rgba(124,58,237,0.10)',
    borderLeftWidth: 3,
    borderLeftColor: '#7C3AED',
  },
  secondPlace: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  thirdPlace: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  rankContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rankNumber: {
    fontSize: 16,
    fontWeight: '500',
    color: '#B3B3B3',
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  playerStats: {
    fontSize: 12,
    color: '#B3B3B3',
    marginTop: 2,
  },
  pointsContainer: {
    alignItems: 'center',
  },
  pointsValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#7C3AED',
  },
  pointsLabel: {
    fontSize: 12,
    color: '#B3B3B3',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.90)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#282828',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 40,
  },
  modalHandleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalForm: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B3B3B3',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  modalInput: {
    backgroundColor: '#3E3E3E',
    borderRadius: 8,
    paddingHorizontal: 16,
    height: 52,
    color: '#FFFFFF',
    fontSize: 15,
    marginBottom: 16,
  },
  timeOptionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#3E3E3E',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
  },
  dropdownButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
    marginLeft: 12,
  },
  dropdownList: {
    backgroundColor: '#3E3E3E',
    borderRadius: 8,
    marginBottom: 16,
    overflow: 'hidden',
  },
  dropdownScroll: {
    maxHeight: 200,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  dropdownItemSelected: {
    backgroundColor: 'rgba(124,58,237,0.10)',
  },
  dropdownItemText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  dropdownItemTextSelected: {
    color: '#7C3AED',
    fontWeight: '600',
  },
  timezoneContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  timezoneOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#3E3E3E',
    alignItems: 'center',
  },
  timezoneOptionSelected: {
    backgroundColor: 'rgba(124,58,237,0.15)',
    borderColor: '#7C3AED',
  },
  timezoneText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#B3B3B3',
  },
  timezoneTextSelected: {
    color: '#7C3AED',
  },
  timezoneSubtext: {
    fontSize: 12,
    color: '#6A6A6A',
    marginTop: 2,
  },
  timezoneSubtextSelected: {
    color: 'rgba(124,58,237,0.70)',
  },
  inputHint: {
    fontSize: 12,
    color: '#6A6A6A',
    marginBottom: 12,
    marginTop: -4,
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  dateTimeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3E3E3E',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  dateTimeText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  pickerContainer: {
    backgroundColor: '#282828',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  pickerDoneButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#7C3AED',
    borderRadius: 8,
    marginTop: 12,
  },
  pickerDoneText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  timeOption: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#3E3E3E',
  },
  timeOptionSelected: {
    backgroundColor: 'rgba(124,58,237,0.15)',
    borderColor: '#7C3AED',
  },
  timeOptionText: {
    fontSize: 14,
    color: '#B3B3B3',
    fontWeight: '500',
  },
  timeOptionTextSelected: {
    color: '#7C3AED',
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 50,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Chat styles
  unreadBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#7C3AED',
  },
  chatModalContainer: {
    flex: 1,
    backgroundColor: '#121212',
    paddingTop: Platform.OS === 'ios' ? 55 : 0,
  },
  chatModalContent: {
    flex: 1,
  },
  chatModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.10)',
    backgroundColor: '#181818',
  },
  chatModalTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  chatLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatEmptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  chatEmptyTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: '#FFFFFF',
    marginTop: 16,
  },
  chatEmptyText: {
    fontSize: 14,
    color: '#B3B3B3',
    marginTop: 8,
  },
  chatListContent: {
    padding: 16,
    flexGrow: 1,
  },
  messageContainer: {
    marginBottom: 12,
    flexDirection: 'row',
  },
  ownMessageContainer: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    maxWidth: '80%',
    borderRadius: 16,
    padding: 12,
  },
  ownMessageBubble: {
    backgroundColor: '#7C3AED',
    borderBottomRightRadius: 4,
  },
  otherMessageBubble: {
    backgroundColor: '#282828',
    borderBottomLeftRadius: 4,
  },
  messageUsername: {
    fontSize: 12,
    fontWeight: '500',
    color: '#B3B3B3',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 20,
  },
  ownMessageText: {
    color: '#FFFFFF',
  },
  messageTime: {
    fontSize: 11,
    color: '#B3B3B3',
    marginTop: 6,
  },
  ownMessageTime: {
    color: '#B3B3B3',
  },
  chatInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    backgroundColor: '#181818',
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.1)',
    gap: 12,
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#3E3E3E',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  // Share Results styles
  shareResultsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#181818',
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 32,
    paddingVertical: 16,
    borderRadius: 8,
    gap: 8,
  },
  shareResultsText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  shareModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  shareModalContent: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#181818',
    borderRadius: 12,
    overflow: 'hidden',
  },
  shareModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  shareModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  shareCardOffscreen: {
    position: 'absolute',
    left: -10000,
    top: 0,
  },
  shareCard: {
    width: 360,
    aspectRatio: 9 / 16,
    overflow: 'hidden',
  },
  shareCardGradient: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
    backgroundColor: '#181818',
  },
  shareCardHeader: {
    alignItems: 'center',
    paddingTop: 20,
  },
  shareCardEmoji: {
    fontSize: 60,
    marginBottom: 16,
  },
  shareCardTitle: {
    fontSize: 28,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 4,
  },
  shareCardSubtitle: {
    fontSize: 16,
    color: '#B3B3B3',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  shareCardStandings: {
    backgroundColor: '#181818',
    borderRadius: 8,
    padding: 16,
    marginVertical: 20,
  },
  shareCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#282828',
    marginBottom: 4,
  },
  shareCardWinnerRow: {
    backgroundColor: 'rgba(124,58,237,0.12)',
    borderRadius: 8,
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderBottomWidth: 0,
    marginBottom: 4,
  },
  shareCardRankEmoji: {
    fontSize: 24,
    width: 40,
  },
  shareCardUsername: {
    flex: 1,
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  shareCardWinnerText: {
    fontWeight: '600',
    color: '#7C3AED',
  },
  shareCardPoints: {
    fontSize: 16,
    color: '#B3B3B3',
    fontWeight: '600',
  },
  shareCardFooter: {
    alignItems: 'center',
    paddingBottom: 20,
  },
  shareCardBranding: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  shareCardCTA: {
    fontSize: 14,
    color: '#B3B3B3',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7C3AED',
    margin: 16,
    paddingVertical: 14,
    borderRadius: 50,
    gap: 8,
  },
  shareButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  membersModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.90)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  membersModalContent: {
    width: '85%',
    maxHeight: '70%',
    backgroundColor: '#282828',
    borderRadius: 16,
    overflow: 'hidden',
  },
  membersModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  membersModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  membersList: {
    padding: 16,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  memberNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(124,58,237,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  memberNumberText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#7C3AED',
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    overflow: 'hidden',
  },
  memberAvatarImg: {
    width: '100%',
    height: '100%',
  },
  memberAvatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInitial: {
    fontSize: 16,
    fontWeight: '500',
    color: '#7C3AED',
  },
  memberDetails: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  memberUsername: {
    fontSize: 12,
    color: '#6A6A6A',
    marginTop: 2,
  },
  creatorBadge: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  creatorBadgeText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#FFFFFF',
  },
});

const standingStyles = StyleSheet.create({
  // ── Podium ──
  podiumCard: {
    backgroundColor: '#181818',
    borderRadius: 12,
    paddingTop: 20,
    paddingHorizontal: 12,
    marginBottom: 20,
    overflow: 'hidden',
  },
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
  },
  podiumCol: {
    flex: 1,
    alignItems: 'center',
  },
  podiumAvatar: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 8,
  },
  podiumAvatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  podiumAvatarMe: {
    borderWidth: 2,
    borderColor: '#7C3AED',
  },
  podiumAvatarInitial: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
  podiumName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 2,
    maxWidth: 100,
  },
  podiumPoints: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
    marginBottom: 10,
  },
  podiumBox: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 10,
  },
  podiumBoxFirst: {
    backgroundColor: '#7C3AED',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  podiumBoxSecond: {
    backgroundColor: '#2A2A2A',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  podiumBoxThird: {
    backgroundColor: '#1F1F1F',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  podiumPlace: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  // ── Column headers ──
  columnHeaders: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  columnHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6A6A6A',
    letterSpacing: 1,
  },

  // ── List row ──
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  listRowMe: {
    backgroundColor: 'rgba(124,58,237,0.12)',
  },
  // Visual treatment for users who left mid-league: muted text/avatar
  // and a "LEFT" pill in place of the rank.
  listRowLeft: {
    opacity: 0.7,
  },
  listRankMuted: {
    color: '#6A6A6A',
  },
  listNameLeft: {
    color: '#B3B3B3',
  },
  listPtsLeft: {
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
  listRank: {
    width: 28,
    fontSize: 15,
    fontWeight: '700',
    color: '#B3B3B3',
  },
  listAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginLeft: 4,
  },
  listAvatarImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  listAvatarInitial: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  listNameWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  listName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  youBadge: {
    marginLeft: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(124,58,237,0.22)',
  },
  youBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#7C3AED',
    letterSpacing: 0.5,
  },
  listPtsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deltaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  deltaText: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 2,
  },
  listPts: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    minWidth: 36,
    textAlign: 'right',
  },
});
