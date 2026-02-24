import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { getLeagues, createLeague, joinLeague, getRounds, League, Round } from '../../src/services/api';

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [activeRounds, setActiveRounds] = useState<{ [leagueId: string]: Round | null }>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Create league form - simplified
  const [leagueName, setLeagueName] = useState('');
  const [totalRounds, setTotalRounds] = useState('3');

  // Rounds options (1-10)
  const roundsOptions = Array.from({ length: 10 }, (_, i) => ({
    label: `${i + 1} Round${i > 0 ? 's' : ''}`,
    value: String(i + 1)
  }));

  // Timer update effect
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Join league form
  const [leagueCode, setLeagueCode] = useState('');

  const fetchLeagues = async () => {
    try {
      const response = await getLeagues();
      setLeagues(response.data);
      
      // Fetch active rounds for each league
      const roundsData: { [leagueId: string]: Round | null } = {};
      for (const league of response.data) {
        try {
          const roundsRes = await getRounds(league.id);
          // Find active round (submission or voting status)
          const activeRound = roundsRes.data.find(
            (r: Round) => r.status === 'submission' || r.status === 'voting'
          );
          roundsData[league.id] = activeRound || null;
        } catch {
          roundsData[league.id] = null;
        }
      }
      setActiveRounds(roundsData);
    } catch (error) {
      console.error('Failed to fetch leagues:', error);
    } finally {
      setLoading(false);
    }
  };

  // Helper to format time duration
  const formatDuration = (hours: number): string => {
    if (hours < 24) return `${hours} hr${hours > 1 ? 's' : ''}`;
    const days = hours / 24;
    return `${days} day${days > 1 ? 's' : ''}`;
  };

  // Helper to calculate time remaining
  const getTimeRemaining = (deadline: string): string => {
    // Ensure we parse as UTC time
    let endTime: Date;
    if (deadline.endsWith('Z') || deadline.includes('+')) {
      endTime = new Date(deadline);
    } else {
      // Backend sends UTC time without Z suffix, so append it
      endTime = new Date(deadline + 'Z');
    }
    
    const now = new Date();
    const diff = endTime.getTime() - now.getTime();
    
    if (diff <= 0) return 'Expired';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    return `${minutes}m ${seconds}s`;
  };

  useFocusEffect(
    useCallback(() => {
      fetchLeagues();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchLeagues();
    setRefreshing(false);
  };

  const handleCreateLeague = async () => {
    if (!leagueName.trim()) {
      Alert.alert('Error', 'Please enter a league name');
      return;
    }

    setCreating(true);
    try {
      await createLeague({
        name: leagueName.trim(),
        total_rounds: parseInt(totalRounds) || 3,
      });
      setShowCreateModal(false);
      resetCreateForm();
      await fetchLeagues();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create league');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinLeague = async () => {
    if (!leagueCode.trim()) {
      Alert.alert('Error', 'Please enter a league code');
      return;
    }

    setJoining(true);
    try {
      await joinLeague(leagueCode.trim().toUpperCase());
      setShowJoinModal(false);
      setLeagueCode('');
      await fetchLeagues();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to join league');
    } finally {
      setJoining(false);
    }
  };

  const resetCreateForm = () => {
    setLeagueName('');
    setTotalRounds('3');
  };

  const renderLeagueItem = ({ item }: { item: League }) => {
    const activeRound = activeRounds[item.id];
    
    return (
      <TouchableOpacity
        style={styles.leagueCard}
        onPress={() => router.push(`/league/${item.id}`)}
      >
        <View style={styles.leagueHeader}>
          <View style={styles.leagueIcon}>
            <Ionicons name="trophy" size={24} color="#B8C5B0" />
          </View>
          <View style={styles.leagueInfo}>
            <Text style={styles.leagueName}>{item.name}</Text>
            <Text style={styles.leagueTheme}>
              Round {item.current_round} of {item.total_rounds > 0 ? item.total_rounds : 'Unlimited'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="rgba(141, 161, 155, 0.6)" />
        </View>

        {/* Active Round Timer */}
        {activeRound ? (
          <View style={styles.timerRow}>
            <Ionicons 
              name="time-outline" 
              size={16} 
              color="#F9FCF2" 
            />
            <Text style={styles.timerLabel}>
              {activeRound.status === 'submission' ? 'Submission:' : 'Voting:'}
            </Text>
            <Text style={styles.timerValue}>
              {activeRound.status === 'submission' 
                ? getTimeRemaining(activeRound.submission_deadline)
                : getTimeRemaining(activeRound.voting_deadline)
              }
            </Text>
          </View>
        ) : (
          <View style={[styles.timerRow, { backgroundColor: 'rgba(90, 112, 128, 0.3)' }]}>
            <Ionicons name="time-outline" size={16} color="#F9FCF2" />
            <Text style={[styles.timerLabel, { color: '#F9FCF2' }]}>No active round</Text>
          </View>
        )}

        <View style={styles.leagueStats}>
          <View style={styles.memberAvatarsContainer}>
            {item.members.slice(0, 4).map((member, index) => (
              <View 
                key={member.id} 
                style={[
                  styles.memberAvatar,
                  { marginLeft: index > 0 ? -10 : 0, zIndex: 4 - index }
                ]}
              >
                <Text style={styles.memberAvatarText}>
                  {member.username.charAt(0).toUpperCase()}
                </Text>
              </View>
            ))}
            {item.members.length > 4 && (
              <View style={[styles.memberAvatar, styles.memberAvatarMore, { marginLeft: -10, zIndex: 0 }]}>
                <Text style={styles.memberAvatarMoreText}>+{item.members.length - 4}</Text>
              </View>
            )}
          </View>
          <View style={styles.codeContainer}>
            <Text style={styles.codeLabel}>Code:</Text>
            <Text style={styles.codeText}>{item.league_code}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="musical-notes" size={64} color="#B8C5B0" />
      <Text style={styles.emptyTitle}>No Leagues Yet</Text>
      <Text style={styles.emptyText}>
        Create a new league or join an existing one to start competing!
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.username}>{user?.username}</Text>
          <Text style={styles.activeRoundsSubtitle}>
            {Object.values(activeRounds).filter(r => r !== null).length} active round{Object.values(activeRounds).filter(r => r !== null).length !== 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity 
          style={styles.profileImageContainer}
          onPress={() => router.push('/(tabs)/profile')}
        >
          {user?.profile_photo ? (
            <Image 
              source={{ uri: user.profile_photo }} 
              style={styles.profileImage}
            />
          ) : (
            <View style={styles.profileImagePlaceholder}>
              <Ionicons name="person" size={20} color="#8DA19B" />
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => setShowCreateModal(true)}
        >
          <Ionicons name="add-circle" size={24} color="#B8C5B0" />
          <Text style={styles.actionButtonText}>Create League</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.joinButton]}
          onPress={() => setShowJoinModal(true)}
        >
          <Ionicons name="enter" size={24} color="#212F36" />
          <Text style={[styles.actionButtonText, { color: '#212F36' }]}>Join League</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Your Leagues</Text>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#B8C5B0" />
        </View>
      ) : (
        <FlatList
          data={leagues}
          keyExtractor={(item) => item.id}
          renderItem={renderLeagueItem}
          ListEmptyComponent={renderEmptyState}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#6366f1"
            />
          }
        />
      )}

      {/* Create League Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreateModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create League</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={24} color="rgba(141, 161, 155, 0.8)" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalForm}>
                <Text style={styles.inputLabel}>League Name</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g., Friday Night Jams"
                  placeholderTextColor="rgba(141, 161, 155, 0.6)"
                  value={leagueName}
                  onChangeText={setLeagueName}
                  autoComplete="off"
                  autoCorrect={false}
                  textContentType="none"
                  importantForAutofill="no"
                  spellCheck={false}
                />

                <Text style={styles.inputLabel}>Number of Rounds</Text>
                <View style={styles.timeOptionsContainer}>
                  {roundsOptions.map((option) => (
                    <TouchableOpacity
                      key={`rounds-${option.value}`}
                      style={[
                        styles.timeOption,
                        totalRounds === option.value && styles.timeOptionSelected
                      ]}
                      onPress={() => setTotalRounds(option.value)}
                    >
                      <Text style={[
                        styles.timeOptionText,
                        totalRounds === option.value && styles.timeOptionTextSelected
                      ]}>{option.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.submitButton, creating && styles.buttonDisabled]}
                  onPress={handleCreateLeague}
                  disabled={creating}
                >
                  {creating ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.submitButtonText}>Create League</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Join League Modal */}
      <Modal
        visible={showJoinModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowJoinModal(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <TouchableWithoutFeedback>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Join League</Text>
                  <TouchableOpacity onPress={() => setShowJoinModal(false)}>
                    <Ionicons name="close" size={24} color="#888" />
                  </TouchableOpacity>
                </View>
                <View style={styles.modalForm}>
                  <Text style={styles.inputLabel}>League Code</Text>
                  <TextInput
                    style={[styles.modalInput, styles.codeInput]}
                    placeholder="XXXXXX"
                    placeholderTextColor="#666"
                    value={leagueCode}
                    onChangeText={(text) => setLeagueCode(text.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    autoComplete="off"
                    spellCheck={false}
                    textContentType="oneTimeCode"
                    importantForAutofill="no"
                    keyboardType="default"
                    maxLength={6}
                    selectionColor="#B8C5B0"
                  />

                  <TouchableOpacity
                    style={[styles.submitButton, styles.joinSubmitButton, joining && styles.buttonDisabled]}
                    onPress={handleJoinLeague}
                    disabled={joining}
                  >
                    {joining ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.submitButtonText}>Join League</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#212F36',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  greeting: {
    fontSize: 14,
    color: 'rgba(141, 161, 155, 0.8)',
  },
  username: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#F9FCF2',
  },
  activeRoundsSubtitle: {
    fontSize: 13,
    color: '#B8C5B0',
    marginTop: 4,
  },
  profileImageContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  profileImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  profileImagePlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4A6070',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#5A7080',
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginVertical: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4A6070',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#5A7080',
  },
  joinButton: {
    borderColor: '#F9FCF2',
    backgroundColor: '#F9FCF2',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F9FCF2',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F9FCF2',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexGrow: 1,
  },
  leagueCard: {
    backgroundColor: '#4A6070',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#5A7080',
  },
  leagueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leagueIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(184, 197, 176, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leagueInfo: {
    flex: 1,
    marginLeft: 12,
  },
  leagueName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F9FCF2',
  },
  leagueTheme: {
    fontSize: 14,
    color: 'rgba(141, 161, 155, 0.8)',
    marginTop: 2,
  },
  durationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingHorizontal: 4,
  },
  durationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  durationText: {
    fontSize: 12,
    color: 'rgba(141, 161, 155, 0.8)',
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 6,
    backgroundColor: 'rgba(184, 197, 176, 0.15)',
  },
  timerLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#F9FCF2',
  },
  timerValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F9FCF2',
  },
  leagueStats: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#5A7080',
    alignItems: 'center',
  },
  memberAvatarsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#B8C5B0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#4A6070',
  },
  memberAvatarText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#212F36',
  },
  memberAvatarMore: {
    backgroundColor: '#5A7080',
  },
  memberAvatarMoreText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#F9FCF2',
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
    gap: 4,
  },
  statText: {
    fontSize: 13,
    color: 'rgba(141, 161, 155, 0.8)',
  },
  codeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    backgroundColor: 'rgba(184, 197, 176, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  codeLabel: {
    fontSize: 12,
    color: 'rgba(141, 161, 155, 0.8)',
    marginRight: 4,
  },
  codeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B8C5B0',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#F9FCF2',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: 'rgba(141, 161, 155, 0.8)',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(33, 47, 54, 0.95)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#4A6070',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: '#5A7080',
    borderBottomWidth: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#5A7080',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#F9FCF2',
  },
  modalForm: {
    paddingTop: 20,
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
  timeOption: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#212F36',
    borderWidth: 1,
    borderColor: '#5A7080',
  },
  timeOptionSelected: {
    backgroundColor: '#B8C5B0',
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
  codeInput: {
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  submitButton: {
    backgroundColor: '#F9FCF2',
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  joinSubmitButton: {
    backgroundColor: '#F9FCF2',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#212F36',
    fontSize: 16,
    fontWeight: '600',
  },
});
