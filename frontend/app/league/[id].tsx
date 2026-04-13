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
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { useAuth } from '../../src/context/AuthContext';
import { SharedChat } from '../../src/components/SharedChat';
import {
  getLeague,
  getRounds,
  createRound,
  advanceRound,
  deleteLeague,
  leaveLeague,
  getLeagueStandings,
  getChatStatus,
  League,
  Round,
  LeagueStandings,
} from '../../src/services/api';
import { format } from 'date-fns';

export default function LeagueDetailScreen() {
  const { id, openChat: openChatParam } = useLocalSearchParams<{ id: string; openChat?: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [league, setLeague] = useState<League | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [standings, setStandings] = useState<LeagueStandings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creatingRound, setCreatingRound] = useState(false);
  const [advancing, setAdvancing] = useState<string | null>(null);
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

  // Share card state
  const [showShareCard, setShowShareCard] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const shareCardRef = useRef<ViewShot>(null);
  const dataLoaded   = useRef(false);

  // Time options for scrollable dropdown
  const timeOptions = [
    { label: '1 hour', value: '1' },
    { label: '3 hours', value: '3' },
    { label: '6 hours', value: '6' },
    { label: '1 day', value: '24' },
    { label: '2 days', value: '48' },
    { label: '3 days', value: '72' },
    { label: '4 days', value: '96' },
    { label: '5 days', value: '120' },
    { label: '6 days', value: '144' },
    { label: '7 days', value: '168' },
  ];

  // Get display label for selected hours
  const getTimeLabel = (hours: string) => {
    const option = timeOptions.find(o => o.value === hours);
    return option ? option.label : '1 day';
  };

  // Calculate remaining time from UTC deadline
  const getTimeRemaining = (deadlineStr: string): string => {
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

  // Share results card as image
  const handleShareResults = async () => {
    if (!shareCardRef.current) return;
    
    setIsSharing(true);
    try {
      // Capture the view as an image
      const uri = await shareCardRef.current.capture?.();
      
      if (uri) {
        // Check if sharing is available
        const isAvailable = await Sharing.isAvailableAsync();
        
        if (isAvailable) {
          await Sharing.shareAsync(uri, {
            mimeType: 'image/png',
            dialogTitle: 'Share League Results',
          });
        } else {
          // Fallback to basic share
          await Share.share({
            message: `🏆 ${league?.name} Final Results!\n\n${standings?.standings.slice(0, 3).map((p, i) => `${i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} ${p.username}: ${p.total_points} pts`).join('\n')}\n\nPlayed on Music League 🎵`,
          });
        }
      }
    } catch (error) {
      console.error('Share failed:', error);
      Alert.alert('Error', 'Failed to share results');
    } finally {
      setIsSharing(false);
      setShowShareCard(false);
    }
  };

  const handleStartRound = async () => {
    if (!league) return;
    
    // If this is the first round, show a warning
    if (rounds.length === 0) {
      Alert.alert(
        'Start First Round?',
        'Once you start a round, new members will no longer be able to join this league. Make sure everyone has joined before continuing.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Start Round',
            onPress: () => doStartRound(),
          },
        ]
      );
    } else {
      doStartRound();
    }
  };

  const doStartRound = async () => {
    if (!league) return;
    
    setCreatingRound(true);
    try {
      await createRound(league.id, {
        theme: roundTheme.trim(),
        submission_hours: parseInt(submissionHours) || 24,
        voting_hours: parseInt(votingHours) || 24,
        timezone: selectedTimezone,
      });
      setShowStartRoundModal(false);
      setRoundTheme('');
      setSubmissionHours('24');
      setVotingHours('24');
      setSelectedTimezone('EST');
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
    Alert.alert(
      'Delete League',
      'This will permanently delete the league and all its rounds. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteLeague(id!);
              router.back();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to delete league');
            }
          },
        },
      ]
    );
  };

  const handleLeaveLeague = () => {
    Alert.alert(
      'Leave League',
      'Are you sure you want to leave this league?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveLeague(id!);
              router.back();
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
    const message = `Join my Music League "${league.name}"!\n\nCode: ${league.league_code}\n\nOr click this link: ${deepLink}`;
    
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
  const activeRound = rounds.find(r => r.status !== 'completed');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'submission': return '#7C3AED';
      case 'voting': return '#FFFFFF';
      case 'completed': return '#B3B3B3';
      default: return '#B3B3B3';
    }
  };

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case 'submission': return 'rgba(124,58,237,0.15)';
      case 'voting': return 'rgba(255,255,255,0.10)';
      case 'completed': return 'rgba(255,255,255,0.1)';
      default: return 'rgba(255,255,255,0.1)';
    }
  };

  const renderRoundItem = ({ item }: { item: Round }) => (
    <View style={styles.roundCard}>
      <TouchableOpacity
        style={styles.roundContent}
        onPress={() => router.push(`/round/${item.id}`)}
        activeOpacity={0.7}
      >
        <View style={styles.roundHeader}>
          <View style={styles.roundNumber}>
            <Text style={styles.roundNumberText}>R{item.round_number}</Text>
          </View>
          <View style={styles.roundInfo}>
            <Text style={styles.roundTheme}>{item.theme}</Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusBgColor(item.status) }]}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
              <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#6A6A6A" />
        </View>

        <View style={styles.roundStats}>
          <View style={styles.roundStat}>
            <Ionicons name="musical-note" size={14} color="#B3B3B3" />
            <Text style={styles.roundStatText}>{item.submissions_count} songs</Text>
          </View>
          {item.status !== 'completed' && (
            <View style={styles.roundStat}>
              <Ionicons name="time" size={14} color="#FFFFFF" />
              <Text style={[styles.roundStatText, { color: '#FFFFFF', fontWeight: '600' }]}>
                {getTimeRemaining(item.status === 'submission' ? item.submission_deadline : item.voting_deadline)}
              </Text>
            </View>
          )}
          {item.status === 'submission' && (
            <View style={styles.roundStat}>
              <Ionicons
                name={item.has_user_submitted ? 'checkmark-circle' : 'time-outline'}
                size={14}
                color={item.has_user_submitted ? '#FFFFFF' : '#B3B3B3'}
              />
              <Text style={[styles.roundStatText, item.has_user_submitted && { color: '#FFFFFF' }]}>
                {item.has_user_submitted ? 'Submitted' : 'Pending'}
              </Text>
            </View>
          )}
          {item.status === 'voting' && (
            <View style={styles.roundStat}>
              <Ionicons
                name={item.has_user_voted ? 'checkmark-circle' : 'time-outline'}
                size={14}
                color={item.has_user_voted ? '#FFFFFF' : '#B3B3B3'}
              />
              <Text style={[styles.roundStatText, item.has_user_voted && { color: '#FFFFFF' }]}>
                {item.has_user_voted ? 'Voted' : 'Vote Pending'}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {isCreator && item.status !== 'completed' && (
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.leagueName}>{league.name}</Text>
            {loading && dataLoaded.current && (
              <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
            )}
          </View>
          <View style={styles.headerSubRow}>
            <Text style={styles.leagueTheme}>Round {league.current_round} of {league.total_rounds > 0 ? league.total_rounds : 'Unlimited'}</Text>
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
          <TouchableOpacity
            style={styles.headerButton}
            onPress={isCreator ? handleDeleteLeague : handleLeaveLeague}
          >
            <Ionicons
              name={isCreator ? 'trash-outline' : 'exit-outline'}
              size={22}
              color="rgba(255,255,255,0.60)"
            />
          </TouchableOpacity>
        </View>
      </View>


      {isCreator && !activeRound && (league.total_rounds === 0 || league.current_round < league.total_rounds) && (
        <TouchableOpacity
          style={[styles.startRoundButton, creatingRound && styles.buttonDisabled]}
          onPress={() => setShowStartRoundModal(true)}
          disabled={creatingRound}
        >
          {creatingRound ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.startRoundText}>Start New Round</Text>
          )}
        </TouchableOpacity>
      )}

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
        <>
          {rounds.length > 0 ? (
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
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="musical-notes" size={60} color="#7C3AED" />
              <Text style={styles.emptyTitle}>No Rounds Yet</Text>
              <Text style={styles.emptyText}>
                {isCreator
                  ? 'Start a new round to begin the competition!'
                  : 'Waiting for the league creator to start a round.'}
              </Text>
            </View>
          )}
        </>
      )}

      {/* Standings Tab */}
      {activeTab === 'standings' && (
        <ScrollView
          style={styles.standingsContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#7C3AED"
            />
          }
        >
          <View style={styles.standingsHeader}>
            <Text style={styles.standingsTitle}>League Standings</Text>
            <Text style={styles.roundsCompleted}>
              {standings?.rounds_completed || 0} of {league.total_rounds > 0 ? league.total_rounds : 'Unlimited'} rounds completed
            </Text>
          </View>

          {standings && standings.standings.length > 0 && standings.standings.some(p => p.total_points > 0) ? (
            (() => {
              // Calculate actual ranks accounting for ties
              let currentRank = 1;
              let prevPoints: number | null = null;
              const rankedPlayers = standings.standings.map((player, index) => {
                if (prevPoints !== null && player.total_points < prevPoints) {
                  currentRank = index + 1;
                }
                prevPoints = player.total_points;
                return { ...player, rank: currentRank };
              });

              return rankedPlayers.map((player) => {
                const hasPoints = player.total_points > 0;
                const isFirst = player.rank === 1 && hasPoints;
                const isSecond = player.rank === 2 && hasPoints;
                const isThird = player.rank === 3 && hasPoints;
                
                return (
                  <View key={player.user_id} style={[
                    styles.standingRow,
                    isFirst && styles.firstPlace,
                    isSecond && styles.secondPlace,
                    isThird && styles.thirdPlace,
                  ]}>
                    <View style={styles.rankContainer}>
                      {isFirst ? (
                        <Ionicons name="trophy" size={20} color="#7C3AED" />
                      ) : isSecond ? (
                        <Ionicons name="medal" size={20} color="#B3B3B3" />
                      ) : isThird ? (
                        <Ionicons name="medal" size={20} color="#B3B3B3" />
                      ) : (
                        <Text style={styles.rankNumber}>{player.rank}</Text>
                      )}
                    </View>
                    <View style={styles.playerInfo}>
                      <Text style={styles.playerName}>{player.username}</Text>
                    </View>
                    <View style={styles.pointsContainer}>
                      <Text style={styles.pointsValue}>{player.total_points}</Text>
                      <Text style={styles.pointsLabel}>pts</Text>
                    </View>
                  </View>
                );
              });
            })()
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="podium" size={60} color="#333" />
              <Text style={styles.emptyTitle}>No Standings Yet</Text>
              <Text style={styles.emptyText}>Standings will be updated once rounds are completed</Text>
            </View>
          )}

          {/* Share Results Button - Always visible when there are standings */}
          {standings && standings.standings.length > 0 && standings.standings.some(p => p.total_points > 0) && (
            <TouchableOpacity
              style={styles.shareResultsButton}
              onPress={() => setShowShareCard(true)}
            >
              <Ionicons name="share-social" size={20} color="#FFFFFF" />
              <Text style={styles.shareResultsText}>Share Results</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {/* Share Card Modal */}
      <Modal
        visible={showShareCard}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowShareCard(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowShareCard(false)}>
          <View style={styles.shareModalOverlay}>
        <TouchableWithoutFeedback onPress={() => {}}>
          <View style={styles.shareModalContent}>
            <View style={styles.shareModalHeader}>
              <Text style={styles.shareModalTitle}>Share Results</Text>
              <TouchableOpacity onPress={() => setShowShareCard(false)}>
                <Ionicons name="close" size={24} color="#B3B3B3" />
              </TouchableOpacity>
            </View>

            {/* The shareable card */}
            <ViewShot ref={shareCardRef} options={{ format: 'png', quality: 1 }}>
              <View style={styles.shareCard}>
                <View style={styles.shareCardGradient}>
                  {/* Header */}
                  <View style={styles.shareCardHeader}>
                    <Text style={styles.shareCardEmoji}>🏆</Text>
                    <Text style={styles.shareCardTitle}>{league?.name}</Text>
                    <Text style={styles.shareCardSubtitle}>Final Results</Text>
                  </View>

                  {/* Standings */}
                  <View style={styles.shareCardStandings}>
                    {(() => {
                      // Compute tie-aware ranks (same algorithm as the standings tab)
                      let currentRank = 1;
                      let prevPoints: number | null = null;
                      const rankedPlayers = (standings?.standings ?? []).slice(0, 5).map((player, index) => {
                        if (prevPoints !== null && player.total_points < prevPoints) {
                          currentRank = index + 1;
                        }
                        prevPoints = player.total_points;
                        return { ...player, rank: currentRank };
                      });

                      return rankedPlayers.map((player) => {
                        const rank = player.rank;
                        const emoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
                        const isWinner = rank === 1;
                        return (
                          <View key={player.user_id} style={[
                            styles.shareCardRow,
                            isWinner && styles.shareCardWinnerRow
                          ]}>
                            <Text style={styles.shareCardRankEmoji}>{emoji}</Text>
                            <Text style={[styles.shareCardUsername, isWinner && styles.shareCardWinnerText]}>
                              {player.username}
                            </Text>
                            <Text style={[styles.shareCardPoints, isWinner && styles.shareCardWinnerText]}>
                              {player.total_points} pts
                            </Text>
                          </View>
                        );
                      });
                    })()}
                  </View>

                  {/* Footer */}
                  <View style={styles.shareCardFooter}>
                    <Text style={styles.shareCardBranding}>🎵 Music League</Text>
                    <Text style={styles.shareCardCTA}>Create your own league!</Text>
                  </View>
                </View>
              </View>
            </ViewShot>

            {/* Share Button */}
            <TouchableOpacity
              style={[styles.shareButton, isSharing && styles.buttonDisabled]}
              onPress={handleShareResults}
              disabled={isSharing}
            >
              {isSharing ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="share-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.shareButtonText}>Share to Stories / Messages</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

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
                  placeholder="e.g., Songs that make you dance"
                  placeholderTextColor="#B3B3B3"
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
  leagueName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  leagueTheme: {
    fontSize: 13,
    color: '#B3B3B3',
  },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  roundNumber: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundNumberText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  roundInfo: {
    flex: 1,
    marginLeft: 12,
  },
  roundTheme: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: 4,
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  roundStats: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    gap: 16,
  },
  roundStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  roundStatText: {
    fontSize: 13,
    color: '#B3B3B3',
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
    paddingHorizontal: 16,
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
  shareCard: {
    width: '100%',
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
