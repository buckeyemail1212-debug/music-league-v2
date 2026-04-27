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
import { SafeAreaView } from 'react-native-safe-area-context';
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
  League,
  Round,
  LeagueStandings,
} from '../../src/services/api';
import { format } from 'date-fns';

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
  const [league, setLeague] = useState<League | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [standings, setStandings] = useState<LeagueStandings | null>(null);
  const [lastRoundPoints, setLastRoundPoints] = useState<{ [userId: string]: number }>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creatingRound, setCreatingRound] = useState(false);
  const [advancing, setAdvancing] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'rounds' | 'standings'>('rounds');
  
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
    } catch (error: any) {
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
      shareLink: `https://musicleeg.com/league/${league.id}`,
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

  const handleDeleteLeague = () => {
    if (!league) return;
    // Once any round has reached the submission phase, deleting ends the
    // league early and writes a "NOT FINISHED" past-league snapshot
    // instead of hard-deleting. Match the copy to that behavior.
    const startedRound = rounds.some(
      (r) =>
        r.status === 'submission' ||
        r.status === 'voting' ||
        r.status === 'completed' ||
        r.status === 'skipped',
    );
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
    const message = `Join my Music Leeg "${league.name}"!\n\nCode: ${league.league_code}\n\nOr click this link: ${deepLink}`;
    
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
  const activeRound = rounds.find(
    (r) => r.status === 'submission' || r.status === 'voting',
  );

  const renderRoundItem = ({ item }: { item: Round }) => {
    const isLocked = item.status === 'locked';
    const isReady = item.status === 'ready';
    const isScheduled = item.status === 'scheduled';
    const isSkipped = item.status === 'skipped';
    const isCompleted = item.status === 'completed' || isSkipped;
    const isLive = item.status === 'submission' || item.status === 'voting';

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
      statusText = `${item.submissions_count} songs · ${timeLeft} left`;
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

    return (
      <View style={styles.roundCard}>
        <TouchableOpacity
          style={styles.roundContent}
          onPress={onPress}
          activeOpacity={isReady ? 1 : 0.7}
        >
          <View style={styles.roundRow}>
            <View style={[styles.roundNumberBadge, { backgroundColor: badgeColor }]}>
              <Text style={styles.roundNumberBadgeText}>{item.round_number}</Text>
            </View>
            <View style={styles.roundInfo}>
              <Text
                style={[styles.roundThemeSubheader, { color: nameColor }]}
                numberOfLines={1}
              >
                {displayName}
              </Text>
              <Text style={styles.roundMetaText} numberOfLines={2}>
                {statusText}
              </Text>
            </View>
            {isLocked ? (
              <Ionicons name="lock-closed" size={18} color="#6A6A6A" />
            ) : isScheduled ? (
              <Ionicons name="time-outline" size={18} color="#6A6A6A" />
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
            ) : isReady ? null : (
              <Ionicons name="chevron-forward" size={20} color="#6A6A6A" />
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
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="rgba(255,255,255,0.75)" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.leagueName} numberOfLines={1}>{league.name}</Text>
            {loading && dataLoaded.current && (
              <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
            )}
          </View>
          <View style={styles.headerSubRow}>
            <Text style={styles.headerSubText} numberOfLines={1}>
              {(() => {
                // Derive a single-line round-state summary from the
                // loaded rounds. "Not started" = no active round AND
                // nothing completed yet. "Completed" = every planned
                // round is done. Otherwise show current round + phase.
                const total = league.total_rounds || 0;
                const active = rounds.find(
                  (r) => r.status === 'submission' || r.status === 'voting',
                );
                const completedCount = rounds.filter(
                  (r) => r.status === 'completed' || r.status === 'skipped',
                ).length;
                if (total > 0 && completedCount >= total) return 'Completed';
                if (active) {
                  const base = `Round ${active.round_number} of ${total > 0 ? total : '?'}`;
                  return active.status === 'voting' ? `${base} · voting` : base;
                }
                return 'Not started';
              })()}
            </Text>
            {league.current_round === 0 && (
              <TouchableOpacity onPress={handleCopyCode} style={styles.headerCode}>
                <Text style={styles.headerCodeText}>{league.league_code}</Text>
                <Ionicons name="copy-outline" size={12} color="#B3B3B3" />
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerButton} onPress={() => setShowMembersModal(true)}>
            <Ionicons name="people" size={22} color="rgba(255,255,255,0.60)" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={() => setShowChatModal(true)}>
            <Ionicons name="chatbubble-outline" size={22} color="rgba(255,255,255,0.60)" />
            {hasUnread && <View style={styles.unreadBadge} />}
          </TouchableOpacity>
          {(() => {
            // Creators always get the Delete affordance — admin can
            // delete at any point in the league's lifecycle, with
            // mid-flight deletions becoming "NOT FINISHED" past leagues.
            // Non-creators get the Leave icon, which freezes their
            // points and removes them from active play.
            if (isCreator) {
              return (
                <TouchableOpacity
                  style={styles.headerButton}
                  onPress={handleDeleteLeague}
                >
                  <Ionicons
                    name="trash-outline"
                    size={22}
                    color="rgba(255,255,255,0.60)"
                  />
                </TouchableOpacity>
              );
            }
            return (
              <TouchableOpacity
                style={styles.headerButton}
                onPress={handleLeaveLeague}
                accessibilityLabel="Leave league"
              >
                <Ionicons
                  name="log-out-outline"
                  size={22}
                  color="rgba(255,255,255,0.60)"
                />
              </TouchableOpacity>
            );
          })()}
        </View>
      </View>


      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'rounds' && styles.tabActive]}
          onPress={() => setActiveTab('rounds')}
        >
          <Text style={[styles.tabText, activeTab === 'rounds' && styles.tabTextActive]}>Rounds</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'standings' && styles.tabActive]}
          onPress={() => setActiveTab('standings')}
        >
          <Text style={[styles.tabText, activeTab === 'standings' && styles.tabTextActive]}>Standings</Text>
        </TouchableOpacity>
      </View>

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
          {standings && standings.standings.length > 0 && standings.standings.some(p => p.total_points > 0) ? (
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backButton: {
    padding: 8,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 8,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  leagueName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  headerSubText: {
    fontSize: 12,
    color: '#B3B3B3',
    fontWeight: '500',
  },
  headerCode: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  headerCodeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    padding: 8,
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
    fontSize: 10,
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
    backgroundColor: '#181818',
    borderRadius: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  roundContent: {
    padding: 16,
  },
  roundHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  roundNumberBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundNumberBadgeText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  roundInfo: {
    flex: 1,
  },
  roundNumberHeader: {
    fontSize: 18,
    fontWeight: '700',
    color: '#7C3AED',
  },
  roundThemeSubheader: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  roundMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  roundStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B3B3B3',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  roundMetaText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#B3B3B3',
  },
  roundMetaTextStrong: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  roundMetaDot: {
    fontSize: 12,
    fontWeight: '400',
    color: '#6A6A6A',
    marginHorizontal: 6,
  },
  advanceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#7C3AED',
    borderTopWidth: 0,
    gap: 6,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
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
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    backgroundColor: '#282828',
    borderRadius: 6,
    padding: 3,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 4,
    gap: 6,
  },
  tabActive: {
    backgroundColor: '#7C3AED',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#B3B3B3',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
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
