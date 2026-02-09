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
  Modal,
  TextInput,
  Image,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useAuth } from '../../src/context/AuthContext';
import {
  getRound,
  getSubmissions,
  submitSong,
  submitVote,
  getResults,
  searchSongs,
  Round,
  Submission,
  RoundResult,
  Song,
} from '../../src/services/api';

export default function RoundScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [round, setRound] = useState<Round | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [results, setResults] = useState<RoundResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Song selection
  const [showSongModal, setShowSongModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Song[]>([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Audio playback
  const [playingSongId, setPlayingSongId] = useState<number | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Voting
  const [rankings, setRankings] = useState<string[]>([]);
  const [votingSubmitting, setVotingSubmitting] = useState(false);
  const [voteSaved, setVoteSaved] = useState(false);  // Vote has been saved but not locked

  // Timer
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  useEffect(() => {
    // Configure audio mode
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });

    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  // Timer effect
  useEffect(() => {
    if (!round || round.status === 'completed') return;

    const parseUTCDate = (dateStr: string): Date => {
      // Backend sends UTC time, ensure we parse it correctly
      if (dateStr.endsWith('Z') || dateStr.includes('+')) {
        return new Date(dateStr);
      }
      // Append Z to treat as UTC
      return new Date(dateStr + 'Z');
    };

    const calculateTimeRemaining = () => {
      const now = new Date();
      let endTime: Date;
      
      if (round.status === 'submission' && round.submission_deadline) {
        endTime = parseUTCDate(round.submission_deadline);
      } else if (round.status === 'voting' && round.voting_deadline) {
        endTime = parseUTCDate(round.voting_deadline);
      } else {
        setTimeRemaining('');
        return;
      }

      const diff = endTime.getTime() - now.getTime();
      
      if (diff <= 0) {
        setTimeRemaining('Time expired');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (days > 0) {
        setTimeRemaining(`${days}d ${hours}h ${minutes}m`);
      } else if (hours > 0) {
        setTimeRemaining(`${hours}h ${minutes}m ${seconds}s`);
      } else {
        setTimeRemaining(`${minutes}m ${seconds}s`);
      }
    };

    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 1000);
    return () => clearInterval(interval);
  }, [round]);

  const fetchData = async () => {
    try {
      const roundRes = await getRound(id!);
      setRound(roundRes.data);

      if (roundRes.data.status !== 'completed') {
        const subsRes = await getSubmissions(id!);
        setSubmissions(subsRes.data);
        
        // Handle voting phase
        if (roundRes.data.status === 'voting') {
          // Filter out only our own submission (not the 'hidden' ones which are other users' songs)
          const otherSubmissions = subsRes.data.filter(s => s.user_id !== user?.id);
          
          if (roundRes.data.has_user_voted) {
            // User has voted - check if locked
            setVoteSaved(true);
            // Try to get existing vote rankings
            try {
              const { getMyVote } = await import('../../src/services/api');
              const voteRes = await getMyVote(id!);
              setRankings(voteRes.data.rankings);
            } catch {
              // If can't get vote, use current order
              setRankings(otherSubmissions.map(s => s.id));
            }
          } else {
            // User hasn't voted yet
            setVoteSaved(false);
            setRankings(otherSubmissions.map(s => s.id));
          }
        }
      } else {
        const resultsRes = await getResults(id!);
        setResults(resultsRes.data);
      }
    } catch (error: any) {
      console.error('Failed to fetch round:', error);
      Alert.alert('Error', 'Failed to load round details');
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

  const handleSearchSongs = async (text: string) => {
    setSearchQuery(text);

    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    if (text.length < 2) {
      setSearchResults([]);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await searchSongs(text);
        setSearchResults(response.data.data);
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setSearching(false);
      }
    }, 500);
  };

  const playPreview = async (song: Song) => {
    try {
      // Stop and unload current sound
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      if (playingSongId === song.deezer_id) {
        setPlayingSongId(null);
        return;
      }

      // Create and play new sound
      const { sound } = await Audio.Sound.createAsync(
        { uri: song.preview_url },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      setPlayingSongId(song.deezer_id);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingSongId(null);
        }
      });
    } catch (error) {
      console.error('Failed to play preview:', error);
      setPlayingSongId(null);
    }
  };

  const handleSubmitSong = async (song: Song) => {
    setSubmitting(true);
    try {
      await submitSong(id!, song);
      setShowSongModal(false);
      setSearchQuery('');
      setSearchResults([]);
      await fetchData();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to submit song');
    } finally {
      setSubmitting(false);
    }
  };

  const moveRanking = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= rankings.length) return;

    const newRankings = [...rankings];
    [newRankings[index], newRankings[newIndex]] = [newRankings[newIndex], newRankings[index]];
    setRankings(newRankings);
  };

  // Save vote (not locked - can be changed)
  const handleSaveVote = async () => {
    setVotingSubmitting(true);
    try {
      await submitVote(id!, rankings, false);  // locked = false
      setVoteSaved(true);
      await fetchData();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to save vote');
    } finally {
      setVotingSubmitting(false);
    }
  };

  // Lock in vote (final - cannot be changed)
  const handleLockVote = async () => {
    Alert.alert(
      'Lock In Your Vote',
      'Are you sure? Once locked, you cannot change your vote.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Lock It In',
          onPress: async () => {
            setVotingSubmitting(true);
            try {
              await submitVote(id!, rankings, true);  // locked = true
              await fetchData();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to lock vote');
            } finally {
              setVotingSubmitting(false);
            }
          },
        },
      ]
    );
  };

  // Change vote (go back to editing)
  const handleChangeVote = () => {
    setVoteSaved(false);
  };

  const openInService = (song: Song, service: 'spotify' | 'apple' | 'youtube') => {
    let url = '';
    const query = encodeURIComponent(`${song.title} ${song.artist}`);

    switch (service) {
      case 'spotify':
        url = `https://open.spotify.com/search/${query}`;
        break;
      case 'apple':
        url = `https://music.apple.com/search?term=${query}`;
        break;
      case 'youtube':
        url = `https://www.youtube.com/results?search_query=${query}`;
        break;
    }

    Linking.openURL(url);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderSubmissionItem = ({ item }: { item: Submission }) => {
    const isOwnSubmission = item.user_id === user?.id;
    
    return (
      <View style={styles.submissionCard}>
        <Image source={{ uri: item.song.cover_url }} style={styles.albumCover} />
        <View style={styles.songInfo}>
          <Text style={styles.songTitle} numberOfLines={1}>{item.song.title}</Text>
          <Text style={styles.artistName} numberOfLines={1}>{item.song.artist}</Text>
          {/* During submission: only show "Submitted by you" for own song */}
          {/* During voting/completed: show username for all */}
          {round?.status === 'submission' ? (
            isOwnSubmission && <Text style={styles.submittedByYou}>Submitted by you</Text>
          ) : (
            <Text style={styles.submittedBy}>by {item.username}</Text>
          )}
        </View>
        <View style={styles.submissionActions}>
          <TouchableOpacity
            style={[styles.playButton, playingSongId === item.song.deezer_id && styles.playingButton]}
            onPress={() => playPreview(item.song)}
          >
            <Ionicons
              name={playingSongId === item.song.deezer_id ? 'pause' : 'play'}
              size={20}
              color="#fff"
            />
          </TouchableOpacity>
          <View style={styles.serviceButtonsSmall}>
            <TouchableOpacity
              style={[styles.serviceButtonSmall, { backgroundColor: '#1DB954' }]}
              onPress={() => openInService(item.song, 'spotify')}
            >
              <FontAwesome name="spotify" size={12} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.serviceButtonSmall, { backgroundColor: '#FA243C' }]}
              onPress={() => openInService(item.song, 'apple')}
            >
              <Ionicons name="logo-apple" size={12} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.serviceButtonSmall, { backgroundColor: '#FF0000' }]}
              onPress={() => openInService(item.song, 'youtube')}
            >
              <Ionicons name="logo-youtube" size={12} color="#fff" />
            </TouchableOpacity>
          </View>
      </View>
    </View>
  );
  };

  const renderVotingItem = ({ item, index }: { item: string; index: number }) => {
    const submission = submissions.find(s => s.id === item);
    if (!submission) {
      return <View style={styles.votingCard}><Text style={styles.emptyText}>Loading...</Text></View>;
    }

    return (
      <View style={styles.votingCard}>
        <View style={styles.rankBadge}>
          <Text style={styles.rankNumber}>{index + 1}</Text>
        </View>
        <Image source={{ uri: submission.song.cover_url }} style={styles.albumCoverSmall} />
        <View style={styles.votingSongInfo}>
          <Text style={styles.songTitle} numberOfLines={1}>{submission.song.title}</Text>
          <Text style={styles.artistName} numberOfLines={1}>{submission.song.artist}</Text>
        </View>
        <View style={styles.votingActions}>
          <TouchableOpacity
            style={[styles.playButtonSmall, playingSongId === submission.song.deezer_id && styles.playingButton]}
            onPress={() => playPreview(submission.song)}
          >
            <Ionicons
              name={playingSongId === submission.song.deezer_id ? 'pause' : 'play'}
              size={16}
              color="#fff"
            />
          </TouchableOpacity>
          <View style={styles.serviceButtonsSmall}>
            <TouchableOpacity
              style={[styles.serviceButtonSmall, { backgroundColor: '#1DB954' }]}
              onPress={() => openInService(submission.song, 'spotify')}
            >
              <FontAwesome name="spotify" size={12} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.serviceButtonSmall, { backgroundColor: '#FA243C' }]}
              onPress={() => openInService(submission.song, 'apple')}
            >
              <Ionicons name="logo-apple" size={12} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.serviceButtonSmall, { backgroundColor: '#FF0000' }]}
              onPress={() => openInService(submission.song, 'youtube')}
            >
              <Ionicons name="logo-youtube" size={12} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
        {!round?.has_user_voted && (
          <View style={styles.moveButtons}>
            <TouchableOpacity
              style={[styles.moveButton, index === 0 && styles.moveButtonDisabled]}
              onPress={() => moveRanking(index, 'up')}
              disabled={index === 0}
            >
              <Ionicons name="chevron-up" size={20} color={index === 0 ? '#444' : '#fff'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.moveButton, index === rankings.length - 1 && styles.moveButtonDisabled]}
              onPress={() => moveRanking(index, 'down')}
              disabled={index === rankings.length - 1}
            >
              <Ionicons name="chevron-down" size={20} color={index === rankings.length - 1 ? '#444' : '#fff'} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderResultItem = ({ item, index }: { item: RoundResult['rankings'][0]; index: number }) => {
    // All users with the same rank get the same award
    const isFirst = item.rank === 1;
    const isSecond = item.rank === 2;
    const isThird = item.rank === 3;
    
    // Determine badge icon and color based on rank
    const getBadgeContent = () => {
      if (isFirst) {
        return <Ionicons name="trophy" size={16} color="#fbbf24" />; // Gold
      } else if (isSecond) {
        return <Ionicons name="medal" size={16} color="#94a3b8" />; // Silver
      } else if (isThird) {
        return <Ionicons name="medal" size={16} color="#cd7f32" />; // Bronze
      } else {
        return <Text style={styles.rankNumber}>{item.rank}</Text>;
      }
    };
    
    return (
      <View style={[styles.resultCard, isFirst && styles.winnerCard]}>
        <View style={[styles.rankBadge, isFirst && styles.winnerBadge, isSecond && styles.secondBadge, isThird && styles.thirdBadge]}>
          {getBadgeContent()}
        </View>
        <Image source={{ uri: item.song.cover_url }} style={styles.albumCoverSmall} />
        <View style={styles.resultInfo}>
          <Text style={styles.songTitle} numberOfLines={1}>{item.song.title}</Text>
          <Text style={styles.artistName} numberOfLines={1}>{item.song.artist}</Text>
          <Text style={styles.submittedBy}>by {item.username}</Text>
        </View>
        <View style={styles.pointsBadge}>
          <Text style={styles.pointsText}>{item.points} pts</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      </SafeAreaView>
    );
  }

  if (!round) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Round not found</Text>
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
          <Text style={styles.roundTitle}>Round {round.round_number}</Text>
          <Text style={styles.roundTheme}>{round.theme}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: round.status === 'submission' ? '#10b981' : round.status === 'voting' ? '#f59e0b' : '#6366f1' }]}>
          <Text style={styles.statusPillText}>
            {round.status.charAt(0).toUpperCase() + round.status.slice(1)}
          </Text>
        </View>
      </View>

      {/* Timer */}
      {round.status !== 'completed' && timeRemaining && (
        <View style={styles.timerContainer}>
          <Ionicons name="time-outline" size={18} color="#fff" />
          <Text style={styles.timerLabel}>
            {round.status === 'submission' ? 'Submission ends in:' : 'Voting ends in:'}
          </Text>
          <Text style={styles.timerValue}>{timeRemaining}</Text>
        </View>
      )}

      {/* Progress Indicator */}
      {round.status !== 'completed' && (
        <View style={styles.progressContainer}>
          <Ionicons name="people" size={16} color="#888" />
          <Text style={styles.progressText}>
            {round.status === 'submission' 
              ? `${round.submissions_count}/${round.total_members} submitted`
              : `${round.votes_count || 0}/${round.total_members} voted`
            }
          </Text>
        </View>
      )}

      {/* SUBMISSION PHASE */}
      {round.status === 'submission' && (
        <>
          {!round.has_user_submitted ? (
            <>
              <TouchableOpacity
                style={styles.submitSongButton}
                onPress={() => setShowSongModal(true)}
              >
                <Ionicons name="add-circle" size={24} color="#fff" />
                <Text style={styles.submitSongText}>Submit Your Song</Text>
              </TouchableOpacity>
              <View style={styles.hiddenSubmissionsNote}>
                <Ionicons name="eye-off" size={20} color="#888" />
                <Text style={styles.hiddenSubmissionsText}>
                  Other submissions will be visible after you submit your song
                </Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.submittedBanner}>
                <Ionicons name="checkmark-circle" size={24} color="#fff" />
                <Text style={styles.submittedText}>You've submitted your song!</Text>
              </View>

              <Text style={styles.sectionTitle}>Submissions ({submissions.length})</Text>
              <FlatList
                data={submissions}
                keyExtractor={(item) => item.id}
                renderItem={renderSubmissionItem}
                contentContainerStyle={styles.listContent}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />
                }
                ListEmptyComponent={
                  <View style={styles.emptyState}>
                    <Ionicons name="musical-notes" size={40} color="#333" />
                    <Text style={styles.emptyText}>No submissions yet</Text>
                  </View>
                }
              />
            </>
          )}
        </>
      )}

      {/* VOTING PHASE */}
      {round.status === 'voting' && (
        <>
          {round.user_vote_locked ? (
            // Vote is locked
            <View style={styles.lockedBanner}>
              <Ionicons name="lock-closed" size={24} color="#fff" />
              <Text style={styles.lockedText}>Your vote is locked in!</Text>
            </View>
          ) : voteSaved ? (
            // Vote saved but not locked - show confirmation
            <View style={styles.voteSavedContainer}>
              <View style={styles.voteSavedBanner}>
                <Ionicons name="checkmark-circle" size={24} color="#fff" />
                <Text style={styles.voteSavedText}>Vote saved! Ready to lock in?</Text>
              </View>
              <View style={styles.voteActionButtons}>
                <TouchableOpacity
                  style={styles.changeVoteButton}
                  onPress={handleChangeVote}
                >
                  <Ionicons name="create-outline" size={20} color="#6366f1" />
                  <Text style={styles.changeVoteText}>Change Vote</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.lockVoteButton, votingSubmitting && styles.buttonDisabled]}
                  onPress={handleLockVote}
                  disabled={votingSubmitting}
                >
                  {votingSubmitting ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <>
                      <Ionicons name="lock-closed" size={20} color="#000" />
                      <Text style={styles.lockVoteText}>Lock It In</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            // Still ranking - show instructions
            <>
              <View style={styles.votingInstructions}>
                <Ionicons name="swap-vertical" size={20} color="#6366f1" />
                <Text style={styles.votingInstructionsText}>Rank songs from best to worst</Text>
              </View>
              {round.has_user_submitted && (
                <View style={styles.ownSongNote}>
                  <Ionicons name="information-circle" size={16} color="#888" />
                  <Text style={styles.ownSongNoteText}>Your song is not shown - you cannot vote for yourself</Text>
                </View>
              )}
            </>
          )}

          {/* Show rankings list if not locked */}
          {!round.user_vote_locked && (
            <FlatList
              data={rankings}
              keyExtractor={(item) => item}
              renderItem={renderVotingItem}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />
              }
            />
          )}

          {/* Show current rankings if locked */}
          {round.user_vote_locked && (
            <View style={styles.lockedRankingsContainer}>
              <Text style={styles.sectionTitle}>Your Rankings</Text>
              <FlatList
                data={rankings}
                keyExtractor={(item) => item}
                renderItem={renderVotingItem}
                contentContainerStyle={styles.listContent}
                scrollEnabled={false}
              />
            </View>
          )}

          {/* Save vote button - only show when actively ranking */}
          {!voteSaved && !round.user_vote_locked && (
            <View style={styles.submitVoteContainer}>
              <TouchableOpacity
                style={[styles.submitVoteButton, votingSubmitting && styles.buttonDisabled]}
                onPress={handleSaveVote}
                disabled={votingSubmitting}
              >
                {votingSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitVoteText}>Save Vote</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* COMPLETED - RESULTS */}
      {round.status === 'completed' && results && (
        <>
          {results.winners && results.winners.length > 0 && (
            <View style={[styles.winnerBanner, results.is_tie && styles.tieBanner]}>
              <Ionicons name={results.is_tie ? "ribbon" : "trophy"} size={32} color="#fbbf24" />
              <View style={styles.winnerInfo}>
                <Text style={styles.winnerLabel}>
                  {results.is_tie ? `It's a Tie! (${results.winners.length} Winners)` : 'Winner'}
                </Text>
                {results.is_tie ? (
                  results.winners.map((winner, index) => (
                    <View key={winner.submission_id} style={styles.tieWinnerItem}>
                      <Text style={styles.winnerSong}>{winner.song.title}</Text>
                      <Text style={styles.winnerUser}>by {winner.username}</Text>
                    </View>
                  ))
                ) : (
                  <>
                    <Text style={styles.winnerSong}>{results.winners[0].song.title}</Text>
                    <Text style={styles.winnerUser}>by {results.winners[0].username}</Text>
                  </>
                )}
              </View>
            </View>
          )}

          <Text style={styles.sectionTitle}>Final Rankings</Text>
          <FlatList
            data={results.rankings}
            keyExtractor={(item) => item.submission_id}
            renderItem={renderResultItem}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />
            }
          />
        </>
      )}

      {/* Song Selection Modal */}
      <Modal
        visible={showSongModal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowSongModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowSongModal(false)}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Select a Song</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#888" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search songs..."
              placeholderTextColor="#666"
              value={searchQuery}
              onChangeText={handleSearchSongs}
              autoFocus
              autoComplete="off"
              autoCorrect={false}
              textContentType="none"
              importantForAutofill="no"
              spellCheck={false}
            />
          </View>

          {searching ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#6366f1" />
            </View>
          ) : (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.deezer_id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.searchResultItem}
                  onPress={() => handleSubmitSong(item)}
                  disabled={submitting}
                >
                  <Image source={{ uri: item.cover_url }} style={styles.albumCoverSmall} />
                  <View style={styles.searchResultInfo}>
                    <Text style={styles.songTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.artistName} numberOfLines={1}>{item.artist}</Text>
                    <Text style={styles.duration}>{formatDuration(item.duration)}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.playButtonSmall, playingSongId === item.deezer_id && styles.playingButton]}
                    onPress={() => playPreview(item)}
                  >
                    <Ionicons
                      name={playingSongId === item.deezer_id ? 'pause' : 'play'}
                      size={16}
                      color="#fff"
                    />
                  </TouchableOpacity>
                  <Ionicons name="chevron-forward" size={20} color="#666" />
                </TouchableOpacity>
              )}
              contentContainerStyle={styles.searchResultsList}
              ListEmptyComponent={
                searchQuery.length >= 2 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>No songs found</Text>
                  </View>
                ) : (
                  <View style={styles.emptyState}>
                    <Ionicons name="search" size={40} color="#333" />
                    <Text style={styles.emptyText}>Search for a song to submit</Text>
                  </View>
                )
              }
            />
          )}
        </SafeAreaView>
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
  roundTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  roundTheme: {
    fontSize: 14,
    color: '#888',
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  submitSongButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    marginHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  submitSongText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  submittedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    marginHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#fff',
  },
  submittedText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  timerLabel: {
    fontSize: 14,
    color: '#fff',
  },
  timerValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    gap: 6,
  },
  progressText: {
    fontSize: 13,
    color: '#888',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    paddingHorizontal: 16,
    marginTop: 20,
    marginBottom: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  submissionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  albumCover: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  albumCoverSmall: {
    width: 48,
    height: 48,
    borderRadius: 6,
  },
  songInfo: {
    flex: 1,
    marginLeft: 12,
  },
  songTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  artistName: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  submittedBy: {
    fontSize: 12,
    color: '#6366f1',
    marginTop: 4,
  },
  submittedByYou: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
    marginTop: 4,
  },
  duration: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playingButton: {
    backgroundColor: '#ef4444',
  },
  submissionActions: {
    alignItems: 'center',
    gap: 6,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
    marginTop: 8,
  },
  hiddenSubmissionsNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  hiddenSubmissionsText: {
    fontSize: 14,
    color: '#888',
    flex: 1,
  },
  votingInstructions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    marginHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  votingInstructionsText: {
    fontSize: 14,
    color: '#6366f1',
    fontWeight: '500',
  },
  ownSongNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    gap: 6,
  },
  ownSongNoteText: {
    fontSize: 12,
    color: '#888',
  },
  votingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  rankNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  votingSongInfo: {
    flex: 1,
    marginLeft: 10,
  },
  votingActions: {
    alignItems: 'center',
    gap: 6,
  },
  serviceButtonsSmall: {
    flexDirection: 'row',
    gap: 3,
  },
  serviceButtonSmall: {
    width: 22,
    height: 22,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveButtons: {
    marginLeft: 8,
  },
  moveButton: {
    padding: 4,
  },
  moveButtonDisabled: {
    opacity: 0.3,
  },
  submitVoteContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: '#0a0a0a',
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  submitVoteButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  submitVoteText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  lockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    marginHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#fff',
  },
  lockedText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  voteSavedContainer: {
    marginHorizontal: 16,
    gap: 12,
  },
  voteSavedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#fff',
  },
  voteSavedText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  voteActionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  changeVoteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#6366f1',
  },
  changeVoteText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6366f1',
  },
  lockVoteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  lockVoteText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  lockedRankingsContainer: {
    marginTop: 16,
  },
  winnerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 16,
    gap: 16,
    borderWidth: 1,
    borderColor: '#fbbf24',
  },
  winnerInfo: {
    flex: 1,
  },
  winnerLabel: {
    fontSize: 12,
    color: '#fbbf24',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  winnerSong: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 4,
  },
  winnerUser: {
    fontSize: 14,
    color: '#fbbf24',
    marginTop: 2,
  },
  tieBanner: {
    alignItems: 'flex-start',
  },
  tieWinnerItem: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(251, 191, 36, 0.3)',
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  winnerCard: {
    borderColor: '#fbbf24',
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
  },
  winnerBadge: {
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
  },
  secondBadge: {
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
  },
  thirdBadge: {
    backgroundColor: 'rgba(205, 127, 50, 0.2)',
  },
  resultInfo: {
    flex: 1,
    marginLeft: 10,
  },
  pointsBadge: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  pointsText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 12,
    paddingHorizontal: 16,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    height: 48,
    color: '#fff',
    fontSize: 16,
  },
  searchResultsList: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  searchResultInfo: {
    flex: 1,
    marginLeft: 12,
  },
});
