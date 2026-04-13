import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  TextInput,
  Linking,
  Dimensions,
  ActivityIndicator,
  Animated,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useNavigation } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Song, API_URL, searchSongs } from '../../src/services/api';
import { stopAllPreviews } from '../../src/components/PreviewPlayButton';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ART_SIZE              = SCREEN_WIDTH - 60;
const LIKED_KEY              = 'liked_songs';
const DISCOVER_LAST_FETCH_KEY = 'discover_last_fetch';
const PAGE_SIZE              = 30;
const ONE_HOUR               = 1 * 60 * 60 * 1000;

// ─── Genre filters ────────────────────────────────────────────────────────────

interface FilterDef {
  label: string;
}

const FILTERS: FilterDef[] = [
  { label: 'Top Hits'   },
  { label: 'Pop'        },
  { label: 'Hip-Hop'    },
  { label: 'R&B'        },
  { label: 'Country'    },
  { label: 'Rock'       },
  { label: 'Electronic' },
  { label: 'Indie'      },
];

// ─── Chart endpoint map ───────────────────────────────────────────────────────

const FILTER_CHART_ENDPOINT: Record<string, string> = {
  'Top Hits':   '/songs/chart/top',
  'Pop':        '/songs/chart/pop',
  'Hip-Hop':    '/songs/chart/hiphop',
  'R&B':        '/songs/chart/rnb',
  'Country':    '/songs/chart/country',
  'Rock':       '/songs/chart/rock',
  'Electronic': '/songs/chart/electronic',
  'Indie':      '/songs/chart/indie',
};

// ─── High-res cover URL helper ────────────────────────────────────────────────
// Deezer returns small images (56x56 or 250x250); swap to 500x500.

function getHighResCover(url: string): string {
  if (!url) return '';
  return url
    .replace('/56x56-',  '/500x500-')
    .replace('/250x250-', '/500x500-')
    .replace('cover_small',  'cover_big')
    .replace('cover_medium', 'cover_big');
}

// ─── Billboard chart fetcher with artist-search fallback ─────────────────────
// Tries the chart endpoint first; falls back to a random artist search if empty.

async function fetchSongsForFilter(label: string): Promise<Song[]> {
  const endpoint = FILTER_CHART_ENDPOINT[label];
  if (endpoint) {
    try {
      const res = await fetch(`${API_URL}/api${endpoint}`);
      if (res.ok) {
        const json = await res.json();
        const songs: Song[] = json.data ?? [];
        if (songs.length > 0) {
          const shuffled = songs
            .map(s => ({ ...s, cover_url: getHighResCover(s.cover_url ?? '') }))
            .sort(() => Math.random() - 0.5);
          return shuffled;
        }
      }
    } catch (e) {
      console.log(`[Discovery] chart endpoint error for "${label}":`, e);
    }
  }
  return [];
}

// ─── Inline search helper ─────────────────────────────────────────────────────
// Used by the search bar — proxies through the backend /songs/search endpoint.

async function searchDeezer(query: string, _offset: number): Promise<Song[]> {
  try {
    const res   = await searchSongs(query);
    const songs: Song[] = res.data?.data ?? [];
    return songs.map(s => ({ ...s, cover_url: getHighResCover(s.cover_url ?? '') }));
  } catch (e) {
    console.log('[Discovery] searchDeezer error:', e);
    return [];
  }
}

// ─── Deezer preview URL cache (3 hr TTL) ──────────────────────────────────────

const urlCache: Record<string, { url: string; ts: number }> = {};
const CACHE_TTL = 3 * 60 * 60 * 1000;

async function getFreshUrl(song: Song): Promise<string | null> {
  const key    = String(song.deezer_id);
  const cached = urlCache[key];
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.url;
  try {
    const res  = await fetch(`https://api.deezer.com/track/${key}`);
    const data = await res.json();
    if (data.preview) {
      urlCache[key] = { url: data.preview, ts: Date.now() };
      return data.preview;
    }
  } catch {}
  return song.preview_url ?? null;
}

// ─── SongCard ─────────────────────────────────────────────────────────────────

interface CardProps {
  song: Song;
  isLiked: boolean;
  cardHeight: number;
  progressAnim: Animated.Value;
  isPaused: boolean;
  onLike: () => void;
  onSkip: () => void;
  onTogglePlayPause: () => void;
}

const SongCard = React.memo(({
  song, isLiked, cardHeight, progressAnim, isPaused,
  onLike, onSkip, onTogglePlayPause,
}: CardProps) => {
  const q    = encodeURIComponent(`${song.title} ${song.artist}`);
  const open = (service: 'spotify' | 'apple' | 'youtube') => {
    const urls: Record<string, string> = {
      spotify: `https://open.spotify.com/search/${q}`,
      apple:   `https://music.apple.com/search?term=${q}`,
      youtube: `https://www.youtube.com/results?search_query=${q}`,
    };
    Linking.openURL(urls[service]);
  };

  const iconOpacity                   = useRef(new Animated.Value(0)).current;
  const [overlayIcon, setOverlayIcon] = useState<'play' | 'pause'>('pause');

  const handleArtTap = () => {
    const newIcon = isPaused ? 'play' : 'pause';
    setOverlayIcon(newIcon);
    iconOpacity.setValue(1);
    Animated.sequence([
      Animated.delay(400),
      Animated.timing(iconOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
    onTogglePlayPause();
  };

  const coverUri = song.cover_url ?? '';

  return (
    <View style={[styles.card, { height: cardHeight }]}>

      {/* ── Album art — fills remaining space, tappable for play/pause ── */}
      <TouchableWithoutFeedback onPress={handleArtTap}>
        <View style={styles.artContainer}>
          {coverUri ? (
            <Image source={{ uri: coverUri }} style={styles.artImage} resizeMode="cover" />
          ) : (
            <View style={[styles.artImage, styles.artPlaceholder]}>
              <Ionicons name="musical-note" size={72} color="rgba(255,255,255,0.15)" />
            </View>
          )}
          <Animated.View style={[styles.iconOverlay, { opacity: iconOpacity }]}>
            <Ionicons name={overlayIcon} size={64} color="rgba(255,255,255,0.9)" />
          </Animated.View>
        </View>
      </TouchableWithoutFeedback>

      {/* ── Bottom info section ── */}
      <View style={styles.bottomSection}>

        {/* Row 1: title + like + skip */}
        <View style={styles.titleRow}>
          <Text style={styles.songTitle} numberOfLines={2}>{song.title}</Text>
          <TouchableOpacity onPress={onLike} style={styles.iconBtn} hitSlop={8}>
            <Ionicons
              name={isLiked ? 'heart' : 'heart-outline'}
              size={28}
              color={isLiked ? '#7C3AED' : '#FFFFFF'}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={onSkip} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="play-skip-forward" size={24} color="#B3B3B3" />
          </TouchableOpacity>
        </View>

        {/* Row 2: artist */}
        <Text style={styles.artistName} numberOfLines={1}>{song.artist}</Text>

        {/* Row 3: progress bar */}
        <View style={styles.progressTrack}>
          <Animated.View
            style={[styles.progressFill, {
              width: progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, SCREEN_WIDTH - 48],
                extrapolate: 'clamp',
              }),
            }]}
          />
        </View>

        {/* Row 4: streaming service buttons */}
        <View style={styles.serviceRow}>
          <TouchableOpacity
            style={[styles.serviceBtn, { backgroundColor: '#1DB954' }]}
            onPress={() => open('spotify')}
          >
            <FontAwesome name="spotify" size={18} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.serviceBtn, { backgroundColor: '#FC3C44' }]}
            onPress={() => open('apple')}
          >
            <Ionicons name="logo-apple" size={18} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.serviceBtn, { backgroundColor: '#FF0000' }]}
            onPress={() => open('youtube')}
          >
            <Ionicons name="logo-youtube" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Preview label */}
        <Text style={styles.previewLabel}>30s preview</Text>
      </View>
    </View>
  );
});

// ─── DiscoverScreen ───────────────────────────────────────────────────────────

export default function DiscoverScreen() {
  const [selectedFilter, setSelectedFilter] = useState(0);
  const [songs, setSongs]                   = useState<Song[]>([]);
  // isFetching drives the inline loader — never blocks chips or the whole screen
  const [isFetching, setIsFetching]         = useState(true);
  const [loadingMore, setLoadingMore]       = useState(false);
  const [refreshing, setRefreshing]         = useState(false);
  const [likedSongs, setLikedSongs]         = useState<Map<string, Song>>(new Map());
  const [isPaused, setIsPaused]             = useState(false);
  const [cardHeight, setCardHeight]         = useState(Dimensions.get('window').height);

  // Search UI state
  const [showSearch, setShowSearch]       = useState(false);
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchLoading, setSearchLoading] = useState(false);

  const [chartError, setChartError]               = useState(false);

  // Chips scroll offset — drives the left fade-in edge
  const [chipsScrollOffset, setChipsScrollOffset] = useState(0);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const searchFade   = useRef(new Animated.Value(0)).current;

  // Core refs
  const soundRef          = useRef<Audio.Sound | null>(null);
  const timerRef          = useRef<NodeJS.Timeout | null>(null);
  const flatListRef       = useRef<FlatList>(null);
  const currentIdxRef     = useRef(0);
  const cardHeightRef     = useRef(Dimensions.get('window').height);
  const songsRef          = useRef<Song[]>([]);
  const selectedFilterRef = useRef(0);
  const loadingMoreRef    = useRef(false);
  const fetchCounterRef   = useRef(0);

  // Infinite scroll
  const offsetRef  = useRef(0);
  const seenIdsRef = useRef(new Set<number>());

  // Search mode
  const isSearchModeRef  = useRef(false);
  const searchQueryRef   = useRef('');
  const searchOffsetRef  = useRef(0);
  const filterSongsRef   = useRef<Song[]>([]);
  const filterIdxRef     = useRef(0);

  useEffect(() => { songsRef.current = songs; }, [songs]);
  useEffect(() => { selectedFilterRef.current = selectedFilter; }, [selectedFilter]);
  useEffect(() => { loadingMoreRef.current = loadingMore; }, [loadingMore]);

  // ── Load liked songs ──────────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(LIKED_KEY).then(raw => {
      if (!raw) return;
      try {
        const arr: Song[] = JSON.parse(raw);
        if (arr.length > 0 && typeof arr[0] === 'object') {
          setLikedSongs(new Map(arr.map(s => [String(s.deezer_id), s])));
        }
      } catch {}
    });
  }, []);

  // ── Audio helpers ─────────────────────────────────────────────────────────
  const stopSound = useCallback(async () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (soundRef.current) {
      try { await soundRef.current.stopAsync();   } catch {}
      try { await soundRef.current.unloadAsync(); } catch {}
      soundRef.current = null;
    }
    progressAnim.setValue(0);
    setIsPaused(false);
  }, [progressAnim]);

  const playPreviewFnRef  = useRef<(song: Song) => Promise<void>>(async () => {});
  const fetchSongsRef     = useRef<(reset: boolean, isRefresh?: boolean, silent?: boolean) => Promise<void>>(async () => {});

  const playPreview = useCallback(async (song: Song) => {
    await stopAllPreviews();
    await stopSound();
    setIsPaused(false);

    const url = await getFreshUrl(song);
    if (!url) return;

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });
      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true, positionMillis: 0, volume: 1.0 }
      );
      soundRef.current = sound;

      timerRef.current = setInterval(async () => {
        if (!soundRef.current) return;
        try {
          const status = await soundRef.current.getStatusAsync();
          if (status.isLoaded) {
            const cap = Math.min(status.durationMillis ?? 30000, 30000);
            progressAnim.setValue(Math.min(status.positionMillis / cap, 1));
            if (status.positionMillis >= 30000) stopSound();
          }
        } catch {}
      }, 250);
    } catch (e) {
      console.error('DiscoverScreen audio error:', e);
    }
  }, [stopSound, progressAnim]);

  useEffect(() => { playPreviewFnRef.current = playPreview; }, [playPreview]);

  // ── Toggle play / pause on tap ────────────────────────────────────────────
  const togglePlayPause = useCallback(async () => {
    if (!soundRef.current) return;
    try {
      const status = await soundRef.current.getStatusAsync();
      if (!status.isLoaded) return;
      if (status.isPlaying) {
        await soundRef.current.pauseAsync();
        setIsPaused(true);
      } else {
        await soundRef.current.playAsync();
        setIsPaused(false);
      }
    } catch {}
  }, []);

  // ── Focus: audio cleanup on blur + 1-hour silent auto-refresh ────────────
  useFocusEffect(useCallback(() => {
    // Auto-refresh in the background if > 1 hour since last fetch.
    // Only runs when songs are already loaded (no spinner shown).
    if (songsRef.current.length > 0) {
      AsyncStorage.getItem(DISCOVER_LAST_FETCH_KEY).then(ts => {
        const age = ts ? Date.now() - Number(ts) : Infinity;
        if (age > ONE_HOUR) {
          fetchSongsRef.current(true, false, true); // silent reset
        }
      }).catch(() => {});
    }

    return () => {
      stopSound();
      stopAllPreviews();
    };
  }, [stopSound]));

  useEffect(() => {
    return () => {
      stopAllPreviews();
      if (timerRef.current) clearInterval(timerRef.current);
      if (soundRef.current) {
        soundRef.current.stopAsync().catch(() => {});
        soundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  // ── Fetch genre feed ──────────────────────────────────────────────────────
  // silent=true: background refresh — no loading indicator, songs not cleared,
  // audio not stopped. Used for the 1-hour auto-refresh.
  const fetchSongs = useCallback(async (reset: boolean, isRefresh = false, silent = false) => {
    if (isSearchModeRef.current) return;
    const id     = ++fetchCounterRef.current;
    const filter = FILTERS[selectedFilterRef.current];
    console.log(`[Discovery] fetchSongs called — filter: "${filter.label}", reset: ${reset}, silent: ${silent}, id: ${id}`);

    if (reset) {
      seenIdsRef.current.clear();

      if (isRefresh) {
        setRefreshing(true);
      } else if (!silent) {
        setSongs([]);
        songsRef.current = [];
        setIsFetching(true);
      }

      if (!silent) {
        await stopSound();
        currentIdxRef.current = 0;
        flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      }
    } else {
      if (loadingMoreRef.current) return;
      setLoadingMore(true);
    }

    try {
      const fetched = await fetchSongsForFilter(filter.label);

      console.log(`[Discovery] fetched ${fetched.length} songs for "${filter.label}"`);

      if (id !== fetchCounterRef.current) {
        console.log(`[Discovery] fetch ${id} superseded by ${fetchCounterRef.current}, discarding`);
        return;
      }

      if (fetched.length === 0) {
        setChartError(true);
        return;
      }
      setChartError(false);

      // Deduplicate (in case of re-fetch)
      const unique = fetched.filter(s => !seenIdsRef.current.has(s.deezer_id));
      unique.forEach(s => seenIdsRef.current.add(s.deezer_id));

      // Shuffle for TikTok-style variety on every load
      const shuffled = unique.sort(() => Math.random() - 0.5);

      const next = reset ? shuffled : [...songsRef.current, ...shuffled];
      console.log(`[Discovery] setSongs → ${next.length} total songs`);
      songsRef.current = next;
      setSongs(next);

      // Persist fetch timestamp so hourly auto-refresh knows when last fetch occurred
      if (reset) {
        AsyncStorage.setItem(DISCOVER_LAST_FETCH_KEY, String(Date.now())).catch(() => {});
      }

      if (reset && !silent && shuffled.length > 0) {
        setTimeout(() => {
          if (id === fetchCounterRef.current) playPreviewFnRef.current(shuffled[0]);
        }, 400);
      }
    } catch (e) {
      console.error('[Discovery] fetchSongs uncaught error:', e);
    } finally {
      if (id === fetchCounterRef.current) {
        console.log(`[Discovery] fetch ${id} complete — clearing loading flags`);
        setIsFetching(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, [stopSound]);

  // Keep fetchSongsRef current so useFocusEffect can call it without a dep
  useEffect(() => { fetchSongsRef.current = fetchSongs; }, [fetchSongs]);

  useEffect(() => { fetchSongs(true); }, [selectedFilter, fetchSongs]);

  // ── Tab press reload: tapping the Discover tab while already on it ────────
  const navigation = useNavigation();
  useEffect(() => {
    const unsubscribe = (navigation as any).addListener('tabPress', () => {
      if ((navigation as any).isFocused()) {
        fetchSongsRef.current(true);
      }
    });
    return unsubscribe;
  }, [navigation]);

  const onRefresh = useCallback(() => fetchSongs(true, true), [fetchSongs]);

  // ── Inline search ─────────────────────────────────────────────────────────
  const openSearch = useCallback(() => {
    filterSongsRef.current  = [...songsRef.current];
    filterIdxRef.current    = currentIdxRef.current;
    isSearchModeRef.current = true;
    setShowSearch(true);
    Animated.timing(searchFade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [searchFade]);

  const closeSearch = useCallback(() => {
    Animated.timing(searchFade, { toValue: 0, duration: 140, useNativeDriver: true }).start(() => {
      isSearchModeRef.current = false;
      setShowSearch(false);
      setSearchQuery('');
      searchQueryRef.current = '';
      const saved = filterSongsRef.current;
      songsRef.current = saved;
      setSongs(saved);
      const idx = filterIdxRef.current;
      currentIdxRef.current = idx;
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: idx * cardHeightRef.current, animated: false });
        const song = saved[idx];
        if (song) playPreviewFnRef.current(song);
      }, 80);
    });
  }, [searchFade]);

  const handleSearch = useCallback(async () => {
    const q = searchQueryRef.current.trim();
    if (!q) return;
    setSearchLoading(true);
    await stopSound();
    try {
      const results = await searchDeezer(q, 0);
      if (!isSearchModeRef.current) return;
      songsRef.current = results;
      setSongs(results);
      searchOffsetRef.current = PAGE_SIZE;
      currentIdxRef.current   = 0;
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      if (results.length > 0) {
        setTimeout(() => {
          if (isSearchModeRef.current) playPreviewFnRef.current(results[0]);
        }, 400);
      }
    } catch {}
    setSearchLoading(false);
  }, [stopSound]);

  const fetchMoreSearch = useCallback(async () => {
    const q = searchQueryRef.current.trim();
    if (!q || loadingMoreRef.current) return;
    setLoadingMore(true);
    try {
      const results = await searchDeezer(q, searchOffsetRef.current);
      if (!isSearchModeRef.current) return;
      searchOffsetRef.current += PAGE_SIZE;
      const next = [...songsRef.current, ...results];
      songsRef.current = next;
      setSongs(next);
    } catch {}
    setLoadingMore(false);
  }, []);

  // ── FlatList helpers ──────────────────────────────────────────────────────

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (!viewableItems.length) return;
    const idx: number = viewableItems[0].index ?? 0;
    if (idx === currentIdxRef.current) return;
    currentIdxRef.current = idx;
    const song = songsRef.current[idx];
    if (song) playPreviewFnRef.current(song);
  }).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 });

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: cardHeightRef.current,
    offset: cardHeightRef.current * index,
    index,
  }), []);

  const handleLayout = useCallback((e: any) => {
    const h: number = e.nativeEvent.layout.height;
    cardHeightRef.current = h;
    setCardHeight(h);
  }, []);

  const skipToNext = useCallback(() => {
    const next = currentIdxRef.current + 1;
    if (next < songsRef.current.length) {
      flatListRef.current?.scrollToOffset({
        offset: next * cardHeightRef.current,
        animated: true,
      });
    }
  }, []);

  const toggleLike = useCallback(async (song: Song) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const id = String(song.deezer_id);
    setLikedSongs(prev => {
      const next = new Map(prev);
      next.has(id) ? next.delete(id) : next.set(id, song);
      AsyncStorage.setItem(LIKED_KEY, JSON.stringify([...next.values()])).catch(() => {});
      return next;
    });
  }, []);

  const handleEndReached = useCallback(() => {
    if (isSearchModeRef.current) fetchMoreSearch();
    else fetchSongs(false);
  }, [fetchSongs, fetchMoreSearch]);

  const renderItem = useCallback(({ item }: { item: Song }) => (
    <SongCard
      song={item}
      isLiked={likedSongs.has(String(item.deezer_id))}
      cardHeight={cardHeight}
      progressAnim={progressAnim}
      isPaused={isPaused}
      onLike={() => toggleLike(item)}
      onSkip={skipToNext}
      onTogglePlayPause={togglePlayPause}
    />
  ), [likedSongs, cardHeight, progressAnim, isPaused, toggleLike, skipToNext, togglePlayPause]);

  // ── Animated chip / search values ─────────────────────────────────────────
  const chipsOpacity    = searchFade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const searchOpacity   = searchFade;
  const searchTranslate = searchFade.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] });

  // ── Main render ───────────────────────────────────────────────────────────
  // Chips overlay is always rendered (never blocked by loading state).
  return (
    <View style={styles.container} onLayout={handleLayout}>

      {/* Feed or inline loader — chips always stay on top */}
      {isFetching && songs.length === 0 ? (
        <View style={styles.feedLoader}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      ) : !isFetching && songs.length === 0 && chartError ? (
        <View style={styles.feedLoader}>
          <Text style={{ color: '#B3B3B3', fontSize: 15, textAlign: 'center', paddingHorizontal: 32 }}>
            Charts loading, try again shortly
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={songs}
          renderItem={renderItem}
          keyExtractor={item => String(item.deezer_id)}
          pagingEnabled
          snapToAlignment="start"
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig.current}
          getItemLayout={getItemLayout}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#7C3AED"
              colors={['#7C3AED']}
            />
          }
          ListFooterComponent={loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator size="small" color="#7C3AED" />
            </View>
          ) : null}
        />
      )}

      {/* ── Header overlay: filter chips OR inline search bar — always visible ── */}
      <SafeAreaView style={styles.headerOverlay} edges={['top']} pointerEvents="box-none">
        <View style={styles.headerRow} pointerEvents="auto">

          {/* Filter chips (hidden while search is open) */}
          <Animated.View
            style={[styles.chipsWrapper, { opacity: chipsOpacity }]}
            pointerEvents={showSearch ? 'none' : 'auto'}
          >
            <View style={styles.chipsScrollWrapper}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsContent}
                style={styles.chipsScroll}
                onScroll={e => setChipsScrollOffset(e.nativeEvent.contentOffset.x)}
                scrollEventThrottle={16}
              >
                {FILTERS.map((f, i) => (
                  <TouchableOpacity
                    key={f.label}
                    style={[styles.chip, i === selectedFilter && styles.chipActive]}
                    onPress={() => setSelectedFilter(i)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.chipText, i === selectedFilter && styles.chipTextActive]}>
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Right fade */}
              <LinearGradient
                colors={['rgba(18,18,18,0)', 'rgba(18,18,18,1)']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.chipsGradientRight}
                pointerEvents="none"
              />

              {/* Left fade — only visible once the user has scrolled */}
              {chipsScrollOffset > 0 && (
                <LinearGradient
                  colors={['rgba(18,18,18,1)', 'rgba(18,18,18,0)']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.chipsGradientLeft}
                  pointerEvents="none"
                />
              )}
            </View>

            <TouchableOpacity style={styles.searchIconBtn} onPress={openSearch} activeOpacity={0.7}>
              <Ionicons name="search" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </Animated.View>

          {/* Inline search bar */}
          {showSearch && (
            <Animated.View
              style={[
                styles.searchBarRow,
                { opacity: searchOpacity, transform: [{ translateY: searchTranslate }] },
              ]}
              pointerEvents="auto"
            >
              <Ionicons name="search" size={16} color="#B3B3B3" style={styles.searchBarIcon} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={text => {
                  setSearchQuery(text);
                  searchQueryRef.current = text;
                }}
                onSubmitEditing={handleSearch}
                placeholder="Search songs, artists…"
                placeholderTextColor="#6A6A6A"
                returnKeyType="search"
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchLoading && (
                <ActivityIndicator size="small" color="#7C3AED" style={styles.searchSpinner} />
              )}
              <TouchableOpacity style={styles.searchCloseBtn} onPress={closeSearch} activeOpacity={0.7}>
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  // Inline feed loader — chips still render above this via absolute overlay
  feedLoader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Card ──────────────────────────────────────────────────────────────────
  card: {
    width: SCREEN_WIDTH,
    backgroundColor: '#121212',
    flexDirection: 'column',
  },

  // Album art — flex: 1 fills all space above the bottom section
  artContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artImage: {
    width: ART_SIZE,
    height: ART_SIZE,
    borderRadius: 12,
  },
  artPlaceholder: {
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOverlay: {
    position: 'absolute',
    width: ART_SIZE,
    height: ART_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Bottom info section ───────────────────────────────────────────────────
  bottomSection: {
    paddingBottom: 24,
  },

  // Row 1: title + like + skip
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  songTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Row 2: artist
  artistName: {
    fontSize: 16,
    fontWeight: '400',
    color: '#B3B3B3',
    paddingHorizontal: 24,
    marginTop: 4,
  },

  // Row 3: progress bar — full width minus 24px each side
  progressTrack: {
    width: SCREEN_WIDTH - 48,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginTop: 16,
    marginHorizontal: 24,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: '#7C3AED',
  },

  // Row 4: streaming service buttons
  serviceRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    marginTop: 12,
    gap: 10,
  },
  serviceBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Preview label
  previewLabel: {
    fontSize: 11,
    color: '#6A6A6A',
    paddingHorizontal: 24,
    marginTop: 4,
  },

  // ── Header overlay ────────────────────────────────────────────────────────
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  // No background — chips float directly on the #121212 card content
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // ── Filter chips — transparent pills, no container background ─────────────
  chipsWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipsScroll: {
    flex: 1,
  },
  chipsScrollWrapper: {
    flex: 1,
    position: 'relative',
  },
  chipsGradientRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 60,
  },
  chipsGradientLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 20,
  },
  chipsContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 8,
    flexDirection: 'row',
  },
  chip: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 50,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  chipActive: {
    backgroundColor: '#7C3AED',
    borderWidth: 0,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B3B3B3',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  searchIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },

  // ── Search bar ────────────────────────────────────────────────────────────
  searchBarRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  searchBarIcon: {
    marginLeft: 8,
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    height: 36,
    backgroundColor: '#282828',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#FFFFFF',
  },
  searchSpinner: {
    marginHorizontal: 8,
  },
  searchCloseBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
});
