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

interface PreviewPlayButtonProps {
  previewUrl: string;
  songId: string; // unique identifier for this song
  size?: number;
  color?: string;
  style?: any;
}

export const PreviewPlayButton: React.FC<PreviewPlayButtonProps> = ({
  previewUrl,
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

      // Create and play new sound
      const { sound } = await Audio.Sound.createAsync(
        { uri: previewUrl },
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
          // Clean up when song finishes
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
    backgroundColor: 'rgba(90, 122, 107, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPlaying: {
    backgroundColor: '#5A7A6B',
  },
});
