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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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

  // Chat state
  const [showChatModal, setShowChatModal] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const chatListRef = useRef<FlatList>(null);

  // Time options
  const timeOptions = [
    { label: '1 hr', value: '1' },
    { label: '6 hrs', value: '6' },
    { label: '12 hrs', value: '12' },
    { label: '1 day', value: '24' },
    { label: '3 days', value: '72' },
    { label: '7 days', value: '168' },
  ];

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

  // Fetch chat messages
  const fetchMessages = async () => {
    if (!id) return;
    setLoadingMessages(true);
    try {
      const response = await getLeagueMessages(id);
      setMessages(response.data);
      setHasUnread(false);
      // Scroll to bottom after loading
      setTimeout(() => {
        chatListRef.current?.scrollToEnd({ animated: false });
      }, 100);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      setLoadingMessages(false);
    }
  };

  // Send a message
  const handleSendMessage = async () => {
    if (!id || !newMessage.trim() || sendingMessage) return;
    
    setSendingMessage(true);
    try {
      const response = await sendLeagueMessage(id, newMessage.trim());
      setMessages(prev => [...prev, response.data]);
      setNewMessage('');
      // Scroll to bottom
      setTimeout(() => {
        chatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('Failed to send message:', error);
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

  const handleShareCode = async () => {
    if (!league) return;
    try {
      await Share.share({
        message: `Join my Music League "${league.name}"! Use code: ${league.league_code}`,
      });
    } catch (error) {
      console.error('Share failed:', error);
    }
  };

  const handleStartRound = async () => {
    if (!league) return;
    
    setCreatingRound(true);
    try {
      await createRound(league.id, {
        theme: roundTheme.trim(),
        submission_hours: parseInt(submissionHours) || 24,
        voting_hours: parseInt(votingHours) || 24,
      });
      setShowStartRoundModal(false);
      setRoundTheme('');
      setSubmissionHours('24');
      setVotingHours('24');
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

  const isCreator = league?.creator_id === user?.id;
  const activeRound = rounds.find(r => r.status !== 'completed');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'submission': return '#10b981';
      case 'voting': return '#f59e0b';
      case 'completed': return '#6366f1';
      default: return '#888';
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
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
              <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#666" />
        </View>

        <View style={styles.roundStats}>
          <View style={styles.roundStat}>
            <Ionicons name="musical-note" size={14} color="#888" />
            <Text style={styles.roundStatText}>{item.submissions_count} songs</Text>
          </View>
          {item.status === 'submission' && (
            <View style={styles.roundStat}>
              <Ionicons
                name={item.has_user_submitted ? 'checkmark-circle' : 'time-outline'}
                size={14}
                color={item.has_user_submitted ? '#10b981' : '#888'}
              />
              <Text style={[styles.roundStatText, item.has_user_submitted && { color: '#10b981' }]}>
                {item.has_user_submitted ? 'Submitted' : 'Pending'}
              </Text>
            </View>
          )}
          {item.status === 'voting' && (
            <View style={styles.roundStat}>
              <Ionicons
                name={item.has_user_voted ? 'checkmark-circle' : 'time-outline'}
                size={14}
                color={item.has_user_voted ? '#10b981' : '#888'}
              />
              <Text style={[styles.roundStatText, item.has_user_voted && { color: '#10b981' }]}>
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
            <ActivityIndicator size="small" color="#6366f1" />
          ) : (
            <>
              <Ionicons name="arrow-forward" size={16} color="#6366f1" />
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
          <ActivityIndicator size="large" color="#6366f1" />
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
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.leagueName}>{league.name}</Text>
          <Text style={styles.leagueTheme}>Round {league.current_round} of {league.total_rounds > 0 ? league.total_rounds : 'Unlimited'}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerButton} onPress={openChat}>
            <Ionicons name="chatbubble-outline" size={22} color="#6366f1" />
            {hasUnread && <View style={styles.unreadBadge} />}
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={handleShareCode}>
            <Ionicons name="share-outline" size={22} color="#6366f1" />
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

      <View style={styles.codeBar}>
        <View style={styles.codeInfo}>
          <Text style={styles.codeLabel}>League Code</Text>
          <Text style={styles.codeValue}>{league.league_code}</Text>
        </View>
        <View style={styles.memberInfo}>
          <Ionicons name="people" size={16} color="#888" />
          <Text style={styles.memberCount}>{league.members.length} members</Text>
        </View>
      </View>

      {isCreator && !activeRound && (league.total_rounds === 0 || league.current_round < league.total_rounds) && (
        <TouchableOpacity
          style={[styles.startRoundButton, creatingRound && styles.buttonDisabled]}
          onPress={() => setShowStartRoundModal(true)}
          disabled={creatingRound}
        >
          {creatingRound ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="play" size={20} color="#fff" />
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
          <Ionicons name="flag" size={18} color={activeTab === 'rounds' ? '#6366f1' : '#888'} />
          <Text style={[styles.tabText, activeTab === 'rounds' && styles.tabTextActive]}>Rounds</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'standings' && styles.tabActive]}
          onPress={() => setActiveTab('standings')}
        >
          <Ionicons name="trophy" size={18} color={activeTab === 'standings' ? '#6366f1' : '#888'} />
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
                  tintColor="#6366f1"
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
              tintColor="#6366f1"
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
        </ScrollView>
      )}

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
                <View style={styles.timeOptionsContainer}>
                  {timeOptions.map((option) => (
                    <TouchableOpacity
                      key={`sub-${option.value}`}
                      style={[
                        styles.timeOption,
                        submissionHours === option.value && styles.timeOptionSelected
                      ]}
                      onPress={() => setSubmissionHours(option.value)}
                    >
                      <Text style={[
                        styles.timeOptionText,
                        submissionHours === option.value && styles.timeOptionTextSelected
                      ]}>{option.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.inputLabel}>Voting Time</Text>
                <View style={styles.timeOptionsContainer}>
                  {timeOptions.map((option) => (
                    <TouchableOpacity
                      key={`vote-${option.value}`}
                      style={[
                        styles.timeOption,
                        votingHours === option.value && styles.timeOptionSelected
                      ]}
                      onPress={() => setVotingHours(option.value)}
                    >
                      <Text style={[
                        styles.timeOptionText,
                        votingHours === option.value && styles.timeOptionTextSelected
                      ]}>{option.label}</Text>
                    </TouchableOpacity>
                  ))}
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
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
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
                    <ActivityIndicator size="large" color="#6366f1" />
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
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="send" size={20} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
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
    color: '#888',
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
    color: '#fff',
  },
  leagueTheme: {
    fontSize: 14,
    color: '#888',
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
    backgroundColor: '#1a1a1a',
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  codeInfo: {
    flex: 1,
  },
  codeLabel: {
    fontSize: 12,
    color: '#888',
  },
  codeValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#6366f1',
    letterSpacing: 2,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  memberCount: {
    fontSize: 14,
    color: '#888',
  },
  startRoundButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
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
    color: '#fff',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    paddingHorizontal: 16,
    marginTop: 24,
    marginBottom: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  roundCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
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
    color: '#6366f1',
  },
  roundInfo: {
    flex: 1,
    marginLeft: 12,
  },
  roundTheme: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
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
    borderTopColor: '#333',
    gap: 16,
  },
  roundStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  roundStatText: {
    fontSize: 13,
    color: '#888',
  },
  advanceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderTopWidth: 1,
    borderTopColor: '#333',
    gap: 6,
  },
  advanceButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6366f1',
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
    color: '#fff',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 8,
  },
  // Tab styles
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    backgroundColor: '#1a1a1a',
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
    backgroundColor: '#0a0a0a',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#888',
  },
  tabTextActive: {
    color: '#6366f1',
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
    borderBottomColor: '#333',
  },
  standingsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  roundsCompleted: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
  },
  standingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
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
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rankNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#888',
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
  },
  playerStats: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  pointsContainer: {
    alignItems: 'center',
  },
  pointsValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#6366f1',
  },
  pointsLabel: {
    fontSize: 11,
    color: '#888',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
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
    borderBottomColor: '#333',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  modalForm: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#888',
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 52,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 16,
  },
  timeOptionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  timeOption: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#333',
  },
  timeOptionSelected: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  timeOptionText: {
    fontSize: 14,
    color: '#888',
    fontWeight: '500',
  },
  timeOptionTextSelected: {
    color: '#fff',
  },
  submitButton: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
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
    backgroundColor: '#0a0a0a',
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
    borderBottomColor: '#333',
    backgroundColor: '#1a1a1a',
  },
  chatModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
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
    color: '#fff',
    marginTop: 16,
  },
  chatEmptyText: {
    fontSize: 14,
    color: '#888',
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
    backgroundColor: '#6366f1',
    borderBottomRightRadius: 4,
  },
  otherMessageBubble: {
    backgroundColor: '#1a1a1a',
    borderBottomLeftRadius: 4,
  },
  messageUsername: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6366f1',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 15,
    color: '#fff',
    lineHeight: 20,
  },
  ownMessageText: {
    color: '#fff',
  },
  messageTime: {
    fontSize: 11,
    color: '#666',
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
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#333',
    gap: 12,
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#333',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#333',
  },
});
