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
  Alert,
  Modal,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Audio } from 'expo-av';
import { deleteStory } from '../src/services/api';
import { consumePendingStories } from '../src/services/pendingStories';

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
  sticker: {
    x: number;
    y: number;
    scale?: number;
    rotation?: number;
  } | null;
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
    startGroupIndex?: string;
  }>();

  // Groups are passed via a module-scoped in-memory slot
  // (src/services/pendingStories.ts) rather than a route param, because
  // JSON.stringify/parse of the whole feed on every tap was adding ~1s
  // to the open. Consumed once on first render; a fallback to [] keeps
  // the empty-feed handling below working.
  const groups = useMemo<ViewerGroup[]>(() => {
    return consumePendingStories() ?? [];
  }, []);

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
  const [menuOpen, setMenuOpen] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const advanceRef = useRef<() => void>(() => {});
  const dragY = useRef(new Animated.Value(0)).current;
  const soundRef = useRef<Audio.Sound | null>(null);
  // Hold-to-pause bookkeeping. All refs so they survive renders without
  // re-triggering effects.
  const pausedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const startedAtRef = useRef<number>(0);
  const accumulatedMsRef = useRef<number>(0);

  const clearTimerAndAnim = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (animRef.current) {
      animRef.current.stop();
      animRef.current = null;
    }
  };

  // Drive the progress animation + auto-advance timer from `fromMs` of
  // elapsed time within the current 30s story window. fromMs=0 starts
  // fresh; fromMs>0 resumes after a pause.
  const startTimerAndAnim = (fromMs: number) => {
    const remaining = Math.max(0, STORY_DURATION_MS - fromMs);
    progress.setValue(fromMs / STORY_DURATION_MS);
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: remaining,
      useNativeDriver: false,
    });
    animRef.current = anim;
    anim.start();
    startedAtRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      advanceRef.current();
    }, remaining);
  };

  const pause = () => {
    if (pausedRef.current) return;
    pausedRef.current = true;
    // Bank the elapsed time so resume picks up where we left off.
    accumulatedMsRef.current += Date.now() - startedAtRef.current;
    clearTimerAndAnim();
    if (soundRef.current) {
      soundRef.current.pauseAsync().catch(() => {});
    }
  };

  const resume = () => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    startTimerAndAnim(accumulatedMsRef.current);
    if (soundRef.current) {
      soundRef.current.playAsync().catch(() => {});
    }
  };

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
      if (!url) return;

      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: url },
          { shouldPlay: true, positionMillis: 0 },
        );
        // Story changed before this sound finished loading: drop it.
        if (cancelled) {
          try { await sound.stopAsync(); } catch {}
          try { await sound.unloadAsync(); } catch {}
          return;
        }
        soundRef.current = sound;
        // If the user started holding while audio was loading, pause it
        // immediately so it doesn't blast over a frozen progress bar.
        if (pausedRef.current) {
          try { await sound.pauseAsync(); } catch {}
        }
      } catch (e) {
        // Silent — story still shows; the preview just won't play.
      }
    })();

    return () => {
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
  // Pause/resume are handled imperatively via the press handlers, which
  // mutate the same refs this effect controls.
  useEffect(() => {
    if (groups.length === 0) return;
    const group = groups[groupIndex];
    if (!group || group.stories.length === 0) return;

    // Fresh story: clear pause state and elapsed counter, then start.
    pausedRef.current = false;
    accumulatedMsRef.current = 0;
    clearTimerAndAnim();
    startTimerAndAnim(0);

    return () => {
      clearTimerAndAnim();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupIndex, storyIndex, restartKey]);

  // Warm the image cache for adjacent stories so tapping forward/back
  // doesn't blank-flash while the next photo downloads. Best-effort —
  // a failed prefetch falls back to load-on-render.
  useEffect(() => {
    if (groups.length === 0) return;
    const group = groups[groupIndex];
    if (!group || group.stories.length === 0) return;

    const nextStory =
      storyIndex + 1 < group.stories.length
        ? group.stories[storyIndex + 1]
        : groupIndex + 1 < groups.length
        ? groups[groupIndex + 1].stories[0]
        : null;

    const prevStory =
      storyIndex > 0
        ? group.stories[storyIndex - 1]
        : groupIndex > 0
        ? groups[groupIndex - 1].stories[
            groups[groupIndex - 1].stories.length - 1
          ]
        : null;

    for (const neighbor of [nextStory, prevStory]) {
      if (neighbor && neighbor.photo_url) {
        Image.prefetch(neighbor.photo_url).catch(() => {});
      }
    }
  }, [groupIndex, storyIndex, groups]);

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
      router.replace('/(tabs)/profile' as any);
    } else if (currentGroup.userId) {
      router.replace(`/user/${currentGroup.userId}` as any);
    }
  };

  const openMenu = () => {
    pause();
    setMenuOpen(true);
  };

  // Menu dismissal that resumes the story (Cancel button or backdrop tap).
  const closeMenuAndResume = () => {
    setMenuOpen(false);
    resume();
  };

  const onDeletePress = () => {
    // Close the sheet but keep the story paused while we confirm.
    setMenuOpen(false);
    Alert.alert(
      'Delete this story?',
      "This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resume() },
        { text: 'Delete', style: 'destructive', onPress: () => doDelete() },
      ],
    );
  };

  const doDelete = async () => {
    try {
      await deleteStory(story.id);
      router.back();
    } catch {
      Alert.alert('Could not delete', 'Please try again.');
      resume();
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
            <ExpoImage
              source={{ uri: story.photo_url }}
              style={styles.fullPhoto}
              contentFit="contain"
              transition={150}
              cachePolicy="memory-disk"
            />
            {story.sticker ? (
              <>
                <View style={styles.stickerAnchor} pointerEvents="none">
                  <View
                    style={[
                      styles.stickerCard,
                      { transform: [
                        { translateX: story.sticker.x },
                        { translateY: story.sticker.y },
                        { scale: story.sticker.scale ?? 1 },
                        { rotate: `${story.sticker.rotation ?? 0}rad` },
                      ] },
                    ]}
                  >
                    {story.song.cover_url ? (
                      <Image source={{ uri: story.song.cover_url }} style={styles.stickerCover} />
                    ) : (
                      <View style={[styles.stickerCover, styles.stickerCoverFallback]}>
                        <Ionicons name="musical-note" size={20} color="#B3B3B3" />
                      </View>
                    )}
                    <View style={styles.stickerText}>
                      <Text style={styles.stickerTitle} numberOfLines={1}>{story.song.title}</Text>
                      <Text style={styles.stickerArtist} numberOfLines={1}>{story.song.artist}</Text>
                    </View>
                  </View>
                </View>
                {story.caption ? (
                  <View style={styles.photoOverlay}>
                    <Text style={styles.captionOverlay}>{story.caption}</Text>
                  </View>
                ) : null}
              </>
            ) : (
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
            )}
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
        <Pressable
          style={styles.tapLeft}
          onPress={goBack}
          onLongPress={pause}
          onPressOut={resume}
          delayLongPress={200}
        />
        <Pressable
          style={styles.tapRight}
          onPress={advance}
          onLongPress={pause}
          onPressOut={resume}
          delayLongPress={200}
        />
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
          {currentGroup.isOwn && (
            <TouchableOpacity
              onPress={openMenu}
              style={styles.closeBtn}
              activeOpacity={0.75}
            >
              <Ionicons name="ellipsis-horizontal" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          )}
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

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={closeMenuAndResume}
      >
        <TouchableWithoutFeedback onPress={closeMenuAndResume}>
          <View style={styles.sheetOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.sheetWrap}>
                <View style={styles.optionsGroup}>
                  <TouchableOpacity
                    style={styles.actionRow}
                    activeOpacity={0.6}
                    onPress={onDeletePress}
                  >
                    <Ionicons name="trash" size={22} color="#FF3B30" />
                    <Text style={[styles.actionLabel, styles.actionLabelDestructive]}>
                      Delete Story
                    </Text>
                    <View style={styles.actionRowSpacer} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={styles.cancelGroup}
                  activeOpacity={0.6}
                  onPress={closeMenuAndResume}
                >
                  <Text style={styles.cancelLabel}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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

  stickerAnchor: {
    position: 'absolute',
    top: '32%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  stickerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: 300,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  stickerCover: { width: 52, height: 52, borderRadius: 8 },
  stickerCoverFallback: {
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerText: { flex: 1 },
  stickerTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  stickerArtist: { color: 'rgba(255,255,255,0.7)', fontSize: 11.5, marginTop: 1 },

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

  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheetWrap: {
    marginHorizontal: 10,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
  },
  optionsGroup: {
    backgroundColor: '#1E1E1E',
    borderRadius: 14,
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 12,
  },
  actionLabel: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  actionLabelDestructive: {
    color: '#FF3B30',
  },
  actionRowSpacer: {
    width: 22,
  },
  cancelGroup: {
    marginTop: 8,
    backgroundColor: '#1E1E1E',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
