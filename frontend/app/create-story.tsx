import React, { useEffect, useState } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
  Keyboard,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  Song,
  searchSongs,
  getSongsRadar,
  createStory,
} from '../src/services/api';
import {
  LikedSong,
  loadLikedSongs,
  getCachedLikedSongs,
  subscribeLikedSongs,
} from '../src/utils/likedSongs';
import LikeButton from '../src/components/LikeButton';
import { PreviewPlayButton } from '../src/components/PreviewPlayButton';
import { useAuth } from '../src/context/AuthContext';

type BrowseFilter = 'new' | 'liked';

export default function CreateStoryScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Song[]>([]);
  const [radar, setRadar] = useState<Song[]>([]);
  const [searching, setSearching] = useState(false);
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);
  const [filter, setFilter] = useState<BrowseFilter>('new');
  const [likedList, setLikedList] = useState<LikedSong[]>(() =>
    user?.id ? getCachedLikedSongs(user.id) : [],
  );

  // Radar recommendations — fetched once on mount; cached server-side so
  // this is cheap. Failure is silent (the section just renders empty).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getSongsRadar();
        if (!cancelled) setRadar(res.data.data);
      } catch {
        // Empty radar — non-fatal.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Liked songs: hydrate the shared cache once and stay subscribed so
  // the "Liked Songs" filter list re-renders when songs are liked/
  // unliked elsewhere in the app. LikeButton owns its own icon state.
  useEffect(() => {
    if (!user?.id) return;
    loadLikedSongs(user.id).catch(() => {});
    const unsub = subscribeLikedSongs(user.id, () => {
      setLikedList(getCachedLikedSongs(user.id));
    });
    return unsub;
  }, [user?.id]);

  // Debounced search — only runs when the user actually has a query.
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchSongs(query);
        if (!cancelled) setResults(res.data.data);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  const onSelectSong = (s: Song) => {
    setSelectedSong(s);
    setQuery('');
    setResults([]);
  };

  const onSubmit = async () => {
    if (posting) return;
    if (!selectedSong) {
      Alert.alert('Unable to post', 'Choosing a song is required.');
      return;
    }
    setPosting(true);
    try {
      await createStory({
        song: {
          deezer_id: selectedSong.deezer_id,
          title: selectedSong.title,
          artist: selectedSong.artist,
          cover_url: selectedSong.cover_url,
          preview_url: selectedSong.preview_url,
        },
        photo_url: null,
        caption: caption.trim() || null,
      });
      router.back();
    } catch {
      setPosting(false);
      Alert.alert("Couldn't post your story", 'Please try again.');
    }
  };

  const renderResult = ({ item }: { item: Song }) => (
    <View style={styles.resultRow}>
      <TouchableOpacity
        style={styles.resultMain}
        activeOpacity={0.75}
        onPress={() => onSelectSong(item)}
      >
        {item.cover_url ? (
          <Image source={{ uri: item.cover_url }} style={styles.resultCover} />
        ) : (
          <View style={[styles.resultCover, styles.resultCoverFallback]}>
            <Ionicons name="musical-note" size={20} color="#B3B3B3" />
          </View>
        )}
        <View style={styles.resultText}>
          <Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.resultArtist} numberOfLines={1}>{item.artist}</Text>
        </View>
      </TouchableOpacity>
      <View style={styles.resultActions}>
        <LikeButton song={item as LikedSong} size={22} style={styles.likeBtnSpacing} />
        <PreviewPlayButton
          previewUrl={item.preview_url}
          deezerId={item.deezer_id}
          songId={`createstory-${item.deezer_id}`}
          size={20}
        />
      </View>
    </View>
  );

  const isSearching = query.trim().length > 0;
  const list: Song[] = isSearching
    ? results
    : filter === 'liked'
    ? (likedList as Song[])
    : radar;
  const emptyMessage =
    !isSearching && filter === 'liked' && likedList.length === 0
      ? 'No liked songs yet'
      : null;
  const submitDisabled = !selectedSong || posting;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.closeBtn}
          activeOpacity={0.75}
        >
          <Ionicons name="close" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Music</Text>
        {/* Right-side spacer keeps the title perfectly centered. */}
        <View style={styles.closeBtn} />
      </View>

      {selectedSong ? (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.composerBody}>
            <View style={styles.selectedCard}>
              {selectedSong.cover_url ? (
                <Image source={{ uri: selectedSong.cover_url }} style={styles.selectedCover} />
              ) : (
                <View style={[styles.selectedCover, styles.selectedCoverFallback]}>
                  <Ionicons name="musical-note" size={28} color="#B3B3B3" />
                </View>
              )}
              <View style={styles.selectedText}>
                <Text style={styles.selectedTitle} numberOfLines={1}>{selectedSong.title}</Text>
                <Text style={styles.selectedArtist} numberOfLines={1}>{selectedSong.artist}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedSong(null)} activeOpacity={0.75}>
                <Text style={styles.changeBtnText}>Change</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.captionWrap}>
              <TextInput
                style={styles.captionInput}
                placeholder="Add a caption... (optional)"
                placeholderTextColor="#6A6A6A"
                value={caption}
                onChangeText={setCaption}
                maxLength={200}
                multiline
              />
              <Text style={styles.captionCounter}>{caption.length}/200</Text>
            </View>
          </View>
        </TouchableWithoutFeedback>
      ) : (
        <View style={styles.searchSection}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search for a song..."
            placeholderTextColor="#6A6A6A"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="none"
          />
          <View style={styles.chipRow}>
            <TouchableOpacity
              style={[styles.chip, filter === 'new' && styles.chipActive]}
              activeOpacity={0.8}
              onPress={() => setFilter('new')}
            >
              <Text
                style={[styles.chipLabel, filter === 'new' && styles.chipLabelActive]}
              >
                New This Week
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chip, filter === 'liked' && styles.chipActive]}
              activeOpacity={0.8}
              onPress={() => setFilter('liked')}
            >
              <Text
                style={[styles.chipLabel, filter === 'liked' && styles.chipLabelActive]}
              >
                Liked Songs
              </Text>
            </TouchableOpacity>
          </View>
          {searching && results.length === 0 ? (
            <View style={styles.searchingWrap}>
              <Text style={styles.searchingText}>Searching...</Text>
            </View>
          ) : emptyMessage ? (
            <View style={styles.searchingWrap}>
              <Text style={styles.searchingText}>{emptyMessage}</Text>
            </View>
          ) : (
            <FlatList
              data={list}
              keyExtractor={(item) => String(item.deezer_id)}
              renderItem={renderResult}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </View>
      )}

      <TouchableOpacity
        style={[styles.submitBtn, submitDisabled && styles.submitBtnDisabled]}
        activeOpacity={posting ? 1 : 0.75}
        onPress={onSubmit}
        disabled={posting}
      >
        {posting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Text style={styles.submitBtnLabel}>Post</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
          </>
        )}
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  searchSection: {
    flex: 1,
    paddingTop: 8,
  },
  searchInput: {
    backgroundColor: '#282828',
    color: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  chipActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  chipLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '700',
  },
  chipLabelActive: {
    color: '#FFFFFF',
  },
  searchingWrap: {
    alignItems: 'center',
    paddingTop: 24,
  },
  searchingText: { color: '#B3B3B3', fontSize: 14 },

  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  resultMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  resultActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginLeft: 4,
  },
  // Adds breathing room between the heart and the play button so their
  // hitSlop zones (8px + 14px = 22px combined) can't bleed into each
  // other. 16px gap + 8px marginRight ≈ 24px visible separation.
  likeBtnSpacing: {
    marginRight: 8,
  },
  resultCover: {
    width: 48,
    height: 48,
    borderRadius: 6,
  },
  resultCoverFallback: {
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultText: { flex: 1 },
  resultTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  resultArtist: { color: '#B3B3B3', fontSize: 13, marginTop: 2 },

  composerBody: { flex: 1 },
  selectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 14,
  },
  selectedCover: {
    width: 72,
    height: 72,
    borderRadius: 8,
  },
  selectedCoverFallback: {
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedText: { flex: 1 },
  selectedTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  selectedArtist: { color: '#B3B3B3', fontSize: 13, marginTop: 2 },
  changeBtnText: {
    color: '#7C3AED',
    fontSize: 14,
    fontWeight: '700',
  },

  captionWrap: { marginTop: 16 },
  captionInput: {
    marginHorizontal: 20,
    backgroundColor: '#282828',
    color: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  captionCounter: {
    marginTop: 4,
    marginRight: 20,
    color: '#6A6A6A',
    fontSize: 12,
    textAlign: 'right',
  },

  submitBtn: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    height: 56,
    paddingHorizontal: 22,
    borderRadius: 28,
    backgroundColor: '#7C3AED',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minWidth: 110,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  submitBtnDisabled: {
    backgroundColor: '#3A3A3A',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitBtnLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
