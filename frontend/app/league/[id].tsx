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
import { LinearGradient } from 'expo-linear-gradient';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { useAuth } from '../../src/context/AuthContext';
import {
  getLeague,
  getRounds,
  createRound,
  advanceRound,
  deleteLeague,
  leaveLeague,
  getLeagueStandings,
  getLeagueMessages,
  sendLeagueMessage,
  getChatStatus,
  League,
  Round,
  LeagueStandings,
  Message,
} from '../../src/services/api';
import { format } from 'date-fns';

export default function LeagueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const chatListRef = useRef<FlatList>(null);

  // Members modal state
  const [showMembersModal, setShowMembersModal] = useState(false);

  // Share card state
  const [showShareCard, setShowShareCard] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const shareCardRef = useRef<ViewShot>(null);

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

  // Fetch chat messages (silent refresh doesn't show loading)
  const fetchMessages = async (silent = false) => {
    if (!id) return;
    if (!silent) setLoadingMessages(true);
    try {
      const response = await getLeagueMessages(id);
      const newMessages = response.data;
      
      // Only scroll to bottom if there are new messages
      const hasNewMessages = newMessages.length > messages.length;
      setMessages(newMessages);
      setHasUnread(false);
      
      if (hasNewMessages || !silent) {
        setTimeout(() => {
          chatListRef.current?.scrollToEnd({ animated: silent });
        }, 100);
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  };

  // Auto-refresh messages while chat is open
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    
    if (showChatModal && id) {
      // Refresh messages every 3 seconds
      intervalId = setInterval(() => {
        fetchMessages(true); // silent refresh
      }, 3000);
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [showChatModal, id]);

  // Send a message
  const handleSendMessage = async () => {
    if (!id || !newMessage.trim() || sendingMessage) return;
    
    const messageContent = newMessage.trim();
    setNewMessage(''); // Clear input immediately for better UX
    setSendingMessage(true);
    
    try {
      const response = await sendLeagueMessage(id, messageContent);
      setMessages(prev => [...prev, response.data]);
      // Scroll to bottom
      setTimeout(() => {
        chatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('Failed to send message:', error);
      setNewMessage(messageContent); // Restore message on error
      Alert.alert('Error', 'Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };

  // Open chat modal
  const openChat = () => {
    setShowChatModal(true);
    fetchMessages();
  };

  // Check for unread messages (silent background check)
  const checkUnreadMessages = async () => {
    if (!id || showChatModal) return; // Don't check if chat is open
    try {
      const chatStatusRes = await getChatStatus(id);
      setHasUnread(chatStatusRes.data.has_unread);
    } catch (e) {
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

  useFocusEffect(
    useCallback(() => {
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
      'Are you sure you want to delete this league? This cannot be undone.',
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
      case 'submission': return '#B8C5B0';  // Sage green
      case 'voting': return '#4A6070';      // Dark blue for text on cream
      case 'completed': return '#8DA19B';   // Muted grey-green
      default: return 'rgba(141, 161, 155, 0.8)';
    }
  };

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case 'submission': return 'rgba(184, 197, 176, 0.2)';
      case 'voting': return '#F9FCF2';  // Cream background for voting
      case 'completed': return 'rgba(141, 161, 155, 0.2)';
      default: return 'rgba(141, 161, 155, 0.2)';
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
              <View style={[styles.statusDot, { backgroundColor: item.status === 'voting' ? '#4A6070' : getStatusColor(item.status) }]} />
              <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="rgba(141, 161, 155, 0.6)" />
        </View>

        <View style={styles.roundStats}>
          <View style={styles.roundStat}>
            <Ionicons name="musical-note" size={14} color="#B8C5B0" />
            <Text style={styles.roundStatText}>{item.submissions_count} songs</Text>
          </View>
          {item.status !== 'completed' && (
            <View style={styles.roundStat}>
              <Ionicons name="time" size={14} color="#f59e0b" />
              <Text style={[styles.roundStatText, { color: '#f59e0b' }]}>
                {getTimeRemaining(item.status === 'submission' ? item.submission_deadline : item.voting_deadline)}
              </Text>
            </View>
          )}
          {item.status === 'submission' && (
            <View style={styles.roundStat}>
              <Ionicons
                name={item.has_user_submitted ? 'checkmark-circle' : 'time-outline'}
                size={14}
                color={item.has_user_submitted ? '#B8C5B0' : 'rgba(141, 161, 155, 0.8)'}
              />
              <Text style={[styles.roundStatText, item.has_user_submitted && { color: '#B8C5B0' }]}>
                {item.has_user_submitted ? 'Submitted' : 'Pending'}
              </Text>
            </View>
          )}
          {item.status === 'voting' && (
            <View style={styles.roundStat}>
              <Ionicons
                name={item.has_user_voted ? 'checkmark-circle' : 'time-outline'}
                size={14}
                color={item.has_user_voted ? '#B8C5B0' : 'rgba(141, 161, 155, 0.8)'}
              />
              <Text style={[styles.roundStatText, item.has_user_voted && { color: '#B8C5B0' }]}>
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
            <ActivityIndicator size="small" color="#212F36" />
          ) : (
            <>
              <Ionicons name="arrow-forward" size={16} color="#212F36" />
              <Text style={styles.advanceButtonText}>
                Advance to {item.status === 'submission' ? 'Voting' : 'Results'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#B8C5B0" />
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
          <Ionicons name="arrow-back" size={24} color="#F9FCF2" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.leagueName}>{league.name}</Text>
          <Text style={styles.leagueTheme}>Round {league.current_round} of {league.total_rounds > 0 ? league.total_rounds : 'Unlimited'}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerButton} onPress={() => setShowMembersModal(true)}>
            <Ionicons name="people" size={22} color="#B8C5B0" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={openChat}>
            <Ionicons name="chatbubble-outline" size={22} color="#B8C5B0" />
            {hasUnread && <View style={styles.unreadBadge} />}
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={handleCopyCode}>
            <Ionicons name="copy-outline" size={22} color="#B8C5B0" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={isCreator ? handleDeleteLeague : handleLeaveLeague}
          >
            <Ionicons
              name={isCreator ? 'trash-outline' : 'exit-outline'}
              size={22}
              color="#ef4444"
            />
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity style={styles.codeBar} onPress={handleCopyCode} activeOpacity={0.7}>
        <View style={styles.codeInfo}>
          <Text style={styles.codeLabel}>League Code</Text>
          <View style={styles.codeRow}>
            <Text style={styles.codeValue}>{league.league_code}</Text>
            <Ionicons name="copy-outline" size={18} color="#B8C5B0" style={{ marginLeft: 8 }} />
          </View>
        </View>
        <View style={styles.memberAvatarsRow}>
          {league.members.slice(0, 4).map((member, index) => (
            <View key={member.id} style={[styles.memberAvatarSmall, { marginLeft: index > 0 ? -8 : 0, zIndex: 4 - index }]}>
              {member.profile_photo ? (
                <Image source={{ uri: member.profile_photo }} style={styles.memberAvatarImage} />
              ) : (
                <View style={styles.memberAvatarPlaceholder}>
                  <Text style={styles.memberAvatarInitial}>{member.username?.charAt(0).toUpperCase()}</Text>
                </View>
              )}
            </View>
          ))}
          {league.members.length > 4 && (
            <View style={[styles.memberAvatarSmall, styles.memberAvatarMore, { marginLeft: -8 }]}>
              <Text style={styles.memberMoreText}>+{league.members.length - 4}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {isCreator && !activeRound && (league.total_rounds === 0 || league.current_round < league.total_rounds) && (
        <TouchableOpacity
          style={[styles.startRoundButton, creatingRound && styles.buttonDisabled]}
          onPress={() => setShowStartRoundModal(true)}
          disabled={creatingRound}
        >
          {creatingRound ? (
            <ActivityIndicator color="#212F36" />
          ) : (
            <>
              <Ionicons name="play" size={20} color="#212F36" />
              <Text style={styles.startRoundText}>Start New Round</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'rounds' && styles.tabActive]}
          onPress={() => setActiveTab('rounds')}
        >
          <Ionicons name="flag" size={18} color={activeTab === 'rounds' ? '#F9FCF2' : '#8DA19B'} />
          <Text style={[styles.tabText, activeTab === 'rounds' && styles.tabTextActive]}>Rounds</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'standings' && styles.tabActive]}
          onPress={() => setActiveTab('standings')}
        >
          <Ionicons name="trophy" size={18} color={activeTab === 'standings' ? '#F9FCF2' : '#8DA19B'} />
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
                  tintColor="#B8C5B0"
                />
              }
            />
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="flag" size={60} color="#333" />
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
              tintColor="#B8C5B0"
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
                        <Ionicons name="trophy" size={20} color="#fbbf24" />
                      ) : isSecond ? (
                        <Ionicons name="medal" size={20} color="#9ca3af" />
                      ) : isThird ? (
                        <Ionicons name="medal" size={20} color="#d97706" />
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
              <Ionicons name="share-social" size={20} color="#212F36" />
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
        <View style={styles.shareModalOverlay}>
          <View style={styles.shareModalContent}>
            <View style={styles.shareModalHeader}>
              <Text style={styles.shareModalTitle}>Share Results</Text>
              <TouchableOpacity onPress={() => setShowShareCard(false)}>
                <Ionicons name="close" size={24} color="#888" />
              </TouchableOpacity>
            </View>

            {/* The shareable card */}
            <ViewShot ref={shareCardRef} options={{ format: 'png', quality: 1 }}>
              <View style={styles.shareCard}>
                <LinearGradient
                  colors={['#1a1a2e', '#16213e', '#0f3460']}
                  style={styles.shareCardGradient}
                >
                  {/* Header */}
                  <View style={styles.shareCardHeader}>
                    <Text style={styles.shareCardEmoji}>🏆</Text>
                    <Text style={styles.shareCardTitle}>{league?.name}</Text>
                    <Text style={styles.shareCardSubtitle}>Final Results</Text>
                  </View>

                  {/* Standings */}
                  <View style={styles.shareCardStandings}>
                    {standings?.standings.slice(0, 5).map((player, index) => {
                      const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                      const isWinner = index === 0;
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
                    })}
                  </View>

                  {/* Footer */}
                  <View style={styles.shareCardFooter}>
                    <Text style={styles.shareCardBranding}>🎵 Music League</Text>
                    <Text style={styles.shareCardCTA}>Create your own league!</Text>
                  </View>
                </LinearGradient>
              </View>
            </ViewShot>

            {/* Share Button */}
            <TouchableOpacity
              style={[styles.shareButton, isSharing && styles.buttonDisabled]}
              onPress={handleShareResults}
              disabled={isSharing}
            >
              {isSharing ? (
                <ActivityIndicator color="#212F36" />
              ) : (
                <>
                  <Ionicons name="share-outline" size={20} color="#212F36" />
                  <Text style={styles.shareButtonText}>Share to Stories / Messages</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Start Round Modal */}
      <Modal
        visible={showStartRoundModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowStartRoundModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Start New Round</Text>
              <TouchableOpacity onPress={() => setShowStartRoundModal(false)}>
                <Ionicons name="close" size={24} color="#888" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalForm}>
                <Text style={styles.inputLabel}>Theme / Prompt (Optional)</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g., Songs that make you dance"
                  placeholderTextColor="#666"
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
                  <Ionicons name="time" size={20} color="#B8C5B0" />
                  <Text style={styles.dropdownButtonText}>{getTimeLabel(submissionHours)}</Text>
                  <Ionicons name={showSubmissionPicker ? "chevron-up" : "chevron-down"} size={20} color="#B8C5B0" />
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
                            <Ionicons name="checkmark" size={18} color="#B8C5B0" />
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
                  <Ionicons name="time" size={20} color="#B8C5B0" />
                  <Text style={styles.dropdownButtonText}>{getTimeLabel(votingHours)}</Text>
                  <Ionicons name={showVotingPicker ? "chevron-up" : "chevron-down"} size={20} color="#B8C5B0" />
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
                            <Ionicons name="checkmark" size={18} color="#B8C5B0" />
                          )}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                <Text style={styles.inputLabel}>Your Timezone (Auto-detected)</Text>
                <Text style={styles.inputHint}>
                  Deadlines will end at the same clock time in your timezone
                </Text>
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
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.submitButtonText}>Start Round</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Chat Modal */}
      <Modal
        visible={showChatModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowChatModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.chatModalContainer}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
        >
          <View style={styles.chatModalContent}>
              <View style={styles.chatModalHeader}>
                <Text style={styles.chatModalTitle}>League Chat</Text>
                <TouchableOpacity onPress={() => { Keyboard.dismiss(); setShowChatModal(false); }}>
                  <Ionicons name="close" size={24} color="#888" />
                </TouchableOpacity>
              </View>

              {loadingMessages ? (
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                  <View style={styles.chatLoadingContainer}>
                    <ActivityIndicator size="large" color="#B8C5B0" />
                  </View>
                </TouchableWithoutFeedback>
              ) : messages.length === 0 ? (
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                  <View style={styles.chatEmptyState}>
                    <Ionicons name="chatbubbles-outline" size={60} color="#333" />
                    <Text style={styles.chatEmptyTitle}>No messages yet</Text>
                    <Text style={styles.chatEmptyText}>Start the conversation!</Text>
                  </View>
                </TouchableWithoutFeedback>
              ) : (
                <FlatList
                  ref={chatListRef}
                  data={messages}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={styles.chatListContent}
                  keyboardShouldPersistTaps="handled"
                  onScrollBeginDrag={Keyboard.dismiss}
                  renderItem={({ item }) => {
                    const isOwnMessage = item.user_id === user?.id;
                    return (
                      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                        <View style={[
                          styles.messageContainer,
                          isOwnMessage && styles.ownMessageContainer
                        ]}>
                          <View style={[
                            styles.messageBubble,
                            isOwnMessage ? styles.ownMessageBubble : styles.otherMessageBubble
                          ]}>
                            {!isOwnMessage && (
                              <Text style={styles.messageUsername}>{item.username}</Text>
                            )}
                            <Text style={[
                              styles.messageText,
                              isOwnMessage && styles.ownMessageText
                            ]}>{item.content}</Text>
                            <Text style={[
                              styles.messageTime,
                              isOwnMessage && styles.ownMessageTime
                            ]}>
                              {format(new Date(item.created_at), 'MMM d, h:mm a')}
                            </Text>
                          </View>
                        </View>
                      </TouchableWithoutFeedback>
                    );
                  }}
                />
              )}

              <View style={styles.chatInputContainer}>
                <TextInput
                  style={styles.chatInput}
                  placeholder="Type a message..."
                  placeholderTextColor="#666"
                  value={newMessage}
                onChangeText={setNewMessage}
                multiline
                maxLength={500}
                autoComplete="off"
                autoCorrect={false}
                textContentType="none"
                importantForAutofill="no"
                spellCheck={false}
              />
              <TouchableOpacity
                style={[styles.sendButton, (!newMessage.trim() || sendingMessage) && styles.sendButtonDisabled]}
                onPress={handleSendMessage}
                disabled={!newMessage.trim() || sendingMessage}
              >
                {sendingMessage ? (
                  <ActivityIndicator size="small" color="#212F36" />
                ) : (
                  <Ionicons name="send" size={20} color="#212F36" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Members Modal */}
      <Modal
        visible={showMembersModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowMembersModal(false)}
      >
        <View style={styles.membersModalOverlay}>
          <View style={styles.membersModalContent}>
            <View style={styles.membersModalHeader}>
              <Text style={styles.membersModalTitle}>League Members</Text>
              <TouchableOpacity onPress={() => setShowMembersModal(false)}>
                <Ionicons name="close" size={24} color="#8DA19B" />
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
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#212F36',
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
    color: 'rgba(141, 161, 155, 0.8)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 8,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 8,
  },
  leagueName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#F9FCF2',
  },
  leagueTheme: {
    fontSize: 14,
    color: 'rgba(141, 161, 155, 0.8)',
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
    backgroundColor: '#4A6070',
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#5A7080',
  },
  codeInfo: {
    flex: 1,
  },
  codeLabel: {
    fontSize: 12,
    color: 'rgba(141, 161, 155, 0.8)',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  codeValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#B8C5B0',
    letterSpacing: 2,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  memberCount: {
    fontSize: 14,
    color: 'rgba(141, 161, 155, 0.8)',
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
    borderColor: '#4A6070',
    overflow: 'hidden',
  },
  memberAvatarImage: {
    width: '100%',
    height: '100%',
  },
  memberAvatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#212F36',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarInitial: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B8C5B0',
  },
  memberAvatarMore: {
    backgroundColor: '#212F36',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberMoreText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#B8C5B0',
  },
  startRoundButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FCF2',
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  startRoundText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212F36',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F9FCF2',
    paddingHorizontal: 16,
    marginTop: 24,
    marginBottom: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  roundCard: {
    backgroundColor: '#4A6070',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#5A7080',
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
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundNumberText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#B8C5B0',
  },
  roundInfo: {
    flex: 1,
    marginLeft: 12,
  },
  roundTheme: {
    fontSize: 16,
    fontWeight: '500',
    color: '#F9FCF2',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  roundStats: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#5A7080',
    gap: 16,
  },
  roundStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  roundStatText: {
    fontSize: 13,
    color: 'rgba(141, 161, 155, 0.8)',
  },
  advanceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderTopWidth: 1,
    borderTopColor: '#5A7080',
    gap: 6,
  },
  advanceButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#B8C5B0',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F9FCF2',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: 'rgba(141, 161, 155, 0.8)',
    textAlign: 'center',
    marginTop: 8,
  },
  // Tab styles
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    backgroundColor: '#4A6070',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  tabActive: {
    backgroundColor: '#212F36',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(141, 161, 155, 0.8)',
  },
  tabTextActive: {
    color: '#B8C5B0',
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
    borderBottomColor: '#5A7080',
  },
  standingsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F9FCF2',
  },
  roundsCompleted: {
    fontSize: 13,
    color: 'rgba(141, 161, 155, 0.8)',
    marginTop: 4,
  },
  standingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4A6070',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  firstPlace: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  secondPlace: {
    backgroundColor: 'rgba(156, 163, 175, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(156, 163, 175, 0.2)',
  },
  thirdPlace: {
    backgroundColor: 'rgba(217, 119, 6, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.2)',
  },
  rankContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#212F36',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rankNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(141, 161, 155, 0.8)',
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#F9FCF2',
  },
  playerStats: {
    fontSize: 12,
    color: 'rgba(141, 161, 155, 0.8)',
    marginTop: 2,
  },
  pointsContainer: {
    alignItems: 'center',
  },
  pointsValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#B8C5B0',
  },
  pointsLabel: {
    fontSize: 11,
    color: 'rgba(141, 161, 155, 0.8)',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#4A6070',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#5A7080',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#F9FCF2',
  },
  modalForm: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(141, 161, 155, 0.8)',
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: '#212F36',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 52,
    color: '#F9FCF2',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#5A7080',
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
    backgroundColor: '#212F36',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#5A7080',
    marginBottom: 8,
  },
  dropdownButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#F9FCF2',
    marginLeft: 12,
  },
  dropdownList: {
    backgroundColor: '#2A3A42',
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#5A7080',
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
    borderBottomColor: 'rgba(74, 96, 112, 0.3)',
  },
  dropdownItemSelected: {
    backgroundColor: 'rgba(184, 197, 176, 0.15)',
  },
  dropdownItemText: {
    fontSize: 16,
    color: '#F9FCF2',
  },
  dropdownItemTextSelected: {
    color: '#B8C5B0',
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
    backgroundColor: '#212F36',
    borderWidth: 1,
    borderColor: '#5A7080',
    alignItems: 'center',
  },
  timezoneOptionSelected: {
    backgroundColor: '#B8C5B0',
    borderColor: '#B8C5B0',
  },
  timezoneText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8DA19B',
  },
  timezoneTextSelected: {
    color: '#212F36',
  },
  timezoneSubtext: {
    fontSize: 12,
    color: '#6B7A82',
    marginTop: 2,
  },
  timezoneSubtextSelected: {
    color: 'rgba(33, 47, 54, 0.7)',
  },
  inputHint: {
    fontSize: 12,
    color: 'rgba(141, 161, 155, 0.6)',
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
    backgroundColor: '#212F36',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#5A7080',
    gap: 8,
  },
  dateTimeText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#F9FCF2',
  },
  pickerContainer: {
    backgroundColor: '#2A3A42',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  pickerDoneButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#B8C5B0',
    borderRadius: 8,
    marginTop: 12,
  },
  pickerDoneText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212F36',
  },
  timeOption: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#212F36',
    borderWidth: 1,
    borderColor: '#5A7080',
  },
  timeOptionSelected: {
    backgroundColor: '#F9FCF2',
    borderColor: '#B8C5B0',
  },
  timeOptionText: {
    fontSize: 14,
    color: 'rgba(141, 161, 155, 0.8)',
    fontWeight: '500',
  },
  timeOptionTextSelected: {
    color: '#212F36',
  },
  submitButton: {
    backgroundColor: '#F9FCF2',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212F36',
  },
  // Chat styles
  unreadBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
  },
  chatModalContainer: {
    flex: 1,
    backgroundColor: '#212F36',
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
    borderBottomColor: '#5A7080',
    backgroundColor: '#4A6070',
  },
  chatModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#F9FCF2',
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
    fontWeight: '600',
    color: '#F9FCF2',
    marginTop: 16,
  },
  chatEmptyText: {
    fontSize: 14,
    color: 'rgba(141, 161, 155, 0.8)',
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
    backgroundColor: '#F9FCF2',
    borderBottomRightRadius: 4,
  },
  otherMessageBubble: {
    backgroundColor: '#4A6070',
    borderBottomLeftRadius: 4,
  },
  messageUsername: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B8C5B0',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 15,
    color: '#F9FCF2',
    lineHeight: 20,
  },
  ownMessageText: {
    color: '#212F36',
  },
  messageTime: {
    fontSize: 11,
    color: 'rgba(141, 161, 155, 0.6)',
    marginTop: 6,
  },
  ownMessageTime: {
    color: 'rgba(255, 255, 255, 0.6)',
  },
  chatInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    backgroundColor: '#4A6070',
    borderTopWidth: 1,
    borderTopColor: '#5A7080',
    gap: 12,
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#212F36',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#F9FCF2',
    fontSize: 15,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#5A7080',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F9FCF2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#333',
  },
  // Share Results styles
  shareResultsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FCF2',
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 32,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  shareResultsText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212F36',
  },
  shareModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  shareModalContent: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#4A6070',
    borderRadius: 20,
    overflow: 'hidden',
  },
  shareModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#5A7080',
  },
  shareModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F9FCF2',
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
    fontWeight: 'bold',
    color: '#F9FCF2',
    textAlign: 'center',
    marginBottom: 4,
  },
  shareCardSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  shareCardStandings: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 16,
    marginVertical: 20,
  },
  shareCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  shareCardWinnerRow: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
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
    color: '#F9FCF2',
    fontWeight: '500',
  },
  shareCardWinnerText: {
    fontWeight: 'bold',
    color: '#fbbf24',
  },
  shareCardPoints: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '600',
  },
  shareCardFooter: {
    alignItems: 'center',
    paddingBottom: 20,
  },
  shareCardBranding: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#F9FCF2',
    marginBottom: 8,
  },
  shareCardCTA: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FCF2',
    margin: 16,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  shareButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212F36',
  },
  membersModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  membersModalContent: {
    width: '85%',
    maxHeight: '70%',
    backgroundColor: '#2A3A42',
    borderRadius: 16,
    overflow: 'hidden',
  },
  membersModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(74, 96, 112, 0.5)',
  },
  membersModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F9FCF2',
  },
  membersList: {
    padding: 16,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(74, 96, 112, 0.3)',
  },
  memberNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(184, 197, 176, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  memberNumberText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B8C5B0',
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
    backgroundColor: '#212F36',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInitial: {
    fontSize: 16,
    fontWeight: '600',
    color: '#B8C5B0',
  },
  memberDetails: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F9FCF2',
  },
  memberUsername: {
    fontSize: 12,
    color: 'rgba(141, 161, 155, 0.7)',
    marginTop: 2,
  },
  creatorBadge: {
    backgroundColor: '#B8C5B0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  creatorBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#212F36',
  },
});
