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
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../src/context/AuthContext';
import { getLeagues, createLeague, getRounds, League, Round } from '../../src/services/api';

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [activeRounds, setActiveRounds] = useState<{ [leagueId: string]: Round | null }>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showProfileZoom, setShowProfileZoom] = useState(false);

  // Create league form - simplified
  const [leagueName, setLeagueName] = useState('');
  const [totalRounds, setTotalRounds] = useState('3');
  const [leagueImage, setLeagueImage] = useState<string | null>(null);

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

  const pickLeagueImage = async () => {
    // Show options: Camera or Gallery
    Alert.alert(
      'Choose Image Source',
      'Select where to get your league image from',
      [
        {
          text: 'Camera',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission needed', 'Camera access is required to take photos');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.5,
              base64: true,
            });
            if (!result.canceled && result.assets[0].base64) {
              const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
              setLeagueImage(base64Image);
            }
          }
        },
        {
          text: 'Photo Library',
          onPress: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.5,
              base64: true,
            });
            if (!result.canceled && result.assets[0].base64) {
              const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
              setLeagueImage(base64Image);
            }
          }
        },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
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
        league_image: leagueImage,
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

  const resetCreateForm = () => {
    setLeagueName('');
    setTotalRounds('3');
    setLeagueImage(null);
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
            {item.league_image ? (
              <Image 
                source={{ uri: item.league_image }} 
                style={styles.leagueIconImage}
              />
            ) : (
              <Ionicons name="trophy" size={24} color="#5A7A6B" />
            )}
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
            <Ionicons name="time-outline" size={16} color="#212F36" />
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
                {member.profile_photo ? (
                  <Image 
                    source={{ uri: member.profile_photo }} 
                    style={styles.memberAvatarImage}
                  />
                ) : (
                  <Text style={styles.memberAvatarText}>
                    {member.username.charAt(0).toUpperCase()}
                  </Text>
                )}
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
      <Ionicons name="musical-notes" size={64} color="#212F36" />
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
          <Text style={styles.username}>{user?.display_name || user?.username}</Text>
          <Text style={styles.activeRoundsSubtitle}>
            {leagues.length} Active League{leagues.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity 
            style={styles.createLeagueButton}
            onPress={() => setShowCreateModal(true)}
          >
            <Ionicons name="add-circle" size={22} color="#5A7A6B" />
            <Text style={styles.createLeagueText}>Create League</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.profileImageContainer}
            onPress={() => router.push('/(tabs)/profile')}
            onLongPress={() => user?.profile_photo && setShowProfileZoom(true)}
            delayLongPress={300}
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
      </View>

      <Text style={styles.sectionTitle}>Your Leagues</Text>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#5A7A6B" />
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

                <Text style={styles.inputLabel}>League Image (Optional)</Text>
                <TouchableOpacity 
                  style={styles.imagePickerButton}
                  onPress={pickLeagueImage}
                >
                  {leagueImage ? (
                    <Image 
                      source={{ uri: leagueImage }} 
                      style={styles.leagueImagePreview}
                    />
                  ) : (
                    <View style={styles.imagePickerPlaceholder}>
                      <Ionicons name="camera-outline" size={32} color="#5A7A6B" />
                      <Text style={styles.imagePickerText}>Tap to add image</Text>
                    </View>
                  )}
                </TouchableOpacity>
                {leagueImage && (
                  <TouchableOpacity 
                    style={styles.removeImageButton}
                    onPress={() => setLeagueImage(null)}
                  >
                    <Ionicons name="trash-outline" size={16} color="#E57373" />
                    <Text style={styles.removeImageText}>Remove Image</Text>
                  </TouchableOpacity>
                )}

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

      {/* Profile Photo Zoom Modal */}
      <Modal
        visible={showProfileZoom}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowProfileZoom(false)}
      >
        <TouchableOpacity 
          style={styles.profileZoomOverlay}
          activeOpacity={1}
          onPress={() => setShowProfileZoom(false)}
        >
          <View style={styles.profileZoomContainer}>
            {user?.profile_photo && (
              <Image 
                source={{ uri: user.profile_photo }} 
                style={styles.profileZoomImage}
                resizeMode="contain"
              />
            )}
          </View>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F0E8',
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
    color: '#6B7A82',
  },
  username: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212F36',
  },
  activeRoundsSubtitle: {
    fontSize: 13,
    color: '#5A7A6B',
    marginTop: 4,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  createLeagueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  createLeagueText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5A7A6B',
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
    backgroundColor: '#212F36',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#1A252B',
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
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#E0D8CC',
  },
  joinButton: {
    borderColor: '#212F36',
    backgroundColor: '#212F36',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212F36',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212F36',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0D8CC',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  leagueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leagueIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F5F0E8',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  leagueIconImage: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  leagueInfo: {
    flex: 1,
    marginLeft: 12,
  },
  leagueName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212F36',
  },
  leagueTheme: {
    fontSize: 14,
    color: '#6B7A82',
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
    color: '#6B7A82',
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
    backgroundColor: 'rgba(90, 122, 107, 0.1)',
  },
  timerLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#212F36',
  },
  timerValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#212F36',
  },
  leagueStats: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0D8CC',
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
    backgroundColor: '#5A7A6B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
  },
  memberAvatarImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  memberAvatarText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  memberAvatarMore: {
    backgroundColor: '#212F36',
  },
  memberAvatarMoreText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#F5F0E8',
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
    gap: 4,
  },
  statText: {
    fontSize: 13,
    color: '#6B7A82',
  },
  codeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    backgroundColor: 'rgba(90, 122, 107, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  codeLabel: {
    fontSize: 12,
    color: '#6B7A82',
    marginRight: 4,
  },
  codeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5A7A6B',
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
    color: '#212F36',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7A82',
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
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: '#E0D8CC',
    borderBottomWidth: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0D8CC',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#212F36',
  },
  modalForm: {
    paddingTop: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7A82',
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: '#F5F0E8',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 52,
    color: '#212F36',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E0D8CC',
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
    backgroundColor: '#F5F0E8',
    borderWidth: 1,
    borderColor: '#E0D8CC',
  },
  timeOptionSelected: {
    backgroundColor: '#212F36',
    borderColor: '#212F36',
  },
  timeOptionText: {
    fontSize: 14,
    color: '#6B7A82',
    fontWeight: '500',
  },
  timeOptionTextSelected: {
    color: '#F5F0E8',
  },
  codeInput: {
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  submitButton: {
    backgroundColor: '#212F36',
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  joinSubmitButton: {
    backgroundColor: '#212F36',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#F5F0E8',
    fontSize: 16,
    fontWeight: '600',
  },
  profileZoomOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileZoomContainer: {
    width: '80%',
    aspectRatio: 1,
    borderRadius: 20,
    overflow: 'hidden',
  },
  profileZoomImage: {
    width: '100%',
    height: '100%',
  },
  imagePickerButton: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    backgroundColor: '#F5F0E8',
    borderWidth: 1,
    borderColor: '#E0D8CC',
    borderStyle: 'dashed',
    overflow: 'hidden',
    marginBottom: 8,
  },
  imagePickerPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  imagePickerText: {
    fontSize: 14,
    color: '#6B7A82',
  },
  leagueImagePreview: {
    width: '100%',
    height: '100%',
  },
  removeImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    marginBottom: 16,
  },
  removeImageText: {
    fontSize: 14,
    color: '#E57373',
  },
});
