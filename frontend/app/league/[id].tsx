import React, { useState, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useAuth } from '../../src/context/AuthContext';
import {
  getLeague,
  getRounds,
  createRound,
  advanceRound,
  League,
  Round,
} from '../../src/services/api';

export default function LeagueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [league, setLeague] = useState<League | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creatingRound, setCreatingRound] = useState(false);

  const fetchData = async () => {
    try {
      const [leagueRes, roundsRes] = await Promise.all([
        getLeague(id!),
        getRounds(id!),
      ]);
      setLeague(leagueRes.data);
      setRounds(roundsRes.data);
    } catch (error: any) {
      console.error('Failed to fetch league:', error);
      Alert.alert('Error', 'Failed to load league details');
    } finally {
      setLoading(false);
    }
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
      await createRound(league.id);
      await fetchData();
      Alert.alert('Success', 'New round started!');
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
            try {
              await advanceRound(roundId);
              await fetchData();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to advance round');
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
    <TouchableOpacity
      style={styles.roundCard}
      onPress={() => router.push(`/round/${item.id}`)}
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

      {isCreator && item.status !== 'completed' && (
        <TouchableOpacity
          style={styles.advanceButton}
          onPress={(e) => {
            e.stopPropagation();
            handleAdvanceRound(item.id, item.status);
          }}
        >
          <Ionicons name="arrow-forward" size={16} color="#6366f1" />
          <Text style={styles.advanceButtonText}>
            Advance to {item.status === 'submission' ? 'Voting' : 'Results'}
          </Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
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
          <Text style={styles.leagueTheme}>{league.theme}</Text>
        </View>
        <TouchableOpacity style={styles.shareButton} onPress={handleShareCode}>
          <Ionicons name="share-outline" size={22} color="#6366f1" />
        </TouchableOpacity>
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

      {isCreator && !activeRound && (
        <TouchableOpacity
          style={[styles.startRoundButton, creatingRound && styles.buttonDisabled]}
          onPress={handleStartRound}
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

      <Text style={styles.sectionTitle}>Rounds</Text>

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
  shareButton: {
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
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
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
    marginTop: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderRadius: 8,
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
});
