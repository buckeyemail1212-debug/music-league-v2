import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Image,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useFocusEffect } from 'expo-router';
import { searchSongs, Song } from '../../src/services/api';

export default function DiscoveryScreen() {
  const [query, setQuery] = useState('');
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingSongId, setPlayingSongId] = useState<number | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });

    return () => {
      if (soundRef.current) {
        soundRef.current.stopAsync();
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  // Stop audio when leaving the tab
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (soundRef.current) {
          soundRef.current.stopAsync();
          soundRef.current.unloadAsync();
          soundRef.current = null;
        }
        setPlayingSongId(null);
      };
    }, [])
  );

  const handleSearch = async (text: string) => {
    setQuery(text);
    
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    if (text.length < 2) {
      setSongs([]);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await searchSongs(text);
        setSongs(response.data.data);
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setLoading(false);
      }
    }, 500);
  };

  const playPreview = async (song: Song) => {
    try {
      // Stop and unload current sound if playing
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      // If same song was playing, just stop
      if (playingSongId === song.deezer_id) {
        setPlayingSongId(null);
        return;
      }

      // Create and play new sound
      const { sound } = await Audio.Sound.createAsync(
        { uri: song.preview_url },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      setPlayingSongId(song.deezer_id);

      // Handle playback finish
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingSongId(null);
        }
      });
    } catch (error) {
      console.error('Failed to play preview:', error);
      setPlayingSongId(null);
    }
  };

  const openInService = (song: Song, service: 'spotify' | 'apple' | 'youtube') => {
    let url = '';
    const searchQuery = encodeURIComponent(`${song.title} ${song.artist}`);
    
    switch (service) {
      case 'spotify':
        url = `https://open.spotify.com/search/${searchQuery}`;
        break;
      case 'apple':
        url = `https://music.apple.com/search?term=${searchQuery}`;
        break;
      case 'youtube':
        url = `https://www.youtube.com/results?search_query=${searchQuery}`;
        break;
    }
    
    Linking.openURL(url);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderSongItem = ({ item }: { item: Song }) => (
    <View style={styles.songCard}>
      <Image source={{ uri: item.cover_url }} style={styles.albumCover} />
      <View style={styles.songInfo}>
        <Text style={styles.songTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.artistName} numberOfLines={1}>{item.artist}</Text>
        <Text style={styles.albumName} numberOfLines={1}>{item.album}</Text>
        <Text style={styles.duration}>{formatDuration(item.duration)}</Text>
      </View>
      <View style={styles.songActions}>
        <TouchableOpacity
          style={[styles.playButton, playingSongId === item.deezer_id && styles.playingButton]}
          onPress={() => playPreview(item)}
        >
          <Ionicons
            name={playingSongId === item.deezer_id ? 'pause' : 'play'}
            size={24}
            color="#fff"
          />
        </TouchableOpacity>
        <View style={styles.serviceButtons}>
          <TouchableOpacity
            style={[styles.serviceButton, { backgroundColor: '#1DB954' }]}
            onPress={() => openInService(item, 'spotify')}
          >
            <FontAwesome name="spotify" size={16} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.serviceButton, { backgroundColor: '#FA243C' }]}
            onPress={() => openInService(item, 'apple')}
          >
            <Ionicons name="logo-apple" size={16} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.serviceButton, { backgroundColor: '#FF0000' }]}
            onPress={() => openInService(item, 'youtube')}
          >
            <Ionicons name="logo-youtube" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Discover Songs</Text>
        <Text style={styles.subtitle}>Search songs to choose from</Text>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#6B7A82" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search songs, artists..."
          placeholderTextColor="#8B9A94"
          value={query}
          onChangeText={handleSearch}
          autoComplete="off"
          autoCorrect={false}
          textContentType="oneTimeCode"
          importantForAutofill="no"
          spellCheck={false}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => handleSearch('')}>
            <Ionicons name="close-circle" size={20} color="#6B7A82" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#5A7A6B" />
        </View>
      ) : songs.length > 0 ? (
        <FlatList
          data={songs}
          keyExtractor={(item) => item.deezer_id.toString()}
          renderItem={renderSongItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      ) : query.length >= 2 ? (
        <View style={styles.emptyState}>
          <Ionicons name="musical-note" size={60} color="#212F36" />
          <Text style={styles.emptyText}>No songs found</Text>
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="headset" size={80} color="#212F36" />
          <Text style={styles.emptyTitle}>Discover Music</Text>
          <Text style={styles.emptyText}>Search for songs to listen to 30-second previews</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F0E8',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#212F36',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7A82',
    marginTop: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginVertical: 16,
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E0D8CC',
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    height: 48,
    color: '#212F36',
    fontSize: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  songCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0D8CC',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  albumCover: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  songInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  songTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212F36',
  },
  artistName: {
    fontSize: 14,
    color: '#5A7A6B',
    marginTop: 2,
  },
  albumName: {
    fontSize: 12,
    color: '#6B7A82',
    marginTop: 2,
  },
  duration: {
    fontSize: 12,
    color: '#8B9A94',
    marginTop: 4,
  },
  songActions: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#212F36',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playingButton: {
    backgroundColor: '#ef4444',
  },
  serviceButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  serviceButton: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#212F36',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7A82',
    textAlign: 'center',
    marginTop: 8,
  },
});
