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
import { Ionicons } from '@expo/vector-icons';
import { Song, searchSongs, getSongsRadar } from '../services/api';
import {
  LikedSong,
  loadLikedSongs,
  getCachedLikedSongs,
  subscribeLikedSongs,
} from '../utils/likedSongs';
import LikeButton from './LikeButton';
import { PreviewPlayButton } from './PreviewPlayButton';
import { useAuth } from '../context/AuthContext';

type BrowseFilter = 'new' | 'liked';

interface SongListProps {
  onSelectSong: (song: Song) => void;
  songIdPrefix: string;
}

export default function SongList({ onSelectSong, songIdPrefix }: SongListProps) {
  const { user } = useAuth();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Song[]>([]);
  const [radar, setRadar] = useState<Song[]>([]);
  const [searching, setSearching] = useState(false);
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
  // unliked elsewhere in the app. LikeButton owns per-row icon state
  // itself; we only need the list mirror here for the filter.
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
          songId={`${songIdPrefix}-${item.deezer_id}`}
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

  return (
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
  );
}

const styles = StyleSheet.create({
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
});
