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
  color = '#fff',
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
    try {
      // If this song is currently playing, stop it
      if (globalCurrentId === songId) {
        await stopGlobalAudio();
        if (mountedRef.current) {
          setIsPlaying(false);
          setIsLoading(false);
        }
        return;
      }

      // Stop whatever is currently playing
      await stopGlobalAudio();

      if (mountedRef.current) {
        setIsLoading(true);
      }

      // Set audio mode fresh every time
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      // Always fetch a fresh preview URL from Deezer (stored URLs expire)
      let urlToPlay = await getFreshPreviewUrl(String(deezerId));
      
      // Fallback to stored URL only if fresh fetch fails
      if (!urlToPlay) {
        urlToPlay = previewUrl;
      }

      if (!urlToPlay || urlToPlay.length === 0) {
        console.error('No preview URL available for track:', deezerId);
        if (mountedRef.current) {
          setIsLoading(false);
        }
        return;
      }

      // Create and play new sound
      const { sound } = await Audio.Sound.createAsync(
        { uri: urlToPlay },
        { shouldPlay: true, positionMillis: 0 }
      );

      globalCurrentSound = sound;
      globalCurrentId = songId;

      if (mountedRef.current) {
        setIsPlaying(true);
        setIsLoading(false);
      }
      notifyListeners();

      // Handle playback completion
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          try { sound.unloadAsync(); } catch {}
          if (globalCurrentSound === sound) {
            globalCurrentSound = null;
            globalCurrentId = null;
          }
          if (mountedRef.current) {
            setIsPlaying(false);
          }
          notifyListeners();
        }
      });
    } catch (error) {
      console.error('PreviewPlayButton error:', error);
      if (mountedRef.current) {
        setIsPlaying(false);
        setIsLoading(false);
      }
      globalCurrentSound = null;
      globalCurrentId = null;
      notifyListeners();
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={14}
      style={[
        styles.button,
        isPlaying && styles.buttonPlaying,
        style,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Ionicons
          name={isPlaying ? 'pause' : 'play'}
          size={size}
          color={color}
        />
      )}
    </Pressable>
  );
};

// Export cleanup function for use in screen focus/blur
export const stopAllPreviews = async () => {
  await stopGlobalAudio();
};

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPlaying: {
    backgroundColor: '#7C3AED',
  },
});
