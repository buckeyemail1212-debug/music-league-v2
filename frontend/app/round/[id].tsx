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
  Linking,
  ScrollView,
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useAuth } from '../../src/context/AuthContext';
import { PreviewPlayButton, stopAllPreviews } from '../../src/components/PreviewPlayButton';
import AlbumArt from '../../src/components/AlbumArt';
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

  // Audio playback - handled by PreviewPlayButton component

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
  const dataLoaded = useRef(false);

  // Timer
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  // Computed: user's own submission
  const userSubmission = submissions.find(s => s.user_id === user?.id) || null;

  useEffect(() => {
    return () => {
      stopAllPreviews();
    };
  }, []);

  // Stop audio when leaving the screen
  useFocusEffect(
    useCallback(() => {
      return () => {
        stopAllPreviews();
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
    setError(null);
    // Only clear the screen with a spinner on the very first load.
    // On subsequent visits keep the existing data visible while refreshing.
    if (!dataLoaded.current) {
      setLoading(true);
      setRound(null);
    }

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
      dataLoaded.current = true;

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
        <AlbumArt uri={item.song.cover_url} size={60} borderRadius={8} />
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
          <PreviewPlayButton
            previewUrl={item.song.preview_url}
            deezerId={item.song.deezer_id}
            songId={`sub-${item.song.deezer_id}`}
            size={20}
          />
          <View style={styles.serviceButtonsSmall}>
            <Pressable
              style={[styles.serviceButtonSmall, { backgroundColor: '#1DB954' }]}
              onPress={() => openInService(item.song, 'spotify')}
            >
              <FontAwesome name="spotify" size={12} color="#FFFFFF" />
            </Pressable>
            <Pressable
              style={[styles.serviceButtonSmall, { backgroundColor: '#FA243C' }]}
              onPress={() => openInService(item.song, 'apple')}
            >
              <Ionicons name="logo-apple" size={12} color="#FFFFFF" />
            </Pressable>
            <Pressable
              style={[styles.serviceButtonSmall, { backgroundColor: '#FF0000' }]}
              onPress={() => openInService(item.song, 'youtube')}
            >
              <Ionicons name="logo-youtube" size={12} color="#FFFFFF" />
            </Pressable>
          </View>
      </View>
    </View>
  );
  };

  const [rankDropdownOpen, setRankDropdownOpen] = useState<string | null>(null);

  const getRankSuffix = (n: number) => {
    return n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
  };

  // Separate render for locked rankings - uses PreviewPlayButton component
  const renderLockedRankItem = (submission: Submission, rank: number) => {
    return (
      <View key={submission.id} style={styles.votingCard}>
        <AlbumArt uri={submission.song.cover_url} size={48} borderRadius={6} />
        <View style={styles.votingSongInfo}>
          <Text style={styles.songTitle} numberOfLines={1}>{submission.song.title}</Text>
          <Text style={styles.artistName} numberOfLines={1}>{submission.song.artist}</Text>
          <View style={styles.musicLinksSmall}>
            <Pressable style={[styles.musicLinkButtonSmall, { backgroundColor: '#1DB954' }]} onPress={() => openInService(submission.song, 'spotify')}>
              <FontAwesome name="spotify" size={10} color="#FFFFFF" />
            </Pressable>
            <Pressable style={[styles.musicLinkButtonSmall, { backgroundColor: '#FA243C' }]} onPress={() => openInService(submission.song, 'apple')}>
              <Ionicons name="logo-apple" size={10} color="#FFFFFF" />
            </Pressable>
            <Pressable style={[styles.musicLinkButtonSmall, { backgroundColor: '#FF0000' }]} onPress={() => openInService(submission.song, 'youtube')}>
              <Ionicons name="logo-youtube" size={10} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
        <PreviewPlayButton
          previewUrl={submission.song.preview_url}
          deezerId={submission.song.deezer_id}
          songId={`locked-${submission.song.deezer_id}`}
        />
        <View style={styles.rankBadgeVoted}>
          <Text style={styles.rankNumberVoted}>{rank}{getRankSuffix(rank)}</Text>
        </View>
      </View>
    );
  };

  const renderVotingItem = ({ item, index }: { item: Submission }) => {
    const submission = item;
    const otherSubs = submissions.filter(s => s.user_id !== user?.id);
    const numSongs = otherSubs.length;
    const currentRank = rankingSelections[submission.id];
    const isDropdownOpen = rankDropdownOpen === submission.id;

    return (
      <View style={[styles.votingCard, { zIndex: isDropdownOpen ? 999 : 1 }]}>
        <AlbumArt uri={submission.song.cover_url} size={48} borderRadius={6} />
        <View style={styles.votingSongInfo}>
          <Text style={styles.songTitle} numberOfLines={1}>{submission.song.title}</Text>
          <Text style={styles.artistName} numberOfLines={1}>{submission.song.artist}</Text>
          <View style={styles.musicLinksSmall}>
            <Pressable style={[styles.musicLinkButtonSmall, { backgroundColor: '#1DB954' }]} onPress={() => openInService(submission.song, 'spotify')}>
              <FontAwesome name="spotify" size={10} color="#FFFFFF" />
            </Pressable>
            <Pressable style={[styles.musicLinkButtonSmall, { backgroundColor: '#FA243C' }]} onPress={() => openInService(submission.song, 'apple')}>
              <Ionicons name="logo-apple" size={10} color="#FFFFFF" />
            </Pressable>
            <Pressable style={[styles.musicLinkButtonSmall, { backgroundColor: '#FF0000' }]} onPress={() => openInService(submission.song, 'youtube')}>
              <Ionicons name="logo-youtube" size={10} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
        <View style={styles.votingActions}>
          <PreviewPlayButton
            previewUrl={submission.song.preview_url}
            deezerId={submission.song.deezer_id}
            songId={`vote-${submission.song.deezer_id}`}
          />
        </View>
        {!round?.has_user_voted && (
          <View style={styles.rankDropdownContainer}>
            <TouchableOpacity
              style={[styles.rankDropdownButton, currentRank ? styles.rankDropdownButtonSelected : null]}
              onPress={() => setRankDropdownOpen(isDropdownOpen ? null : submission.id)}
            >
              <Text style={[styles.rankDropdownButtonText, currentRank ? styles.rankDropdownButtonTextSelected : null]}>
                {currentRank ? `${currentRank}${getRankSuffix(currentRank)}` : 'Rank'}
              </Text>
              <Ionicons name={isDropdownOpen ? "chevron-up" : "chevron-down"} size={14} color="#7C3AED" />
            </TouchableOpacity>
            {isDropdownOpen && (
              <View style={styles.rankDropdownList}>
                <ScrollView style={styles.rankDropdownScroll} nestedScrollEnabled={true}>
                  {Array.from({ length: numSongs }, (_, i) => i + 1).map((rank) => (
                    <TouchableOpacity
                      key={rank}
                      style={[
                        styles.rankDropdownItem,
                        currentRank === rank && styles.rankDropdownItemSelected
                      ]}
                      onPress={() => {
                        handleRankSelection(submission.id, rank);
                        setRankDropdownOpen(null);
                      }}
                    >
                      <Text style={[
                        styles.rankDropdownItemText,
                        currentRank === rank && styles.rankDropdownItemTextSelected
                      ]}>
                        {`${rank}${getRankSuffix(rank)}`}
                      </Text>
                      {currentRank === rank && (
                        <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        )}
        {round?.has_user_voted && currentRank && (
          <View style={styles.rankBadgeVoted}>
            <Text style={styles.rankNumberVoted}>{currentRank}{getRankSuffix(currentRank)}</Text>
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
        return <Ionicons name="trophy" size={16} color="#FFFFFF" />;
      } else if (isSecond) {
        return <Ionicons name="medal" size={16} color="#B3B3B3" />;
      } else if (isThird) {
        return <Ionicons name="medal" size={16} color="#B3B3B3" />;
      } else {
        return <Text style={styles.rankNumberText}>{item.rank}</Text>;
      }
    };
    
    return (
      <View style={styles.resultCard}>
        <View style={[styles.rankBadge, isFirst && styles.winnerBadge, isSecond && styles.secondBadge, isThird && styles.thirdBadge]}>
          {getBadgeContent()}
        </View>
        <AlbumArt uri={item.song.cover_url} size={48} borderRadius={6} />
        <View style={styles.resultInfo}>
          <Text style={styles.songTitle} numberOfLines={1}>{item.song.title}</Text>
          <Text style={styles.artistName} numberOfLines={1}>{item.song.artist}</Text>
          <Text style={styles.submittedBy}>by {item.username}</Text>
          <View style={styles.musicLinksSmall}>
            <Pressable style={[styles.musicLinkButtonSmall, { backgroundColor: '#1DB954' }]} onPress={() => openInService(item.song, 'spotify')}>
              <FontAwesome name="spotify" size={10} color="#FFFFFF" />
            </Pressable>
            <Pressable style={[styles.musicLinkButtonSmall, { backgroundColor: '#FA243C' }]} onPress={() => openInService(item.song, 'apple')}>
              <Ionicons name="logo-apple" size={10} color="#FFFFFF" />
            </Pressable>
            <Pressable style={[styles.musicLinkButtonSmall, { backgroundColor: '#FF0000' }]} onPress={() => openInService(item.song, 'youtube')}>
              <Ionicons name="logo-youtube" size={10} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
        <PreviewPlayButton
          previewUrl={item.song.preview_url}
          deezerId={item.song.deezer_id}
          songId={`result-${item.song.deezer_id}`}
        />
        <View style={styles.pointsBadge}>
          <Text style={styles.pointsText}>{item.points}</Text>
          <Text style={styles.pointsLabel}>pts</Text>
        </View>
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

  if (error || !round) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color="rgba(255,255,255,0.75)" />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.roundTitle}>Error</Text>
          </View>
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#7C3AED" />
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
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.roundTitle}>Round {round.round_number}</Text>
          <Text style={styles.roundTheme}>{round.theme}</Text>
        </View>
        <View style={[styles.statusPill, {
          backgroundColor: round.status === 'submission' ? 'rgba(124,58,237,0.15)' : round.status === 'voting' ? 'rgba(124,58,237,0.10)' : 'rgba(255,255,255,0.08)',
        }]}>
          <Text style={[styles.statusPillText, {
            color: round.status === 'submission' ? '#A78BFA' : round.status === 'voting' ? 'rgba(167,139,250,0.8)' : '#B3B3B3',
          }]}>
            {round.status.charAt(0).toUpperCase() + round.status.slice(1)}
          </Text>
        </View>
      </View>

      {/* Timer */}
      {round.status !== 'completed' && timeRemaining && (
        <View style={styles.timerContainer}>
          <Ionicons name="time-outline" size={18} color="#FFFFFF" />
          <Text style={styles.timerLabel}>
            {round.status === 'submission' ? 'Submission ends in:' : 'Voting ends in:'}
          </Text>
          <Text style={styles.timerValue}>{timeRemaining}</Text>
        </View>
      )}

      {/* Progress Indicator */}
      {round.status !== 'completed' && round.total_members !== undefined && (
        <View style={styles.progressContainer}>
          <Ionicons name="people" size={16} color="#B3B3B3" />
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
                <Ionicons name="add-circle" size={24} color="#7C3AED" />
                <Text style={styles.submitSongText}>Submit Your Song</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {round.user_submission_locked ? (
                <View style={styles.lockedBanner}>
                  <Ionicons name="lock-closed" size={24} color="#FFFFFF" />
                  <Text style={styles.lockedText}>Your submission is locked in!</Text>
                </View>
              ) : (
                <View style={styles.submittedBanner}>
                  <Ionicons name="checkmark-circle" size={24} color="#FFFFFF" />
                  <Text style={styles.submittedText}>Song submitted! You can still change it.</Text>
                </View>
              )}

              {/* Show user's own submission */}
              <Text style={styles.sectionTitle}>Your Submission</Text>
              {submissions.filter(s => s.user_id === user?.id).map((sub) => (
                <View key={sub.id} style={styles.userSubmissionCard}>
                  <AlbumArt uri={sub.song.cover_url} size={80} borderRadius={8} />
                  <View style={styles.songInfo}>
                    <Text style={styles.songTitle} numberOfLines={1}>{sub.song.title}</Text>
                    <Text style={styles.songArtist} numberOfLines={1}>{sub.song.artist}</Text>
                    <View style={styles.musicLinks}>
                      <Pressable
                        style={[styles.musicLinkButton, { backgroundColor: '#1DB954' }]}
                        onPress={() => openInService(sub.song, 'spotify')}
                      >
                        <FontAwesome name="spotify" size={12} color="#FFFFFF" />
                      </Pressable>
                      <Pressable
                        style={[styles.musicLinkButton, { backgroundColor: '#FA243C' }]}
                        onPress={() => openInService(sub.song, 'apple')}
                      >
                        <Ionicons name="logo-apple" size={12} color="#FFFFFF" />
                      </Pressable>
                      <Pressable
                        style={[styles.musicLinkButton, { backgroundColor: '#FF0000' }]}
                        onPress={() => openInService(sub.song, 'youtube')}
                      >
                        <Ionicons name="logo-youtube" size={12} color="#FFFFFF" />
                      </Pressable>
                    </View>
                  </View>
                  <PreviewPlayButton
                    previewUrl={sub.song.preview_url}
                    deezerId={sub.song.deezer_id}
                    songId={`mysub-${sub.song.deezer_id}`}
                    size={20}
                  />
                </View>
              ))}

              {/* Lock/Change buttons */}
              {!round.user_submission_locked && (
                <View style={styles.submissionButtons}>
                  <TouchableOpacity
                    style={styles.changeSongButton}
                    onPress={() => setShowSongModal(true)}
                  >
                    <Ionicons name="swap-horizontal" size={20} color="#FFFFFF" />
                    <Text style={styles.changeSongText}>Change Song</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.lockSubmissionButton}
                    onPress={handleLockSubmission}
                    disabled={submitting}
                  >
                    <Ionicons name="lock-closed" size={20} color="#FFFFFF" />
                    <Text style={styles.lockSubmissionText}>Lock It In</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Show submission count but not actual songs */}
              <View style={styles.otherSubmissionsInfo}>
                <Ionicons name="people" size={20} color="#B3B3B3" />
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
              <Ionicons name="ban-outline" size={48} color="#7C3AED" />
              <Text style={styles.noSubmissionTitle}>You Cannot Vote</Text>
              <Text style={styles.noSubmissionText}>
                You did not submit a song during the submission phase.
              </Text>
              <Text style={styles.noSubmissionText}>
                Only members who submitted can participate in voting.
              </Text>
              <View style={styles.noSubmissionWarning}>
                <Ionicons name="alert-circle" size={16} color="#7C3AED" />
                <Text style={styles.noSubmissionWarningText}>
                  You will receive 0 points for this round
                </Text>
              </View>
            </View>
          ) : round.user_vote_locked ? (
            // Vote is locked
            <View style={styles.lockedBanner}>
              <Ionicons name="lock-closed" size={24} color="#FFFFFF" />
              <Text style={styles.lockedText}>Your vote is locked in!</Text>
            </View>
          ) : voteSaved ? (
            // Vote saved but not locked - show confirmation
            <View style={styles.voteSavedContainer}>
              <View style={styles.voteSavedBanner}>
                <Ionicons name="checkmark-circle" size={24} color="#FFFFFF" />
                <Text style={styles.voteSavedText}>Vote saved! Ready to lock in?</Text>
              </View>
              <View style={styles.voteActionButtons}>
                <TouchableOpacity
                  style={styles.changeVoteButton}
                  onPress={handleChangeVote}
                >
                  <Ionicons name="create-outline" size={20} color="#7C3AED" />
                  <Text style={styles.changeVoteText}>Change Vote</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.lockVoteButton, votingSubmitting && styles.buttonDisabled]}
                  onPress={handleLockVote}
                  disabled={votingSubmitting}
                >
                  {votingSubmitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="lock-closed" size={20} color="#FFFFFF" />
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
                <Text style={styles.votingInstructionsText}>Rank Songs Below</Text>
              </View>
            </>
          )}

          {/* Show voting list if user has submitted and not locked */}
          {round.has_user_submitted && !round.user_vote_locked && (
            <FlatList
              data={submissions.filter(s => s.user_id !== user?.id)}
              keyExtractor={(item) => item.id}
              renderItem={renderVotingItem}
              contentContainerStyle={styles.votingListContent}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" />
              }
            />
          )}

          {/* Show current rankings if locked */}
          {round.user_vote_locked && (
            <View style={styles.lockedRankingsContainer}>
              <Text style={styles.sectionTitle}>Your Rankings</Text>
              <View style={styles.votingListContent}>
                {submissions.filter(s => s.user_id !== user?.id).sort((a, b) => {
                  const rankA = rankingSelections[a.id] ?? 999;
                  const rankB = rankingSelections[b.id] ?? 999;
                  return rankA - rankB;
                }).map((item, index) => 
                  renderLockedRankItem(item, rankingSelections[item.id] ?? (index + 1))
                )}
              </View>
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
                  <ActivityIndicator color="#FFFFFF" />
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
              <Ionicons name="person-add-outline" size={20} color="#7C3AED" />
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
          {results.winners && results.winners.length > 0 && (
            <View style={[styles.winnerBanner, results.is_tie && styles.tieBanner]}>
              <Ionicons name={results.is_tie ? "ribbon" : "trophy"} size={32} color="#7C3AED" />
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
                        <PreviewPlayButton
                          previewUrl={winner.song.preview_url}
                          deezerId={winner.song.deezer_id}
                          songId={`winner-${winner.song.deezer_id}`}
                          size={14}
                          style={styles.playButtonWinner}
                        />
                      </View>
                    </View>
                  ))
                ) : (
                  <View style={styles.singleWinnerRow}>
                    <View style={styles.singleWinnerText}>
                      <Text style={styles.winnerSong}>{results.winners[0].song.title}</Text>
                      <Text style={styles.winnerUser}>by {results.winners[0].username}</Text>
                    </View>
                    <PreviewPlayButton
                      previewUrl={results.winners[0].song.preview_url}
                      deezerId={results.winners[0].song.deezer_id}
                      songId={`winner-single-${results.winners[0].song.deezer_id}`}
                      size={14}
                      style={styles.playButtonWinner}
                    />
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
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" />
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
            <TouchableOpacity 
              onPress={() => setShowSongModal(false)}
              hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              style={styles.modalCloseButton}
            >
              <Ionicons name="close" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Select a Song</Text>
            <View style={{ width: 44 }} />
          </View>

          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#B3B3B3" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search songs..."
              placeholderTextColor="#B3B3B3"
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
                <Ionicons name="close-circle" size={22} color="#B3B3B3" />
              </TouchableOpacity>
            )}
          </View>

          {searching ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#7C3AED" />
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
                  <AlbumArt uri={item.cover_url} size={48} borderRadius={6} />
                  <View style={styles.searchResultInfo}>
                    <Text style={styles.songTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.artistName} numberOfLines={1}>{item.artist}</Text>
                    <Text style={styles.duration}>{formatDuration(item.duration)}</Text>
                  </View>
                  <View style={styles.searchResultActions}>
                    <PreviewPlayButton
                      previewUrl={item.preview_url}
                      deezerId={item.deezer_id}
                      songId={`search-${item.deezer_id}`}
                    />
                    <View style={styles.serviceButtonsSmall}>
                      <Pressable
                        style={[styles.serviceButtonSmall, { backgroundColor: '#1DB954' }]}
                        onPress={() => openInService(item, 'spotify')}
                      >
                        <FontAwesome name="spotify" size={10} color="#FFFFFF" />
                      </Pressable>
                      <Pressable
                        style={[styles.serviceButtonSmall, { backgroundColor: '#FA243C' }]}
                        onPress={() => openInService(item, 'apple')}
                      >
                        <Ionicons name="logo-apple" size={10} color="#FFFFFF" />
                      </Pressable>
                      <Pressable
                        style={[styles.serviceButtonSmall, { backgroundColor: '#FF0000' }]}
                        onPress={() => openInService(item, 'youtube')}
                      >
                        <Ionicons name="logo-youtube" size={10} color="#FFFFFF" />
                      </Pressable>
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
                    <Ionicons name="search" size={40} color="#B3B3B3" />
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
        <TouchableWithoutFeedback onPress={() => setShowMissingModal(false)}>
          <View style={styles.modalOverlay}>
        <TouchableWithoutFeedback onPress={() => {}}>
          <View style={styles.missingModalContent}>
            <View style={styles.missingModalHeader}>
              <Text style={styles.missingModalTitle}>Members Who Missed Submission</Text>
              <TouchableOpacity onPress={() => setShowMissingModal(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
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
                      <Ionicons name="time-outline" size={16} color="#B3B3B3" />
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
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.grantExtensionText}>Grant 2hr Extension</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {missingUsers.length === 0 && (
                <View style={styles.noMissingUsers}>
                  <Ionicons name="checkmark-circle" size={32} color="#7C3AED" />
                  <Text style={styles.noMissingText}>All members have submitted!</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Confetti — root level so it renders over the full screen */}
      {round.status === 'completed' && results && (
        <View style={styles.confettiContainer} pointerEvents="none">
          <ConfettiCannon
            count={120}
            origin={{ x: Dimensions.get('window').width / 2, y: 0 }}
            autoStart={true}
            fadeOut={true}
            fallSpeed={2500}
            colors={['#7C3AED', '#FFFFFF', '#7C3AED', '#FFFFFF', '#7C3AED']}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  confettiContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
    color: '#B3B3B3',
    textAlign: 'center',
    marginTop: 12,
  },
  retryButton: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
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
  roundTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  roundTheme: {
    fontSize: 14,
    color: '#B3B3B3',
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    backgroundColor: '#7C3AED',
    marginHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 50,
    gap: 8,
  },
  submitSongText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  submittedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#181818',
    marginHorizontal: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 10,
  },
  submittedText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#181818',
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  timerLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  timerValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
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
    color: '#B3B3B3',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B3B3B3',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 100,
  },
  submissionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181818',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  albumCover: {
    width: 56,
    height: 56,
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
    fontWeight: '500',
    color: '#FFFFFF',
  },
  artistName: {
    fontSize: 13,
    color: '#B3B3B3',
    marginTop: 2,
    fontWeight: '400',
  },
  submittedBy: {
    fontSize: 12,
    color: '#6A6A6A',
    marginTop: 4,
  },
  submittedByYou: {
    fontSize: 12,
    color: '#6A6A6A',
    fontStyle: 'italic',
    marginTop: 4,
  },
  duration: {
    fontSize: 11,
    color: '#6A6A6A',
    marginTop: 2,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playingButton: {
    backgroundColor: 'rgba(255,255,255,0.20)',
  },
  musicLinks: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  musicLinkButton: {
    width: 26,
    height: 26,
    borderRadius: 6,
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
    color: '#B3B3B3',
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
    backgroundColor: '#181818',
    borderRadius: 8,
    gap: 10,
  },
  hiddenSubmissionsText: {
    fontSize: 14,
    color: '#B3B3B3',
    flex: 1,
  },
  votingInstructions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#181818',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  votingInstructionsText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
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
    color: '#B3B3B3',
  },
  votingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181818',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    overflow: 'visible',
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  rankNumber: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  rankNumberText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  votingSongInfo: {
    flex: 1,
    marginLeft: 10,
  },
  votingActions: {
    alignItems: 'center',
    gap: 6,
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
    paddingBottom: 34,
    backgroundColor: '#121212',
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  submitVoteButton: {
    backgroundColor: '#7C3AED',
    paddingVertical: 14,
    borderRadius: 50,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  submitVoteText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  lockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#181818',
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
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
    marginBottom: 16,
    gap: 12,
  },
  voteSavedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#181818',
    paddingVertical: 16,
    borderRadius: 8,
    gap: 8,
  },
  voteSavedText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
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
    backgroundColor: '#181818',
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  changeVoteText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#7C3AED',
  },
  lockVoteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7C3AED',
    paddingVertical: 14,
    borderRadius: 50,
    gap: 8,
  },
  lockVoteText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  lockedRankingsContainer: {
    marginTop: 16,
  },
  winnerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181818',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 8,
    gap: 16,
  },
  winnerInfo: {
    flex: 1,
  },
  winnerLabel: {
    fontSize: 12,
    color: '#7C3AED',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  winnerSong: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 4,
  },
  winnerUser: {
    fontSize: 14,
    color: '#B3B3B3',
    marginTop: 2,
  },
  tieBanner: {
    alignItems: 'flex-start',
  },
  tieWinnerItem: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.1)',
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
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181818',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  winnerBadge: {
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
  },
  secondBadge: {
    backgroundColor: 'rgba(148, 163, 184, 0.15)',
  },
  thirdBadge: {
    backgroundColor: 'rgba(205, 127, 50, 0.15)',
  },
  resultInfo: {
    flex: 1,
    marginLeft: 10,
  },
  pointsBadge: {
    backgroundColor: 'rgba(124,58,237,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    alignItems: 'center',
    marginLeft: 8,
  },
  pointsText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7C3AED',
  },
  pointsLabel: {
    fontSize: 10,
    color: 'rgba(124,58,237,0.55)',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#121212',
    paddingTop: Platform.OS === 'ios' ? 55 : 0,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    minHeight: 48,
  },
  modalCloseButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3E3E3E',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 8,
    paddingHorizontal: 16,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    height: 48,
    color: '#FFFFFF',
    fontSize: 16,
  },
  searchResultsList: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181818',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
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
    backgroundColor: '#181818',
    borderRadius: 8,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 16,
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
    backgroundColor: '#181818',
    padding: 14,
    borderRadius: 8,
    gap: 8,
  },
  changeSongText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  lockSubmissionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7C3AED',
    padding: 14,
    borderRadius: 50,
    gap: 8,
  },
  lockSubmissionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  otherSubmissionsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    padding: 14,
    backgroundColor: '#181818',
    borderRadius: 8,
    gap: 8,
  },
  otherSubmissionsText: {
    fontSize: 14,
    color: '#B3B3B3',
  },
  songArtist: {
    fontSize: 13,
    color: '#B3B3B3',
    marginTop: 2,
    fontWeight: '400',
  },
  // Voting UI styles
  rankDropdownContainer: {
    marginLeft: 8,
    zIndex: 100,
    position: 'relative',
  },
  rankDropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#282828',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 4,
    minWidth: 64,
    justifyContent: 'center',
  },
  rankDropdownButtonSelected: {
    backgroundColor: 'rgba(124,58,237,0.15)',
  },
  rankDropdownButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B3B3B3',
  },
  rankDropdownButtonTextSelected: {
    color: '#7C3AED',
  },
  rankDropdownList: {
    position: 'absolute',
    top: 42,
    right: 0,
    backgroundColor: '#282828',
    borderRadius: 8,
    overflow: 'hidden',
    minWidth: 100,
    elevation: 10,
    zIndex: 9999,
  },
  rankDropdownScroll: {
    maxHeight: 220,
  },
  rankDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  rankDropdownItemSelected: {
    backgroundColor: 'rgba(124,58,237,0.12)',
  },
  rankDropdownItemText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  rankDropdownItemTextSelected: {
    color: '#7C3AED',
    fontWeight: '500',
  },
  rankBadgeVoted: {
    marginLeft: 8,
    backgroundColor: 'rgba(124,58,237,0.15)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNumberVoted: {
    fontSize: 13,
    fontWeight: '500',
    color: '#7C3AED',
  },
  votingListContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 100,
  },
  pointsExplanation: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  pointsExplanationText: {
    fontSize: 12,
    color: '#6A6A6A',
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
    fontWeight: '500',
    color: '#FFFFFF',
  },
  noSubmissionText: {
    fontSize: 14,
    color: '#B3B3B3',
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
    backgroundColor: 'rgba(124,58,237,0.12)',
    borderRadius: 8,
  },
  noSubmissionWarningText: {
    fontSize: 13,
    color: '#7C3AED',
    fontWeight: '500',
  },
  reopenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#181818',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  reopenButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7C3AED',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  missingModalContent: {
    backgroundColor: '#181818',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
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
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  missingModalSubtitle: {
    fontSize: 13,
    color: '#B3B3B3',
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
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  missingUserInfo: {
    flex: 1,
  },
  missingUserName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  extensionBadge: {
    fontSize: 11,
    color: '#FFFFFF',
    marginTop: 2,
  },
  extensionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  extensionText: {
    fontSize: 12,
    color: '#FFFFFF',
  },
  grantExtensionButton: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  grantExtensionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  noMissingUsers: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  noMissingText: {
    fontSize: 14,
    color: '#B3B3B3',
  },
});
