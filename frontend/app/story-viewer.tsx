import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Pressable,
  PanResponder,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Audio } from 'expo-av';

interface StorySong {
  deezer_id: number;
  title: string;
  artist: string;
  cover_url: string;
  preview_url: string;
}

interface StoryItem {
  id: string;
  song: StorySong;
  photo_url: string | null;
  caption: string | null;
  created_at: string;
  expires_at: string;
}

interface ViewerGroup {
  username: string;
  avatarUrl: string;
  userId: string;
  isOwn: boolean;
  stories: StoryItem[];
}

const STORY_DURATION_MS = 30000;
const SCREEN_HEIGHT = Dimensions.get('window').height;

export default function StoryViewerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    groups?: string;
    startGroupIndex?: string;
  }>();

  // Parse the groups param once; only re-parse if the param string itself
  // changes. Avoids a JSON.parse + new array allocation on every render,
  // which was churning downstream re-renders during mount.
  const groups = useMemo<ViewerGroup[]>(() => {
    try {
      if (params.groups) {
        const parsed = JSON.parse(params.groups);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // fall through to empty
    }
    return [];
  }, [params.groups]);

  // Lazy state initializer — runs only on first mount, so the index math
  // doesn't recompute on every render.
  const [groupIndex, setGroupIndex] = useState(() =>
    Math.max(
      0,
      Math.min(
        parseInt(params.startGroupIndex || '0', 10) || 0,
        Math.max(0, groups.length - 1),
      ),
    ),
  );
  const [storyIndex, setStoryIndex] = useState(0);
  const [restartKey, setRestartKey] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;
  const advanceRef = useRef<() => void>(() => {});
  const dragY = useRef(new Animated.Value(0)).current;
  const soundRef = useRef<Audio.Sound | null>(null);

  // Empty/invalid feed → exit immediately.
  useEffect(() => {
    if (groups.length === 0) {
      router.back();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Set the audio mode once on mount so playback works with the iOS
  // silent switch flipped. Mirrors PreviewPlayButton.tsx's config.
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    }).catch(() => {});
  }, []);

  // Play the current story's song preview. Stops/unloads on story change
  // or unmount. Missing preview_url → story shows silently. A `cancelled`
  // flag guards against a fast story change while the sound is still
  // loading async.
  useEffect(() => {
    console.log('[AUDIO] effect run', groupIndex, storyIndex);
    if (groups.length === 0) return;
    const group = groups[groupIndex];
    if (!group || group.stories.length === 0) return;
    const story = group.stories[storyIndex];
    if (!story) return;

    let cancelled = false;

    (async () => {
      // Stop any previously-playing sound first.
      if (soundRef.current) {
        try { await soundRef.current.stopAsync(); } catch {}
        try { await soundRef.current.unloadAsync(); } catch {}
        soundRef.current = null;
      }

      const url = story.song.preview_url;
      console.log('[AUDIO] preview url =', url);
      if (!url) return;

      try {
        console.log('[AUDIO] createAsync starting');
        const { sound } = await Audio.Sound.createAsync(
          { uri: url },
          { shouldPlay: true, positionMillis: 0 },
        );
        console.log('[AUDIO] createAsync done, cancelled =', cancelled);
        // Story changed before this sound finished loading: drop it.
        if (cancelled) {
          console.log('[AUDIO] CANCELLED — unloading the sound we just made');
          try { await sound.stopAsync(); } catch {}
          try { await sound.unloadAsync(); } catch {}
          return;
        }
        soundRef.current = sound;
        console.log('[AUDIO] sound assigned and should be playing');
      } catch (e) {
        console.log('[AUDIO] createAsync threw:', String(e));
        // Silent — story still shows; the preview just won't play.
      }
    })();

    return () => {
      console.log('[AUDIO] cleanup running for', groupIndex, storyIndex);
      cancelled = true;
      if (soundRef.current) {
        soundRef.current.stopAsync().catch(() => {});
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupIndex, storyIndex, restartKey]);

  // 30s timer + progress animation. Reruns on every group, story, or
  // restartKey change — resetting the bar and starting a fresh countdown.
  useEffect(() => {
    if (groups.length === 0) return;
    const group = groups[groupIndex];
    if (!group || group.stories.length === 0) return;

    progress.setValue(0);
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: STORY_DURATION_MS,
      useNativeDriver: false,
    });
    anim.start();

    // Read the latest advance via the ref so the timer never holds a
    // stale closure if mid-story re-renders happen (e.g. when audio
    // integration arrives later and triggers re-renders without changing
    // indices).
    const timer = setTimeout(() => advanceRef.current(), STORY_DURATION_MS);

    return () => {
      clearTimeout(timer);
      anim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupIndex, storyIndex, restartKey]);

  // Swipe-down to dismiss. Claims responder only on a sustained downward
  // gesture so plain taps still reach the Pressable tap zones.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        gs.dy > 10 && gs.dy > Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        // Track the finger downward only; ignore upward drags.
        dragY.setValue(Math.max(0, gs.dy));
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 120) {
          // Past the dismissal threshold: animate the rest of the way off
          // the bottom of the screen, then back out.
          Animated.timing(dragY, {
            toValue: SCREEN_HEIGHT,
            duration: 180,
            useNativeDriver: true,
          }).start(() => router.back());
        } else {
          // Snap back to rest.
          Animated.spring(dragY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        // Gesture interrupted (e.g. system gesture) — reset.
        Animated.spring(dragY, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  if (groups.length === 0) return null;

  const safeGroupIdx = Math.min(groupIndex, groups.length - 1);
  const currentGroup = groups[safeGroupIdx];
  if (!currentGroup || currentGroup.stories.length === 0) return null;

  const safeStoryIdx = Math.min(storyIndex, currentGroup.stories.length - 1);
  const story = currentGroup.stories[safeStoryIdx];

  function advance() {
    const g = groups[groupIndex];
    if (storyIndex + 1 < g.stories.length) {
      setStoryIndex(storyIndex + 1);
    } else if (groupIndex + 1 < groups.length) {
      setGroupIndex(groupIndex + 1);
      setStoryIndex(0);
    } else {
      router.back();
    }
  }

  // Keep advanceRef pointing at the latest closure on every render so the
  // timer's deferred callback always operates on current indices.
  advanceRef.current = advance;

  function goBack() {
    if (storyIndex > 0) {
      setStoryIndex(storyIndex - 1);
    } else if (groupIndex > 0) {
      const prev = groups[groupIndex - 1];
      setGroupIndex(groupIndex - 1);
      setStoryIndex(Math.max(0, prev.stories.length - 1));
    } else {
      // At (0, 0): restart the current story. Bumping restartKey re-runs
      // the timer effect, which resets the progress bar and starts fresh.
      setRestartKey((k) => k + 1);
    }
  }

  const label = currentGroup.isOwn ? 'Your Vibe Today' : `@${currentGroup.username}`;

  const onAvatarTap = () => {
    if (currentGroup.isOwn) {
      router.push('/(tabs)/profile' as any);
    } else if (currentGroup.userId) {
      router.push(`/user/${currentGroup.userId}` as any);
    }
  };

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <Animated.View
        style={[
          styles.dragLayer,
          { transform: [{ translateY: dragY }] },
        ]}
      >
      {/* ── Layer 1: story content ─────────────────────────────────────── */}
      <View style={styles.contentArea}>
        {story.photo_url ? (
          <>
            <Image
              source={{ uri: story.photo_url }}
              style={styles.fullPhoto}
              resizeMode="cover"
            />
            <View style={styles.photoOverlay}>
              <View style={styles.songPill}>
                {story.song.cover_url ? (
                  <Image source={{ uri: story.song.cover_url }} style={styles.songPillCover} />
                ) : (
                  <View style={[styles.songPillCover, styles.songPillCoverFallback]}>
                    <Ionicons name="musical-note" size={18} color="#B3B3B3" />
                  </View>
                )}
                <View style={styles.songPillText}>
                  <Text style={styles.songPillTitle} numberOfLines={1}>{story.song.title}</Text>
                  <Text style={styles.songPillArtist} numberOfLines={1}>{story.song.artist}</Text>
                </View>
              </View>
              {story.caption ? (
                <Text style={styles.captionOverlay}>{story.caption}</Text>
              ) : null}
            </View>
          </>
        ) : (
          <View style={styles.songOnly}>
            <View style={styles.bigCoverWrap}>
              {story.song.cover_url ? (
                <Image source={{ uri: story.song.cover_url }} style={styles.bigCover} />
              ) : (
                <View style={[styles.bigCover, styles.bigCoverFallback]}>
                  <Ionicons name="musical-note" size={60} color="#B3B3B3" />
                </View>
              )}
            </View>
            <Text style={styles.songTitle} numberOfLines={2}>{story.song.title}</Text>
            <Text style={styles.songArtist} numberOfLines={1}>{story.song.artist}</Text>
            {story.caption ? (
              <Text style={styles.captionBelow}>{story.caption}</Text>
            ) : null}
          </View>
        )}
      </View>

      {/* ── Layer 2: tap zones for prev/next ───────────────────────────── */}
      <View style={styles.tapZones} pointerEvents="box-none">
        <Pressable style={styles.tapLeft} onPress={goBack} />
        <Pressable style={styles.tapRight} onPress={advance} />
      </View>

      {/* ── Layer 3: top UI (above tap zones; pointerEvents box-none lets
            taps pass through except where children capture). ───────────── */}
      <SafeAreaView style={styles.topUI} edges={['top']} pointerEvents="box-none">
        <View style={styles.progressRow} pointerEvents="none">
          {currentGroup.stories.map((_, i) => {
            const isActive = i === safeStoryIdx;
            const isPast = i < safeStoryIdx;
            return (
              <View key={i} style={styles.progressSegment}>
                {isPast && <View style={styles.progressFillFull} />}
                {isActive && (
                  <Animated.View
                    style={[
                      styles.progressFill,
                      {
                        width: progress.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', '100%'],
                        }),
                      },
                    ]}
                  />
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.headerRow} pointerEvents="box-none">
          <TouchableOpacity activeOpacity={0.75} onPress={onAvatarTap}>
            {currentGroup.avatarUrl ? (
              <Image source={{ uri: currentGroup.avatarUrl }} style={styles.avatarSmall} />
            ) : (
              <View style={[styles.avatarSmall, styles.avatarSmallFallback]}>
                <Ionicons name="person" size={16} color="#B3B3B3" />
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.headerName} numberOfLines={1}>{label}</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.closeBtn}
            activeOpacity={0.75}
          >
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },

  dragLayer: { flex: 1 },

  contentArea: { ...StyleSheet.absoluteFillObject },
  fullPhoto: { width: '100%', height: '100%' },

  songOnly: {
    flex: 1,
    backgroundColor: '#121212',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  bigCoverWrap: { marginBottom: 24 },
  bigCover: {
    width: 240,
    height: 240,
    borderRadius: 12,
  },
  bigCoverFallback: {
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
  },
  songTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  songArtist: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 4,
  },
  captionBelow: {
    color: '#FFFFFF',
    fontSize: 14,
    marginTop: 24,
    textAlign: 'center',
    lineHeight: 20,
  },

  photoOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 60,
  },
  songPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 10,
  },
  songPillCover: { width: 36, height: 36, borderRadius: 6 },
  songPillCoverFallback: {
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
  },
  songPillText: { flex: 1 },
  songPillTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  songPillArtist: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 1 },
  captionOverlay: {
    color: '#FFFFFF',
    fontSize: 14,
    marginTop: 10,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  tapZones: { ...StyleSheet.absoluteFillObject, flexDirection: 'row' },
  tapLeft: { flex: 1 },
  tapRight: { flex: 2 },

  topUI: { position: 'absolute', left: 0, right: 0, top: 0 },
  progressRow: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  progressSegment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
  },
  progressFill: { height: 3, backgroundColor: '#FFFFFF', borderRadius: 2 },
  progressFillFull: {
    height: 3,
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 10,
  },
  avatarSmall: { width: 32, height: 32, borderRadius: 16 },
  avatarSmallFallback: {
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerName: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
