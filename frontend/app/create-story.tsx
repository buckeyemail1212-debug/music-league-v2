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

export default function CreateStoryScreen() {
  const router = useRouter();

  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Song[]>([]);
  const [radar, setRadar] = useState<Song[]>([]);
  const [searching, setSearching] = useState(false);
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);

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
    if (!selectedSong || posting) return;
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
    <TouchableOpacity
      style={styles.resultRow}
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
  );

  const showingRadar = query.trim().length === 0;
  const list = showingRadar ? radar : results;
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
          {showingRadar && (
            <Text style={styles.sectionLabel}>NEW THIS WEEK</Text>
          )}
          {searching && results.length === 0 ? (
            <View style={styles.searchingWrap}>
              <Text style={styles.searchingText}>Searching...</Text>
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
        activeOpacity={submitDisabled ? 1 : 0.75}
        onPress={onSubmit}
        disabled={submitDisabled}
      >
        {posting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Ionicons name="arrow-forward" size={24} color="#FFFFFF" />
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
  sectionLabel: {
    color: '#B3B3B3',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    paddingHorizontal: 20,
    marginVertical: 8,
  },
  searchingWrap: {
    alignItems: 'center',
    paddingTop: 24,
  },
  searchingText: { color: '#B3B3B3', fontSize: 14 },

  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    gap: 12,
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
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
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
});
