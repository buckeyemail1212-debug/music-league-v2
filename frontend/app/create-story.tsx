import React, { useState, useEffect } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  Keyboard,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { Song, createStory } from '../src/services/api';
import SongList from '../src/components/SongList';
import { playPreview, stopPreview } from '../src/components/PreviewPlayButton';

export default function CreateStoryScreen() {
  const router = useRouter();

  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);

  const onSelectSong = (s: Song) => {
    setSelectedSong(s);
  };

  useEffect(() => {
    if (selectedSong?.deezer_id) {
      playPreview(
        selectedSong.deezer_id,
        selectedSong.preview_url,
        `compose-${selectedSong.deezer_id}`,
        { loop: true },
      );
    } else {
      stopPreview();
    }
  }, [selectedSong]);

  useFocusEffect(
    React.useCallback(() => {
      return () => { stopPreview(); };
    }, [])
  );

  const onSubmit = async () => {
    if (posting) return;
    if (!selectedSong) {
      Alert.alert('Unable to post', 'Choosing a song is required.');
      return;
    }
    setPosting(true);
    try {
      await createStory({
        song: {
          deezer_id: selectedSong.deezer_id,
          title: selectedSong.title,
          artist: selectedSong.artist,
          cover_url: selectedSong.cover_url,
          preview_url: selectedSong.preview_url,
        },
        photo_url: null,
        caption: caption.trim() || null,
      });
      stopPreview();
      router.back();
    } catch {
      setPosting(false);
      Alert.alert("Couldn't post your story", 'Please try again.');
    }
  };

  const submitDisabled = !selectedSong || posting;

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

      {selectedSong ? (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.composerBody}>
            <View style={styles.selectedCard}>
              {selectedSong.cover_url ? (
                <Image source={{ uri: selectedSong.cover_url }} style={styles.selectedCover} />
              ) : (
                <View style={[styles.selectedCover, styles.selectedCoverFallback]}>
                  <Ionicons name="musical-note" size={28} color="#B3B3B3" />
                </View>
              )}
              <View style={styles.selectedText}>
                <Text style={styles.selectedTitle} numberOfLines={1}>{selectedSong.title}</Text>
                <Text style={styles.selectedArtist} numberOfLines={1}>{selectedSong.artist}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedSong(null)} activeOpacity={0.75}>
                <Text style={styles.changeBtnText}>Change</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.captionWrap}>
              <TextInput
                style={styles.captionInput}
                placeholder="Add a caption... (optional)"
                placeholderTextColor="#6A6A6A"
                value={caption}
                onChangeText={setCaption}
                maxLength={200}
                multiline
              />
              <Text style={styles.captionCounter}>{caption.length}/200</Text>
            </View>
          </View>
        </TouchableWithoutFeedback>
      ) : (
        <SongList onSelectSong={onSelectSong} songIdPrefix="createstory" />
      )}

      <TouchableOpacity
        style={[styles.submitBtn, submitDisabled && styles.submitBtnDisabled]}
        activeOpacity={posting ? 1 : 0.75}
        onPress={onSubmit}
        disabled={posting}
      >
        {posting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Text style={styles.submitBtnLabel}>Post</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
          </>
        )}
      </TouchableOpacity>
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

  composerBody: { flex: 1 },
  selectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 14,
  },
  selectedCover: {
    width: 72,
    height: 72,
    borderRadius: 8,
  },
  selectedCoverFallback: {
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedText: { flex: 1 },
  selectedTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  selectedArtist: { color: '#B3B3B3', fontSize: 13, marginTop: 2 },
  changeBtnText: {
    color: '#7C3AED',
    fontSize: 14,
    fontWeight: '700',
  },

  captionWrap: { marginTop: 16 },
  captionInput: {
    marginHorizontal: 20,
    backgroundColor: '#282828',
    color: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  captionCounter: {
    marginTop: 4,
    marginRight: 20,
    color: '#6A6A6A',
    fontSize: 12,
    textAlign: 'right',
  },

  submitBtn: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    height: 56,
    paddingHorizontal: 22,
    borderRadius: 28,
    backgroundColor: '#7C3AED',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minWidth: 110,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  submitBtnDisabled: {
    backgroundColor: '#3A3A3A',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitBtnLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
