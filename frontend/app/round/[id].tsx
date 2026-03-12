import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  FlatList,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  Image,
  Linking,
  ScrollView,
  Dimensions,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useAuth } from '../../src/context/AuthContext';
import {
  getRound,
  getSubmissions,
  submitSong,
  submitVote,
  getResults,
  searchSongs,
  getMissingSubmissions,
  reopenSubmission,
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
  const [error, setError] = useState<string | null>(null);

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
  const [rankingSelections, setRankingSelections] = useState<{[submissionId: string]: number | null}>({});
  const [votingSubmitting, setVotingSubmitting] = useState(false);
  const [voteSaved, setVoteSaved] = useState(false);  // Vote has been saved but not locked

  // Missing submissions (for league creator)
  const [missingUsers, setMissingUsers] = useState<Array<{
    user_id: string;
    username: string;
    has_extension: boolean;
    extension_deadline: string | null;
  }>>([]);
  const [showMissingModal, setShowMissingModal] = useState(false);
  const [reopeningFor, setReopeningFor] = useState<string | null>(null);
  const [isLeagueCreator, setIsLeagueCreator] = useState(false);

  // Timer
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  // Computed: user's own submission
  const userSubmission = submissions.find(s => s.user_id === user?.id) || null;

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

  // Stop audio when leaving the screen
  useFocusEffect(
    useCallback(() => {
      return () => {
        // Cleanup when screen loses focus
        if (soundRef.current) {
          soundRef.current.stopAsync();
          soundRef.current.unloadAsync();
          setPlayingSongId(null);
        }
      };
    }, [])
  );

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
    // Reset loading state when starting to fetch
    setLoading(true);
    setRound(null);
    setError(null);
    
    // Guard against missing id
    if (!id) {
      setError('No round ID provided');
      setLoading(false);
      return;
    }
    
    try {
      const roundRes = await getRound(id);
      
      if (!roundRes.data) {
        setError('Round data not found');
        setLoading(false);
        return;
      }
      
      setRound(roundRes.data);

      if (roundRes.data.status !== 'completed') {
        const subsRes = await getSubmissions(id);
        setSubmissions(subsRes.data);
        
        // Handle voting phase
        if (roundRes.data.status === 'voting') {
          // Filter out only our own submission (not the 'hidden' ones which are other users' songs)
          const otherSubmissions = subsRes.data.filter(s => s.user_id !== user?.id);
          
          // Initialize ranking selections for dropdown voting
          const initialSelections: {[key: string]: number | null} = {};
          otherSubmissions.forEach(s => {
            initialSelections[s.id] = null;
          });
          setRankingSelections(initialSelections);
          
          if (roundRes.data.has_user_voted) {
            // User has voted - check if locked
            setVoteSaved(true);
            // Try to get existing vote rankings
            try {
              const { getMyVote } = await import('../../src/services/api');
              const voteRes = await getMyVote(id);
              setRankings(voteRes.data.rankings);
              // Update selections based on existing vote
              const updatedSelections: {[key: string]: number | null} = {};
              voteRes.data.rankings.forEach((subId, idx) => {
                updatedSelections[subId] = idx + 1;
              });
              setRankingSelections(updatedSelections);
            } catch {
              // If can't get vote, use current order
              setRankings(otherSubmissions.map(s => s.id));
            }
          } else {
            // User hasn't voted yet
            setVoteSaved(false);
            setRankings(otherSubmissions.map(s => s.id));
          }
          
          // Fetch missing submissions for league creator
          try {
            const missingRes = await getMissingSubmissions(id);
            setMissingUsers(missingRes.data.missing_users);
            // Check if user is league creator (implied by successfully getting this data)
            setIsLeagueCreator(true);
          } catch {
            // Not league creator or no missing users
            setIsLeagueCreator(false);
          }
        }
      } else {
        const resultsRes = await getResults(id);
        setResults(resultsRes.data);
      }
    } catch (error: any) {
      console.error('Failed to fetch round:', error);
      setError('Failed to load round details');
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

  const handleSubmitSong = async (song: Song, locked: boolean = false) => {
    setSubmitting(true);
    try {
      await submitSong(id!, song, locked);
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

  const handleLockSubmission = async () => {
    if (!userSubmission) return;
    
    Alert.alert(
      'Lock Your Submission?',
      'Once locked, you cannot change your song for this round. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Lock It In',
          style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            try {
              await submitSong(id!, userSubmission.song, true);
              await fetchData();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to lock submission');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const handleRankSelection = (submissionId: string, rank: number) => {
    const otherSubmissions = submissions.filter(s => s.user_id !== user?.id);
    const numSongs = otherSubmissions.length;
    
    // Get current rank of this submission
    const currentRank = rankingSelections[submissionId];
    
    // If another song already has this rank, swap them
    const songWithThisRank = Object.entries(rankingSelections).find(
      ([id, r]) => r === rank && id !== submissionId
    );
    
    const newSelections = { ...rankingSelections };
    
    if (songWithThisRank) {
      // Swap ranks
      newSelections[songWithThisRank[0]] = currentRank;
    }
    
    newSelections[submissionId] = rank;
    setRankingSelections(newSelections);
    
    // Update rankings array based on selections
    const sortedEntries = Object.entries(newSelections)
      .filter(([_, r]) => r !== null)
      .sort((a, b) => (a[1] as number) - (b[1] as number));
    
    setRankings(sortedEntries.map(([id]) => id));
  };

  // Check if all ranks are selected
  const allRanksSelected = () => {
    const otherSubmissions = submissions.filter(s => s.user_id !== user?.id);
    const selectedCount = Object.values(rankingSelections).filter(r => r !== null).length;
    return selectedCount === otherSubmissions.length;
  };

  // Handle reopen submission for a user
  const handleReopenSubmission = async (userId: string, username: string) => {
    Alert.alert(
      'Reopen Submission',
      `Grant ${username} a 2-hour window to submit their song?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Grant Extension',
          onPress: async () => {
            setReopeningFor(userId);
            try {
              await reopenSubmission(id!, userId);
              Alert.alert('Success', `${username} has been granted a 2-hour submission window.`);
              // Refresh missing users
              const missingRes = await getMissingSubmissions(id!);
              setMissingUsers(missingRes.data.missing_users);
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to reopen submission');
            } finally {
              setReopeningFor(null);
            }
          },
        },
      ]
    );
  };

  // Save vote (not locked - can be changed)
  const handleSaveVote = async () => {
    if (!allRanksSelected()) {
      Alert.alert('Incomplete', 'Please rank all songs before saving your vote.');
      return;
    }
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
              color={playingSongId === item.song.deezer_id ? '#fff' : '#212F36'}
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

  const renderVotingItem = ({ item, index }: { item: Submission }) => {
    const submission = item;
    const numSongs = submissions.filter(s => s.user_id !== user?.id).length;
    const currentRank = rankingSelections[submission.id];
    
    // Generate rank options (1st, 2nd, 3rd, etc.)
    const getRankLabel = (n: number) => {
      const suffix = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
      const points = numSongs - n + 1; // Points for this position
      return `${n}${suffix} (${points} pts)`;
    };

    return (
      <View style={styles.votingCard}>
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
        </View>
        {!round?.has_user_voted && (
          <View style={styles.rankDropdownContainer}>
            <View style={styles.rankDropdown}>
              {Array.from({ length: numSongs }, (_, i) => i + 1).map((rank) => (
                <TouchableOpacity
                  key={rank}
                  style={[
                    styles.rankOption,
                    currentRank === rank && styles.rankOptionSelected
                  ]}
                  onPress={() => handleRankSelection(submission.id, rank)}
                >
                  <Text style={[
                    styles.rankOptionText,
                    currentRank === rank && styles.rankOptionTextSelected
                  ]}>
                    {rank}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        {round?.has_user_voted && currentRank && (
          <View style={styles.rankBadge}>
            <Text style={styles.rankNumber}>{currentRank}</Text>
          </View>
        )}
      </View>
    );
  };

  const renderResultItem = ({ item, index }: { item: RoundResult['rankings'][0]; index: number }) => {
    const isFirst = item.rank === 1;
    const isSecond = item.rank === 2;
    const isThird = item.rank === 3;
    
    const getBadgeContent = () => {
      if (isFirst) {
        return <Ionicons name="trophy" size={16} color="#fbbf24" />;
      } else if (isSecond) {
        return <Ionicons name="medal" size={16} color="#94a3b8" />;
      } else if (isThird) {
        return <Ionicons name="medal" size={16} color="#cd7f32" />;
      } else {
        return <Text style={styles.rankNumberText}>{item.rank}</Text>;
      }
    };
    
    return (
      <View style={styles.resultCard}>
        <View style={[styles.rankBadge, isFirst && styles.winnerBadge, isSecond && styles.secondBadge, isThird && styles.thirdBadge]}>
          {getBadgeContent()}
        </View>
        <Image source={{ uri: item.song.cover_url }} style={styles.albumCoverSmall} />
        <View style={styles.resultInfo}>
          <Text style={styles.songTitle} numberOfLines={1}>{item.song.title}</Text>
          <Text style={styles.artistName} numberOfLines={1}>{item.song.artist}</Text>
          <Text style={styles.submittedBy}>by {item.username}</Text>
          <View style={styles.musicLinksSmall}>
            <TouchableOpacity style={[styles.musicLinkButtonSmall, { backgroundColor: '#1DB954' }]} onPress={() => openInService(item.song, 'spotify')}>
              <FontAwesome name="spotify" size={10} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.musicLinkButtonSmall, { backgroundColor: '#FA243C' }]} onPress={() => openInService(item.song, 'apple')}>
              <Ionicons name="logo-apple" size={10} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.musicLinkButtonSmall, { backgroundColor: '#FF0000' }]} onPress={() => openInService(item.song, 'youtube')}>
              <Ionicons name="logo-youtube" size={10} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.playButtonSmall, playingSongId === item.song.deezer_id && styles.playingButton]}
          onPress={() => playPreview(item.song)}
        >
          <Ionicons
            name={playingSongId === item.song.deezer_id ? 'pause' : 'play'}
            size={16}
            color={playingSongId === item.song.deezer_id ? '#fff' : '#212F36'}
          />
        </TouchableOpacity>
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
          <ActivityIndicator size="large" color="#5A7A6B" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !round) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.roundTitle}>Error</Text>
          </View>
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#ef4444" />
          <Text style={styles.errorText}>{error || 'Round not found'}</Text>
          <TouchableOpacity 
            style={styles.retryButton} 
            onPress={() => fetchData()}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#212F36" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.roundTitle}>Round {round.round_number}</Text>
          <Text style={styles.roundTheme}>{round.theme}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: round.status === 'submission' ? '#B8C5B0' : round.status === 'voting' ? '#F9FCF2' : '#B8C5B0' }]}>
          <Text style={[styles.statusPillText, { color: round.status === 'voting' ? '#212F36' : '#212F36' }]}>
            {round.status.charAt(0).toUpperCase() + round.status.slice(1)}
          </Text>
        </View>
      </View>

      {/* Timer */}
      {round.status !== 'completed' && timeRemaining && (
        <View style={styles.timerContainer}>
          <Ionicons name="time-outline" size={18} color="#212F36" />
          <Text style={styles.timerLabel}>
            {round.status === 'submission' ? 'Submission ends in:' : 'Voting ends in:'}
          </Text>
          <Text style={styles.timerValue}>{timeRemaining}</Text>
        </View>
      )}

      {/* Progress Indicator */}
      {round.status !== 'completed' && round.total_members !== undefined && (
        <View style={styles.progressContainer}>
          <Ionicons name="people" size={16} color="#888" />
          <Text style={styles.progressText}>
            {round.status === 'submission' 
              ? `${round.submissions_count ?? 0}/${round.total_members} submitted`
              : `${round.votes_count ?? 0}/${round.total_members} voted`
            }
          </Text>
        </View>
      )}

      {/* SUBMISSION PHASE */}
      {round.status === 'submission' && (
        <ScrollView 
          style={styles.submissionScrollView}
          contentContainerStyle={styles.submissionScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {!round.has_user_submitted ? (
            <>
              <TouchableOpacity
                style={styles.submitSongButton}
                onPress={() => setShowSongModal(true)}
              >
                <Ionicons name="add-circle" size={24} color="#212F36" />
                <Text style={styles.submitSongText}>Submit Your Song</Text>
              </TouchableOpacity>
              <View style={styles.hiddenSubmissionsNote}>
                <Ionicons name="eye-off" size={20} color="rgba(141, 161, 155, 0.8)" />
                <Text style={styles.hiddenSubmissionsText}>
                  Other submissions will be visible after you submit your song
                </Text>
              </View>
            </>
          ) : (
            <>
              {round.user_submission_locked ? (
                <View style={styles.lockedBanner}>
                  <Ionicons name="lock-closed" size={24} color="#fff" />
                  <Text style={styles.lockedText}>Your submission is locked in!</Text>
                </View>
              ) : (
                <View style={styles.submittedBanner}>
                  <Ionicons name="checkmark-circle" size={24} color="#fff" />
                  <Text style={styles.submittedText}>Song submitted! You can still change it.</Text>
                </View>
              )}

              {/* Show user's own submission */}
              <Text style={styles.sectionTitle}>Your Submission</Text>
              {submissions.filter(s => s.user_id === user?.id).map((sub) => (
                <View key={sub.id} style={styles.userSubmissionCard}>
                  <Image source={{ uri: sub.song.cover_url }} style={styles.albumCover} />
                  <View style={styles.songInfo}>
                    <Text style={styles.songTitle} numberOfLines={1}>{sub.song.title}</Text>
                    <Text style={styles.songArtist} numberOfLines={1}>{sub.song.artist}</Text>
                    <View style={styles.musicLinks}>
                      <TouchableOpacity
                        style={[styles.musicLinkButton, { backgroundColor: '#1DB954' }]}
                        onPress={() => openInService(sub.song, 'spotify')}
                      >
                        <FontAwesome name="spotify" size={12} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.musicLinkButton, { backgroundColor: '#FA243C' }]}
                        onPress={() => openInService(sub.song, 'apple')}
                      >
                        <Ionicons name="logo-apple" size={12} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.musicLinkButton, { backgroundColor: '#FF0000' }]}
                        onPress={() => openInService(sub.song, 'youtube')}
                      >
                        <Ionicons name="logo-youtube" size={12} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.playButton, playingSongId === sub.song.deezer_id && styles.playingButton]}
                    onPress={() => playPreview(sub.song)}
                  >
                    <Ionicons 
                      name={playingSongId === sub.song.deezer_id ? 'pause' : 'play'} 
                      size={20} 
                      color={playingSongId === sub.song.deezer_id ? '#fff' : '#212F36'}
                    />
                  </TouchableOpacity>
                </View>
              ))}

              {/* Lock/Change buttons */}
              {!round.user_submission_locked && (
                <View style={styles.submissionButtons}>
                  <TouchableOpacity
                    style={styles.changeSongButton}
                    onPress={() => setShowSongModal(true)}
                  >
                    <Ionicons name="swap-horizontal" size={20} color="#212F36" />
                    <Text style={styles.changeSongText}>Change Song</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.lockSubmissionButton}
                    onPress={handleLockSubmission}
                    disabled={submitting}
                  >
                    <Ionicons name="lock-closed" size={20} color="#212F36" />
                    <Text style={styles.lockSubmissionText}>Lock It In</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Show submission count but not actual songs */}
              <View style={styles.otherSubmissionsInfo}>
                <Ionicons name="people" size={20} color="#8DA19B" />
                <Text style={styles.otherSubmissionsText}>
                  {round.submissions_count - 1} other{round.submissions_count - 1 !== 1 ? 's have' : ' has'} submitted
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* VOTING PHASE */}
      {round.status === 'voting' && (
        <>
          {/* Check if user hasn't submitted - they can't vote */}
          {!round.has_user_submitted ? (
            <View style={styles.noSubmissionContainer}>
              <Ionicons name="ban-outline" size={48} color="#E57373" />
              <Text style={styles.noSubmissionTitle}>You Cannot Vote</Text>
              <Text style={styles.noSubmissionText}>
                You did not submit a song during the submission phase.
              </Text>
              <Text style={styles.noSubmissionText}>
                Only members who submitted can participate in voting.
              </Text>
              <View style={styles.noSubmissionWarning}>
                <Ionicons name="alert-circle" size={16} color="#E57373" />
                <Text style={styles.noSubmissionWarningText}>
                  You will receive 0 points for this round
                </Text>
              </View>
            </View>
          ) : round.user_vote_locked ? (
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
                  <Ionicons name="create-outline" size={20} color="#5A7A6B" />
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
                      <Ionicons name="lock-closed" size={20} color="#212F36" />
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
                <Ionicons name="list-outline" size={20} color="#5A7A6B" />
                <Text style={styles.votingInstructionsText}>Tap numbers to rank songs (1 = best)</Text>
              </View>
            </>
          )}

          {/* Show voting list if user has submitted and not locked */}
          {round.has_user_submitted && !round.user_vote_locked && (
            <FlatList
              data={submissions.filter(s => s.user_id !== user?.id)}
              keyExtractor={(item) => item.id}
              renderItem={renderVotingItem}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#B8C5B0" />
              }
            />
          )}

          {/* Show current rankings if locked */}
          {round.user_vote_locked && (
            <View style={styles.lockedRankingsContainer}>
              <Text style={styles.sectionTitle}>Your Rankings</Text>
              <FlatList
                data={submissions.filter(s => s.user_id !== user?.id)}
                keyExtractor={(item) => item.id}
                renderItem={renderVotingItem}
                contentContainerStyle={styles.listContent}
                scrollEnabled={false}
              />
            </View>
          )}

          {/* Save vote button - only show when actively ranking and user has submitted */}
          {round.has_user_submitted && !voteSaved && !round.user_vote_locked && (
            <View style={styles.submitVoteContainer}>
              <TouchableOpacity
                style={[styles.submitVoteButton, (!allRanksSelected() || votingSubmitting) && styles.buttonDisabled]}
                onPress={handleSaveVote}
                disabled={!allRanksSelected() || votingSubmitting}
              >
                {votingSubmitting ? (
                  <ActivityIndicator color="#212F36" />
                ) : (
                  <Text style={styles.submitVoteText}>
                    {allRanksSelected() ? 'Save Vote' : 'Rank All Songs'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* League Creator: Reopen Submission Button */}
          {isLeagueCreator && missingUsers.length > 0 && (
            <TouchableOpacity
              style={styles.reopenButton}
              onPress={() => setShowMissingModal(true)}
            >
              <Ionicons name="person-add-outline" size={20} color="#212F36" />
              <Text style={styles.reopenButtonText}>
                Reopen Submissions ({missingUsers.length} missing)
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* COMPLETED - RESULTS */}
      {round.status === 'completed' && results && (
        <>
          <ConfettiCannon
            count={120}
            origin={{ x: Dimensions.get('window').width / 2, y: -10 }}
            autoStart={true}
            fadeOut={true}
            fallSpeed={2500}
            colors={['#fbbf24', '#5A7A6B', '#B8C5B0', '#ef4444', '#3b82f6']}
          />
          {results.winners && results.winners.length > 0 && (
            <View style={[styles.winnerBanner, results.is_tie && styles.tieBanner]}>
              <Ionicons name={results.is_tie ? "ribbon" : "trophy"} size={32} color="#fbbf24" />
              <View style={styles.winnerInfo}>
                <Text style={styles.winnerLabel}>
                  {results.is_tie ? `It's a Tie! (${results.winners.length} Winners)` : 'Winner'}
                </Text>
                {results.is_tie ? (
                  results.winners.map((winner) => (
                    <View key={winner.submission_id} style={styles.tieWinnerItem}>
                      <View style={styles.tieWinnerRow}>
                        <View style={styles.tieWinnerText}>
                          <Text style={styles.winnerSong}>{winner.song.title}</Text>
                          <Text style={styles.winnerUser}>by {winner.username}</Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.playButtonWinner, playingSongId === winner.song.deezer_id && styles.playingButton]}
                          onPress={() => playPreview(winner.song)}
                        >
                          <Ionicons
                            name={playingSongId === winner.song.deezer_id ? 'pause' : 'play'}
                            size={14}
                            color={playingSongId === winner.song.deezer_id ? '#fff' : '#212F36'}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                ) : (
                  <View style={styles.singleWinnerRow}>
                    <View style={styles.singleWinnerText}>
                      <Text style={styles.winnerSong}>{results.winners[0].song.title}</Text>
                      <Text style={styles.winnerUser}>by {results.winners[0].username}</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.playButtonWinner, playingSongId === results.winners[0].song.deezer_id && styles.playingButton]}
                      onPress={() => playPreview(results.winners[0].song)}
                    >
                      <Ionicons
                        name={playingSongId === results.winners[0].song.deezer_id ? 'pause' : 'play'}
                        size={14}
                        color={playingSongId === results.winners[0].song.deezer_id ? '#fff' : '#212F36'}
                      />
                    </TouchableOpacity>
                  </View>
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
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#B8C5B0" />
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
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowSongModal(false)}>
              <Ionicons name="close" size={28} color="#212F36" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Select a Song</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#6B7A82" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search songs..."
              placeholderTextColor="#8B9A94"
              value={searchQuery}
              onChangeText={handleSearchSongs}
              autoFocus
              autoComplete="off"
              autoCorrect={false}
              textContentType="oneTimeCode"
              importantForAutofill="no"
              spellCheck={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity 
                onPress={() => { setSearchQuery(''); setSearchResults([]); }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close-circle" size={22} color="#6B7A82" />
              </TouchableOpacity>
            )}
          </View>

          {searching ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#5A7A6B" />
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
                  <View style={styles.searchResultActions}>
                    <TouchableOpacity
                      style={[styles.playButtonSmall, playingSongId === item.deezer_id && styles.playingButton]}
                      onPress={() => playPreview(item)}
                    >
                      <Ionicons
                        name={playingSongId === item.deezer_id ? 'pause' : 'play'}
                        size={16}
                        color={playingSongId === item.deezer_id ? '#fff' : '#212F36'}
                      />
                    </TouchableOpacity>
                    <View style={styles.serviceButtonsSmall}>
                      <TouchableOpacity
                        style={[styles.serviceButtonSmall, { backgroundColor: '#1DB954' }]}
                        onPress={() => openInService(item, 'spotify')}
                      >
                        <FontAwesome name="spotify" size={10} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.serviceButtonSmall, { backgroundColor: '#FA243C' }]}
                        onPress={() => openInService(item, 'apple')}
                      >
                        <Ionicons name="logo-apple" size={10} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.serviceButtonSmall, { backgroundColor: '#FF0000' }]}
                        onPress={() => openInService(item, 'youtube')}
                      >
                        <Ionicons name="logo-youtube" size={10} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
              contentContainerStyle={styles.searchResultsList}
              keyboardShouldPersistTaps="handled"
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
        </TouchableWithoutFeedback>
      </Modal>

      {/* Missing Submissions Modal (for League Creator) */}
      <Modal
        visible={showMissingModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowMissingModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.missingModalContent}>
            <View style={styles.missingModalHeader}>
              <Text style={styles.missingModalTitle}>Members Who Missed Submission</Text>
              <TouchableOpacity onPress={() => setShowMissingModal(false)}>
                <Ionicons name="close" size={24} color="#212F36" />
              </TouchableOpacity>
            </View>
            <Text style={styles.missingModalSubtitle}>
              Grant a 2-hour extension window for members who missed the submission deadline.
            </Text>
            <ScrollView style={styles.missingUsersList}>
              {missingUsers.map((missingUser) => (
                <View key={missingUser.user_id} style={styles.missingUserItem}>
                  <View style={styles.missingUserInfo}>
                    <Text style={styles.missingUserName}>{missingUser.username}</Text>
                    {missingUser.has_extension && (
                      <Text style={styles.extensionBadge}>Extension Granted</Text>
                    )}
                  </View>
                  {missingUser.has_extension ? (
                    <View style={styles.extensionInfo}>
                      <Ionicons name="time-outline" size={16} color="#5A7A6B" />
                      <Text style={styles.extensionText}>
                        Expires: {new Date(missingUser.extension_deadline!).toLocaleTimeString()}
                      </Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.grantExtensionButton}
                      onPress={() => handleReopenSubmission(missingUser.user_id, missingUser.username)}
                      disabled={reopeningFor === missingUser.user_id}
                    >
                      {reopeningFor === missingUser.user_id ? (
                        <ActivityIndicator size="small" color="#212F36" />
                      ) : (
                        <Text style={styles.grantExtensionText}>Grant 2hr Extension</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {missingUsers.length === 0 && (
                <View style={styles.noMissingUsers}>
                  <Ionicons name="checkmark-circle" size={32} color="#5A7A6B" />
                  <Text style={styles.noMissingText}>All members have submitted!</Text>
                </View>
              )}
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
    backgroundColor: '#F5F0E8',
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
    gap: 16,
  },
  errorText: {
    fontSize: 16,
    color: '#6B7A82',
    textAlign: 'center',
    marginTop: 12,
  },
  retryButton: {
    backgroundColor: '#B8C5B0',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  retryButtonText: {
    color: '#212F36',
    fontWeight: '600',
    fontSize: 16,
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
    color: '#212F36',
  },
  roundTheme: {
    fontSize: 14,
    color: '#6B7A82',
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#212F36',
  },
  submissionScrollView: {
    flex: 1,
  },
  submissionScrollContent: {
    paddingBottom: 40,
  },
  submitSongButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FCF2',
    marginHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  submitSongText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212F36',
  },
  submittedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(90, 122, 107, 0.15)',
    marginHorizontal: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#5A7A6B',
  },
  submittedText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#5A7A6B',
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#E0D8CC',
  },
  timerLabel: {
    fontSize: 14,
    color: '#212F36',
  },
  timerValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212F36',
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
    color: '#6B7A82',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212F36',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  submissionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E0D8CC',
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
    color: '#212F36',
  },
  artistName: {
    fontSize: 13,
    color: '#6B7A82',
    marginTop: 2,
  },
  submittedBy: {
    fontSize: 12,
    color: '#5A7A6B',
    marginTop: 4,
  },
  submittedByYou: {
    fontSize: 12,
    color: '#6B7A82',
    fontStyle: 'italic',
    marginTop: 4,
  },
  duration: {
    fontSize: 11,
    color: '#8B9A94',
    marginTop: 2,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#B8C5B0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#B8C5B0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playingButton: {
    backgroundColor: '#ef4444',
  },
  musicLinks: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  musicLinkButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  musicLinksSmall: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
  },
  musicLinkButtonSmall: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceButtonsSmall: {
    flexDirection: 'row',
    gap: 4,
  },
  serviceButtonSmall: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
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
    color: '#6B7A82',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E0D8CC',
  },
  hiddenSubmissionsText: {
    fontSize: 14,
    color: '#6B7A82',
    flex: 1,
  },
  votingInstructions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  votingInstructionsText: {
    fontSize: 14,
    color: '#5A7A6B',
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
    color: '#6B7A82',
  },
  votingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E0D8CC',
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
    color: '#212F36',
  },
  rankNumberText: {
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
    backgroundColor: '#F5F0E8',
    borderTopWidth: 1,
    borderTopColor: '#E0D8CC',
  },
  submitVoteButton: {
    backgroundColor: '#212F36',
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
    color: '#F5F0E8',
  },
  lockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5A7A6B',
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 10,
  },
  lockedText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  voteSavedContainer: {
    marginHorizontal: 16,
    marginTop: 12,
    gap: 12,
  },
  voteSavedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(90, 122, 107, 0.15)',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#5A7A6B',
  },
  voteSavedText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#5A7A6B',
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
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#E0D8CC',
  },
  changeVoteText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#5A7A6B',
  },
  lockVoteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#212F36',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  lockVoteText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F5F0E8',
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
    color: '#212F36',
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
  tieWinnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tieWinnerText: {
    flex: 1,
  },
  singleWinnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  singleWinnerText: {
    flex: 1,
  },
  playButtonWinner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#B8C5B0',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E0D8CC',
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
    backgroundColor: '#F9FCF2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  pointsText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#212F36',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F5F0E8',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0D8CC',
    minHeight: 56,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212F36',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 12,
    paddingHorizontal: 16,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    height: 48,
    color: '#212F36',
    fontSize: 16,
  },
  searchResultsList: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E0D8CC',
  },
  searchResultInfo: {
    flex: 1,
    marginLeft: 12,
  },
  searchResultActions: {
    alignItems: 'center',
    gap: 4,
  },
  userSubmissionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#5A7A6B',
  },
  submissionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  changeSongButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#E0D8CC',
  },
  changeSongText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212F36',
  },
  lockSubmissionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#B8C5B0',
    padding: 14,
    borderRadius: 12,
    gap: 8,
  },
  lockSubmissionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212F36',
  },
  otherSubmissionsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#5A7A6B',
  },
  otherSubmissionsText: {
    fontSize: 14,
    color: '#212F36',
  },
  songArtist: {
    fontSize: 13,
    color: '#6B7A82',
    marginTop: 2,
  },
  // New voting UI styles
  rankDropdownContainer: {
    marginLeft: 'auto',
  },
  rankDropdown: {
    flexDirection: 'row',
    gap: 6,
  },
  rankOption: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E0D8CC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rankOptionSelected: {
    backgroundColor: '#B8C5B0',
    borderColor: '#B8C5B0',
  },
  rankOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7A82',
  },
  rankOptionTextSelected: {
    color: '#212F36',
  },
  pointsExplanation: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  pointsExplanationText: {
    fontSize: 12,
    color: '#8B9A94',
    textAlign: 'center',
  },
  noSubmissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  noSubmissionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212F36',
  },
  noSubmissionText: {
    fontSize: 14,
    color: '#6B7A82',
    textAlign: 'center',
    lineHeight: 20,
  },
  noSubmissionWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(229, 115, 115, 0.15)',
    borderRadius: 8,
  },
  noSubmissionWarningText: {
    fontSize: 13,
    color: '#E57373',
    fontWeight: '500',
  },
  reopenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#E0D8CC',
  },
  reopenButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212F36',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  missingModalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  missingModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  missingModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212F36',
  },
  missingModalSubtitle: {
    fontSize: 13,
    color: '#6B7A82',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  missingUsersList: {
    paddingHorizontal: 20,
  },
  missingUserItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E0D8CC',
  },
  missingUserInfo: {
    flex: 1,
  },
  missingUserName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#212F36',
  },
  extensionBadge: {
    fontSize: 11,
    color: '#5A7A6B',
    marginTop: 2,
  },
  extensionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  extensionText: {
    fontSize: 12,
    color: '#5A7A6B',
  },
  grantExtensionButton: {
    backgroundColor: '#B8C5B0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  grantExtensionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#212F36',
  },
  noMissingUsers: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  noMissingText: {
    fontSize: 14,
    color: '#6B7A82',
  },
});
