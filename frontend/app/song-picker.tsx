import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Song, searchSongs, getSongsRadar } from '../src/services/api';
import { setPendingSong } from '../src/services/pendingSong';
import { useAuth } from '../src/context/AuthContext';
import {
  LikedSong,
  loadLikedSongs,
  getCachedLikedIds,
  getCachedLikedSongs,
  subscribeLikedSongs,
  toggleLikedSong,
} from '../src/utils/likedSongs';

type BrowseFilter = 'new' | 'liked';

export default function SongPickerScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Song[]>([]);
  const [radar, setRadar] = useState<Song[]>([]);
  const [searching, setSearching] = useState(false);
  const [filter, setFilter] = useState<BrowseFilter>('new');
  const [likedIds, setLikedIds] = useState<Set<string>>(() =>
    user?.id ? getCachedLikedIds(user.id) : new Set(),
  );
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
  // toggling a heart anywhere in the app re-renders this list and the
  // per-row heart icons live. The subscriber returns string deezer ids;
  // we mirror getCachedLikedSongs() into local state so the "Liked
  // Songs" filter sees fresh data without re-querying the cache during
  // render.
  useEffect(() => {
    if (!user?.id) return;
    loadLikedSongs(user.id).catch(() => {});
    const unsub = subscribeLikedSongs(user.id, (ids) => {
      setLikedIds(ids);
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

  const onPickSong = (s: Song) => {
    setPendingSong(s);
    router.back();
  };

  const onToggleLike = (item: Song) => {
    if (!user?.id) return;
    toggleLikedSong(user.id, item as LikedSong).catch(() => {});
  };

  const renderResult = ({ item }: { item: Song }) => {
    const isLiked = likedIds.has(String(item.deezer_id));
    return (
      <View style={styles.resultRow}>
        <TouchableOpacity
          style={styles.resultMain}
          activeOpacity={0.75}
          onPress={() => onPickSong(item)}
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
        <TouchableOpacity
          style={styles.heartBtn}
          activeOpacity={0.7}
          onPress={() => onToggleLike(item)}
          hitSlop={8}
        >
          <Ionicons
            name={isLiked ? 'heart' : 'heart-outline'}
            size={22}
            color={isLiked ? '#7C3AED' : 'rgba(255,255,255,0.7)'}
          />
        </TouchableOpacity>
      </View>
    );
  };

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
  heartBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
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
});
