import React, { useState, useRef, useEffect } from 'react';
import { Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';

// Global audio manager - ensures only one sound plays at a time across all buttons
let globalCurrentSound: Audio.Sound | null = null;
let globalCurrentId: string | null = null;
let globalListeners: Set<() => void> = new Set();

const stopGlobalAudio = async () => {
  if (globalCurrentSound) {
    try { await globalCurrentSound.stopAsync(); } catch {}
    try { await globalCurrentSound.unloadAsync(); } catch {}
  }
  globalCurrentSound = null;
  globalCurrentId = null;
  notifyListeners();
};

const notifyListeners = () => {
  globalListeners.forEach(fn => fn());
};

// Cache for fresh preview URLs (keyed by deezer_id)
const previewUrlCache: { [key: string]: { url: string; timestamp: number } } = {};
const CACHE_TTL = 3 * 60 * 60 * 1000; // 3 hours in ms

// Fetch a fresh preview URL from Deezer API
const getFreshPreviewUrl = async (deezerId: string): Promise<string | null> => {
  // Check cache first
  const cached = previewUrlCache[deezerId];
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.url;
  }

  try {
    const response = await fetch(`https://api.deezer.com/track/${deezerId}`);
    const data = await response.json();
    if (data.preview && data.preview.length > 0) {
      previewUrlCache[deezerId] = { url: data.preview, timestamp: Date.now() };
      return data.preview;
    }
  } catch (e) {
    console.error('Failed to fetch fresh preview URL:', e);
  }
  return null;
};

export const stopPreview = async () => {
  await stopGlobalAudio();
};

export const playPreview = async (
  deezerId: number,
  previewUrl: string,
  songId: string,
  opts?: { loop?: boolean },
): Promise<boolean> => {
  // Returns true if playback started, false otherwise.
  try {
    await stopGlobalAudio();
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    });
    let urlToPlay = await getFreshPreviewUrl(String(deezerId));
    if (!urlToPlay) urlToPlay = previewUrl;
    if (!urlToPlay || urlToPlay.length === 0) return false;
    const { sound } = await Audio.Sound.createAsync(
      { uri: urlToPlay },
      { shouldPlay: true, positionMillis: 0, isLooping: !!opts?.loop },
    );
    globalCurrentSound = sound;
    globalCurrentId = songId;
    notifyListeners();
    sound.setOnPlaybackStatusUpdate((status) => {
      // When not looping, clear state on finish. When looping, it just repeats.
      if (status.isLoaded && status.didJustFinish && !opts?.loop) {
        try { sound.unloadAsync(); } catch {}
        if (globalCurrentSound === sound) {
          globalCurrentSound = null;
          globalCurrentId = null;
        }
        notifyListeners();
      }
    });
    return true;
  } catch (e) {
    console.error('playPreview error:', e);
    globalCurrentSound = null;
    globalCurrentId = null;
    notifyListeners();
    return false;
  }
};

interface PreviewPlayButtonProps {
  previewUrl: string;
  deezerId: number; // Deezer track ID for fetching fresh URLs
  songId: string; // unique identifier for this button instance
  size?: number;
  color?: string;
  style?: any;
}

export const PreviewPlayButton: React.FC<PreviewPlayButtonProps> = ({
  previewUrl,
  deezerId,
  songId,
  size = 16,
  color = '#000000',
  style,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);

  // Listen for global audio changes (another button started playing)
  useEffect(() => {
    const listener = () => {
      if (mountedRef.current) {
        setIsPlaying(globalCurrentId === songId);
        setIsLoading(false);
      }
    };
    globalListeners.add(listener);
    return () => {
      mountedRef.current = false;
      globalListeners.delete(listener);
    };
  }, [songId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (globalCurrentId === songId && globalCurrentSound) {
        globalCurrentSound.stopAsync().catch(() => {});
        globalCurrentSound.unloadAsync().catch(() => {});
        globalCurrentSound = null;
        globalCurrentId = null;
      }
    };
  }, [songId]);

  const handlePress = async () => {
    // If this song is currently playing, stop it
    if (globalCurrentId === songId) {
      await stopPreview();
      if (mountedRef.current) {
        setIsPlaying(false);
        setIsLoading(false);
      }
      return;
    }

    if (mountedRef.current) {
      setIsLoading(true);
    }

    // The button does not loop — omit opts so loop defaults false.
    const started = await playPreview(deezerId, previewUrl, songId);

    if (mountedRef.current) {
      setIsPlaying(started);
      setIsLoading(false);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={14}
      style={[
        styles.button,
        style,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Ionicons
          name={isPlaying ? 'pause-outline' : 'play-outline'}
          size={size}
          color={color}
        />
      )}
    </Pressable>
  );
};

// Registry for extra stop handlers (e.g. DiscoverScreen's own soundRef)
const extraStopHandlers: Set<() => Promise<void>> = new Set();

export const registerStopHandler = (fn: () => Promise<void>) => {
  extraStopHandlers.add(fn);
  return () => extraStopHandlers.delete(fn);
};

// Export cleanup function for use in screen focus/blur
export const stopAllPreviews = async () => {
  await stopGlobalAudio();
  await Promise.all([...extraStopHandlers].map(fn => fn().catch(() => {})));
};

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
