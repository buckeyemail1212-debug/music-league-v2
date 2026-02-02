import React, { useState, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { getLeagues, createLeague, joinLeague, League } from '../../src/services/api';

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  // Create league form
  const [leagueName, setLeagueName] = useState('');
  const [leagueTheme, setLeagueTheme] = useState('');
  const [submissionHours, setSubmissionHours] = useState('24');
  const [votingHours, setVotingHours] = useState('24');

  // Time options
  const timeOptions = [
    { label: '1 hr', value: '1' },
    { label: '6 hrs', value: '6' },
    { label: '12 hrs', value: '12' },
    { label: '1 day', value: '24' },
    { label: '3 days', value: '72' },
    { label: '7 days', value: '168' },
  ];

  // Join league form
  const [leagueCode, setLeagueCode] = useState('');

  const fetchLeagues = async () => {
    try {
      const response = await getLeagues();
      setLeagues(response.data);
    } catch (error) {
      console.error('Failed to fetch leagues:', error);
    } finally {
      setLoading(false);
    }
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
    if (!leagueName.trim() || !leagueTheme.trim()) {
      Alert.alert('Error', 'Please fill in league name and theme');
      return;
    }

    setCreating(true);
    try {
      await createLeague({
        name: leagueName.trim(),
        theme: leagueTheme.trim(),
        submission_hours: parseInt(submissionHours) || 24,
        voting_hours: parseInt(votingHours) || 24,
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
    setLeagueTheme('');
    setSubmissionHours('24');
    setVotingHours('24');
  };

  const renderLeagueItem = ({ item }: { item: League }) => (
    <TouchableOpacity
      style={styles.leagueCard}
      onPress={() => router.push(`/league/${item.id}`)}
    >
      <View style={styles.leagueHeader}>
        <View style={styles.leagueIcon}>
          <Ionicons name="trophy" size={24} color="#6366f1" />
        </View>
        <View style={styles.leagueInfo}>
          <Text style={styles.leagueName}>{item.name}</Text>
          <Text style={styles.leagueTheme}>{item.theme}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#666" />
      </View>
      <View style={styles.leagueStats}>
        <View style={styles.stat}>
          <Ionicons name="people" size={16} color="#888" />
          <Text style={styles.statText}>{item.members.length} members</Text>
        </View>
        <View style={styles.stat}>
          <Ionicons name="repeat" size={16} color="#888" />
          <Text style={styles.statText}>Round {item.current_round}</Text>
        </View>
        <View style={styles.codeContainer}>
          <Text style={styles.codeLabel}>Code:</Text>
          <Text style={styles.codeText}>{item.league_code}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="musical-notes" size={80} color="#333" />
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
        </View>
      </View>

      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => setShowCreateModal(true)}
        >
          <Ionicons name="add-circle" size={24} color="#6366f1" />
          <Text style={styles.actionButtonText}>Create League</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.joinButton]}
          onPress={() => setShowJoinModal(true)}
        >
          <Ionicons name="enter" size={24} color="#10b981" />
          <Text style={[styles.actionButtonText, { color: '#10b981' }]}>Join League</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Your Leagues</Text>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
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
                <Ionicons name="close" size={24} color="#888" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalForm}>
                <Text style={styles.inputLabel}>League Name</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g., Friday Night Jams"
                  placeholderTextColor="#666"
                  value={leagueName}
                  onChangeText={setLeagueName}
                />

                <Text style={styles.inputLabel}>Theme / Prompt</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g., Songs that make you dance"
                  placeholderTextColor="#666"
                  value={leagueTheme}
                  onChangeText={setLeagueTheme}
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
                    textContentType="none"
                    keyboardType="default"
                    maxLength={6}
                    selectionColor="#6366f1"
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
    backgroundColor: '#0a0a0a',
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
    color: '#888',
  },
  username: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
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
    backgroundColor: '#1a1a1a',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#6366f1',
  },
  joinButton: {
    borderColor: '#10b981',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6366f1',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
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
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  leagueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leagueIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
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
    color: '#fff',
  },
  leagueTheme: {
    fontSize: 14,
    color: '#888',
    marginTop: 2,
  },
  leagueStats: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
    gap: 4,
  },
  statText: {
    fontSize: 13,
    color: '#888',
  },
  codeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  codeLabel: {
    fontSize: 12,
    color: '#888',
    marginRight: 4,
  },
  codeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6366f1',
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
    color: '#fff',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
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
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  modalForm: {
    paddingTop: 20,
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
  codeInput: {
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  submitButton: {
    backgroundColor: '#6366f1',
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  joinSubmitButton: {
    backgroundColor: '#10b981',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
