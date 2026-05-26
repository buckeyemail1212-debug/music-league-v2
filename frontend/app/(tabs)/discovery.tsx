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
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useNavigation } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Song, LikedSong, API_URL, searchSongs } from '../../src/services/api';
import { stopAllPreviews, registerStopHandler } from '../../src/components/PreviewPlayButton';
import { useAuth } from '../../src/context/AuthContext';
import {
  loadLikedSongs as loadBackedLikedSongs,
  toggleLikedSong,
  subscribeLikedSongs,
  getCachedLikedSongs,
} from '../../src/utils/likedSongs';
import { FLOATING_NAV_CLEARANCE } from './_layout';

// Screen-width-dependent sizes (album art, card width, progress track) are
// computed from `useWindowDimensions()` inside the components below so they
// update on rotation and split-view. cardHeight is still seeded from
// Dimensions.get('window').height for a fast first-paint value, then
// corrected by the container's onLayout once measured.
const PAGE_SIZE = 30;

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

// ─── Billboard chart fetcher ──────────────────────────────────────────────────

async function fetchSongsForFilter(label: string, forceFresh = false): Promise<Song[]> {
  const endpoint = FILTER_CHART_ENDPOINT[label] || '/songs/chart/top';
  // Cache-buster guarantees the request never returns a stale OS/CDN-level
  // cached response when the user pulls down to refresh.
  const buster = forceFresh ? `?_=${Date.now()}` : '';
  try {
    const res = await fetch(`${API_URL}/api${endpoint}${buster}`, {
      cache: 'no-store',
      headers: forceFresh
        ? { 'Cache-Control': 'no-cache', Pragma: 'no-cache' }
        : undefined,
    });
    const data = await res.json();
    const raw: Song[] = data.data || data || [];
    if (raw.length > 0) {
      // Fisher-Yates shuffle for genuinely random ordering on every fetch
      const arr = raw.map(s => ({ ...s, cover_url: getHighResCover(s.cover_url ?? '') }));
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
  } catch (e) {
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

  // Live screen width — re-renders on rotation / split-view.
  const { width: screenWidth } = useWindowDimensions();
  const artSize = screenWidth - 60;
  const progressTrackWidth = screenWidth - 48;

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
    <View style={[styles.card, { width: screenWidth, height: cardHeight }]}>

      {/* ── Album art — fills remaining space, tappable for play/pause ── */}
      <TouchableWithoutFeedback onPress={handleArtTap}>
        <View style={styles.artContainer}>
          {coverUri ? (
            <Image
              source={{ uri: coverUri }}
              style={[styles.artImage, { width: artSize, height: artSize }]}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.artImage, styles.artPlaceholder, { width: artSize, height: artSize }]}>
              <Ionicons name="musical-note" size={72} color="rgba(255,255,255,0.15)" />
            </View>
          )}
          <Animated.View
            style={[styles.iconOverlay, { width: artSize, height: artSize, opacity: iconOpacity }]}
          >
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
        <View style={[styles.progressTrack, { width: progressTrackWidth }]}>
          <Animated.View
            style={[styles.progressFill, {
              width: progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, progressTrackWidth],
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
  const { user } = useAuth();
  // Live width drives the skeleton placeholder sizing — keeps the loading
  // state visually centered after rotation / split-view changes.
  const { width: screenWidth } = useWindowDimensions();
  const skeletonArtSize = screenWidth - 60;
  const [selectedFilter, setSelectedFilter] = useState(0);
  const [songs, setSongs]                   = useState<Song[]>([]);
  // isFetching drives the inline loader — never blocks chips or the whole screen
  const [isFetching, setIsFetching]         = useState(true);
  const [loadingMore, setLoadingMore]       = useState(false);
  const [refreshing, setRefreshing]         = useState(false);
  const [likedSongs, setLikedSongs]         = useState<Map<string, LikedSong>>(new Map());
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
  const offsetRef = useRef(0);

  // Session-level seen IDs — cleared on every focus, never cleared on filter switch.
  // Prevents any song from repeating within a single Discover session.
  const seenSongIdsRef = useRef<Set<string>>(new Set());
  const isFocusedRef = useRef<boolean>(false);
  const autoplayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Every setTimeout that could end up starting audio registers here so the
  // focus/blur cleanup can cancel them all at once. This is belt-and-braces
  // protection against a tab switch racing with a queued play.
  const pendingTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const trackTimeout = (handle: ReturnType<typeof setTimeout>) => {
    pendingTimeoutsRef.current.add(handle);
    return handle;
  };
  const clearAllPendingTimeouts = () => {
    for (const t of pendingTimeoutsRef.current) clearTimeout(t);
    pendingTimeoutsRef.current.clear();
  };

  // Track the deezer_id of the currently playing song to prevent audio overlap
  const currentlyPlayingRef = useRef<string | null>(null);

  // Monotonic counter incremented every time we INTEND to stop audio. Each
  // playPreview call captures the value at start and re-checks after every
  // await; if it changes, the in-flight play silently bails and unloads the
  // sound it just created. This closes the createAsync race where blur /
  // chip-tap / fast-scroll ran their stop logic before soundRef was assigned,
  // letting a fresh sound start playing after the cleanup.
  const playGenerationRef = useRef(0);

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
  // Backend-backed via the shared utility. On focus we trigger a refresh;
  // the utility's SWR cache dedupes concurrent reads. A subscriber keeps
  // this screen in sync when a LikeButton elsewhere (round screen, profile
  // tab) flips state without forcing a full refetch.
  const loadLikedSongs = useCallback(async () => {
    if (!user?.id) return;
    try {
      const songs = await loadBackedLikedSongs(user.id);
      setLikedSongs(new Map(songs.map((s) => [String(s.deezer_id), s])));
    } catch {
      /* fall back to whatever's already in state */
    }
  }, [user?.id]);
  useEffect(() => {
    if (!user?.id) return;
    loadLikedSongs();
    const unsub = subscribeLikedSongs(user.id, () => {
      setLikedSongs(new Map(getCachedLikedSongs(user.id).map((s) => [String(s.deezer_id), s])));
    });
    return () => { unsub(); };
  }, [user?.id, loadLikedSongs]);

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
    // Capture the generation at start. If anything bumps the counter before
    // we finish setting up, abandon — including unloading the freshly-created
    // sound so it never plays.
    const gen = ++playGenerationRef.current;
    const isStale = () => gen !== playGenerationRef.current || !isFocusedRef.current;

    await stopAllPreviews();
    await stopSound();
    if (isStale()) return;
    // Claim this song as "currently playing" before we start the slow loads,
    // so the scroll-out check in onViewableItemsChanged can detect when the
    // user scrolls past this card during the createAsync wait.
    currentlyPlayingRef.current = String(song.deezer_id);
    setIsPaused(false);

    const url = await getFreshUrl(song);
    if (!url || isStale()) return;

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });
      if (isStale()) return;

      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true, positionMillis: 0, volume: 1.0 }
      );

      // The createAsync await is the longest one — it's where blur / chip-tap
      // races used to leak audio. If we're stale by the time it resolves,
      // throw the sound away immediately.
      if (isStale()) {
        sound.stopAsync().catch(() => {});
        sound.unloadAsync().catch(() => {});
        return;
      }
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

  // Register discovery stopSound with global audio manager
  useEffect(() => {
    const unregister = registerStopHandler(stopSound);
    return unregister;
  }, [stopSound]);

  // Synchronous "stop everything and invalidate in-flight plays". Bumping the
  // generation counter first is the critical step — even if the async stops
  // below race against a createAsync that's already mid-await, the captured
  // generation inside playPreview won't match and the new sound gets unloaded
  // instead of playing.
  const haltAudio = useCallback(() => {
    playGenerationRef.current++;
    stopAllPreviews();
    stopSound();
  }, [stopSound]);

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

  // ── Focus: reset session state and fetch fresh Top Hits on every visit ────
  useFocusEffect(useCallback(() => {
    isFocusedRef.current = true;
    seenSongIdsRef.current.clear();
    currentlyPlayingRef.current = null;
    setSelectedFilter(0);
    selectedFilterRef.current = 0;
    loadLikedSongs();
    // silent refresh: reset to Top Hits feed but keep existing songs on
    // screen until the new list arrives. fetchSongs's reset path doesn't
    // blank the list — it just swaps via setSongs(next) when data lands.
    fetchSongsRef.current(true, false, true);

    return () => {
      // (1) Mark the screen as unfocused BEFORE anything else so any pending
      //     timeout callback that fires between here and the stop commands
      //     below will early-return.
      isFocusedRef.current = false;
      currentlyPlayingRef.current = null;

      // (2) Halt — bumps the play-generation counter so any in-flight
      //     playPreview bails after its next await instead of assigning a
      //     fresh sound after our stop ran.
      haltAudio();

      // (3) Cancel every pending setTimeout we've registered. This covers
      //     the autoplay-after-fetch, the viewability-triggered preview, and
      //     the post-search preview — nothing can fire after blur.
      clearAllPendingTimeouts();
      if ((onViewableItemsChanged as any)._timer) {
        (onViewableItemsChanged as any)._timer = null;
      }
      autoplayTimeoutRef.current = null;
    };
  }, [haltAudio, loadLikedSongs]));


  useEffect(() => {
    return () => {
      isFocusedRef.current = false;
      currentlyPlayingRef.current = null;
      playGenerationRef.current++;
      stopAllPreviews();
      clearAllPendingTimeouts();
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

    if (reset) {
      if (isRefresh) {
        setRefreshing(true);
      } else if (!silent) {
        // Only mark fetching when we have zero songs to show (initial load).
        // For filter taps / end-reached, keep old songs visible until new ones arrive —
        // prevents the screen going blank.
        if (songsRef.current.length === 0) {
          setIsFetching(true);
        }
      }

      if (!silent) {
        await stopSound();
      }
    } else {
      if (loadingMoreRef.current) return;
      setLoadingMore(true);
    }

    try {
      const fetched = await fetchSongsForFilter(filter.label, isRefresh);

      if (id !== fetchCounterRef.current) {
        return;
      }

      if (fetched.length === 0) {
        setChartError(true);
        return;
      }
      setChartError(false);

      // Filter out songs already shown this session (cross-filter dedup)
      const unique = fetched.filter(s => !seenSongIdsRef.current.has(String(s.deezer_id)));

      // Fisher-Yates shuffle — true randomization so each fetch surfaces a different order
      const shuffled = [...unique];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      // Mark these songs as seen for this session
      shuffled.forEach(s => seenSongIdsRef.current.add(String(s.deezer_id)));

      const next = reset ? shuffled : [...songsRef.current, ...shuffled];
      songsRef.current = next;
      setSongs(next);

      if (reset && !silent) {
        currentIdxRef.current = 0;
        flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
        if (shuffled.length > 0) {
          if (autoplayTimeoutRef.current) {
            clearTimeout(autoplayTimeoutRef.current);
            pendingTimeoutsRef.current.delete(autoplayTimeoutRef.current);
          }
          const h = setTimeout(() => {
            pendingTimeoutsRef.current.delete(h);
            autoplayTimeoutRef.current = null;
            if (!isFocusedRef.current) return;
            if (id === fetchCounterRef.current) playPreviewFnRef.current(shuffled[0]);
          }, 400);
          trackTimeout(h);
          autoplayTimeoutRef.current = h;
        }
      }
    } catch (e) {
    } finally {
      if (id === fetchCounterRef.current) {
        setIsFetching(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, [stopSound]);

  // Keep fetchSongsRef current so useFocusEffect can call it without a dep
  useEffect(() => { fetchSongsRef.current = fetchSongs; }, [fetchSongs]);

  // Filter changes (chip taps) trigger a fresh fetch via onPress — no useEffect needed here

  // ── Tab press reload: tapping the Discover tab while already on it ────────
  // Clear the seen-songs set (so any chart track can re-surface with a fresh
  // shuffle) and refetch. fetchSongs was updated earlier so that on reset it
  // preserves the existing list and skips the loading indicator when songs
  // are already on screen — the current cards stay visible while the new
  // list loads, then get swapped in once it arrives. The list never blanks.
  const navigation = useNavigation();
  useEffect(() => {
    const unsubscribe = (navigation as any).addListener('tabPress', () => {
      if ((navigation as any).isFocused()) {
        seenSongIdsRef.current.clear();
        currentlyPlayingRef.current = null;
        fetchSongsRef.current(true);
      }
    });
    return unsubscribe;
  }, [navigation]);

  // Hard stop on tab blur — fires even when the FocusEffect's cleanup races
  // with the next screen rendering. Anything pending is cancelled here.
  useEffect(() => {
    const unsubBlur = (navigation as any).addListener?.('blur', () => {
      isFocusedRef.current = false;
      currentlyPlayingRef.current = null;
      haltAudio();
      clearAllPendingTimeouts();
    });
    return () => unsubBlur?.();
  }, [navigation, haltAudio]);

  const onRefresh = useCallback(() => {
    seenSongIdsRef.current.clear();
    fetchSongs(true, true);
  }, [fetchSongs]);

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
      const closeH = setTimeout(() => {
        pendingTimeoutsRef.current.delete(closeH);
        if (!isFocusedRef.current) return;
        flatListRef.current?.scrollToOffset({ offset: idx * cardHeightRef.current, animated: false });
        const song = saved[idx];
        if (song) playPreviewFnRef.current(song);
      }, 80);
      trackTimeout(closeH);
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
        const searchH = setTimeout(() => {
          pendingTimeoutsRef.current.delete(searchH);
          if (!isFocusedRef.current) return;
          if (isSearchModeRef.current) playPreviewFnRef.current(results[0]);
        }, 400);
        trackTimeout(searchH);
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
    // First: if the song we're currently playing has dropped out of the
    // viewable set (user scrolled it off-screen but the next card hasn't yet
    // hit the 80% threshold, or list went momentarily empty mid-scroll),
    // stop audio. Per UX spec: audio dies when its card leaves the viewport.
    const playingId = currentlyPlayingRef.current;
    if (playingId) {
      const stillVisible = viewableItems.some(
        (v: any) => String(v.item?.deezer_id ?? '') === playingId
      );
      if (!stillVisible) {
        currentlyPlayingRef.current = null;
        haltAudio();
      }
    }

    if (!viewableItems.length) return;
    const idx: number = viewableItems[0].index ?? 0;
    if (idx === currentIdxRef.current) return;
    currentIdxRef.current = idx;
    const song = songsRef.current[idx];
    if (!song) return;

    const songId = String(song.deezer_id);
    currentlyPlayingRef.current = songId;

    // Stop any playing audio immediately, then start the new song after a
    // short gap. haltAudio bumps the generation counter so a stale in-flight
    // play (from the previous card) won't override this one.
    haltAudio();
    if ((onViewableItemsChanged as any)._timer) {
      clearTimeout((onViewableItemsChanged as any)._timer);
    }
    const viewH = setTimeout(() => {
      pendingTimeoutsRef.current.delete(viewH);
      // Only play if this card is still the visible one and we're still on
      // the Discover tab.
      if (!isFocusedRef.current) return;
      if (currentlyPlayingRef.current === songId) {
        playPreviewFnRef.current(song);
      }
    }, 300);
    trackTimeout(viewH);
    (onViewableItemsChanged as any)._timer = viewH;
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 });

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
    // Stop the currently playing song immediately so audio never lingers while
    // the list animates to the next card.
    currentlyPlayingRef.current = null;
    haltAudio();
    const next = currentIdxRef.current + 1;
    if (next < songsRef.current.length) {
      flatListRef.current?.scrollToOffset({
        offset: next * cardHeightRef.current,
        animated: true,
      });
    }
  }, [haltAudio]);

  const toggleLike = useCallback(async (song: Song) => {
    if (!user?.id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    // The shared utility handles optimistic flip, backend POST/DELETE,
    // and subscriber notifications. The subscriber wired in
    // loadLikedSongs above will push the new state into setLikedSongs
    // so this card re-renders with the heart filled/empty.
    await toggleLikedSong(user.id, song);
  }, [user?.id]);

  const handleEndReached = useCallback(() => {
    if (isSearchModeRef.current) fetchMoreSearch();
    else {
      // Billboard charts have fixed size — cycle back with fresh shuffle
      seenSongIdsRef.current.clear();
      fetchSongs(true);
    }
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

      {/* Feed — always mounted; overlay spinner only when no songs yet */}
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
        ListFooterComponent={null}
      />

      {/* Skeleton placeholder — only while waiting with no songs loaded */}
      {isFetching && songs.length === 0 && !chartError && (
        <View style={[styles.inlineLoader, { height: cardHeight }]} pointerEvents="none">
          <View style={[styles.skeletonArt, { width: skeletonArtSize, height: skeletonArtSize }]} />
          <View style={[styles.skeletonBottom, { width: screenWidth }]}>
            <View style={styles.skeletonTitle} />
            <View style={styles.skeletonArtist} />
            <View style={styles.skeletonProgress} />
            <View style={styles.skeletonServices}>
              <View style={styles.skeletonServiceBtn} />
              <View style={styles.skeletonServiceBtn} />
              <View style={styles.skeletonServiceBtn} />
            </View>
          </View>
        </View>
      )}
      {!isFetching && songs.length === 0 && chartError && (
        <View style={styles.inlineLoader} pointerEvents="none">
          <Text style={{ color: '#B3B3B3', fontSize: 15, textAlign: 'center', paddingHorizontal: 32 }}>
            Charts loading, try again shortly
          </Text>
        </View>
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
                    onPress={() => {
                      // Bump the generation FIRST so any preview currently
                      // mid-createAsync silently unloads its sound rather
                      // than overriding the new fetch's auto-play.
                      haltAudio();
                      setSelectedFilter(i);
                      selectedFilterRef.current = i;
                      seenSongIdsRef.current.clear();
                      currentlyPlayingRef.current = null;
                      fetchSongsRef.current(true);
                    }}
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
  // Skeleton placeholder — absolute overlay so FlatList stays mounted underneath
  inlineLoader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonArt: {
    // width/height set inline from useWindowDimensions
    borderRadius: 12,
    backgroundColor: '#282828',
  },
  skeletonBottom: {
    // width set inline from useWindowDimensions
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
  },
  skeletonTitle: {
    height: 22,
    width: '60%',
    borderRadius: 4,
    backgroundColor: '#282828',
  },
  skeletonArtist: {
    height: 14,
    width: '40%',
    borderRadius: 4,
    backgroundColor: '#1F1F1F',
    marginTop: 10,
  },
  skeletonProgress: {
    height: 3,
    borderRadius: 2,
    backgroundColor: '#1F1F1F',
    marginTop: 20,
  },
  skeletonServices: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  skeletonServiceBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#282828',
  },

  // ── Card ──────────────────────────────────────────────────────────────────
  card: {
    // width set inline from useWindowDimensions; height from cardHeight prop
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
    // width/height set inline from useWindowDimensions
    borderRadius: 12,
  },
  artPlaceholder: {
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOverlay: {
    position: 'absolute',
    // width/height set inline from useWindowDimensions
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Bottom info section ───────────────────────────────────────────────────
  bottomSection: {
    paddingBottom: FLOATING_NAV_CLEARANCE,
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
    // width set inline from useWindowDimensions (screen width − 48)
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
    borderWidth: 0,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  chipActive: {
    borderBottomColor: '#7C3AED',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#B3B3B3',
  },
  chipTextActive: {
    color: '#7C3AED',
    fontWeight: '700',
    fontSize: 14,
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
