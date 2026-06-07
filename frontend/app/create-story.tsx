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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { Song, createStory } from '../src/services/api';
import SongList from '../src/components/SongList';
import { playPreview, stopPreview } from '../src/components/PreviewPlayButton';
import { useAuth } from '../src/context/AuthContext';

export default function CreateStoryScreen() {
  const router = useRouter();
  const { user } = useAuth();

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
    <SafeAreaView style={styles.container} edges={[]}>
      {selectedSong ? (
        <View style={styles.composerRoot}>
          {/* Center content: big cover + title + artist, matching the viewer's songOnly */}
          <View style={styles.songOnly}>
            {selectedSong.cover_url ? (
              <Image source={{ uri: selectedSong.cover_url }} style={styles.bigCover} />
            ) : (
              <View style={[styles.bigCover, styles.bigCoverFallback]}>
                <Ionicons name="musical-note" size={60} color="#B3B3B3" />
              </View>
            )}
            <Text style={styles.songTitle} numberOfLines={2}>{selectedSong.title}</Text>
            <Text style={styles.songArtist} numberOfLines={1}>{selectedSong.artist}</Text>
          </View>

          {/* Bottom overlay: caption + Your story + Post */}
          <KeyboardAvoidingView
            style={StyleSheet.absoluteFillObject}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            pointerEvents="box-none"
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
              <View style={styles.dismissArea} />
            </TouchableWithoutFeedback>
            <SafeAreaView style={styles.bottomOverlay} edges={['bottom']} pointerEvents="box-none">
              <TextInput
                style={styles.captionInputOverlay}
                placeholder="Add a caption... (optional)"
                placeholderTextColor="rgba(255,255,255,0.6)"
                value={caption}
                onChangeText={setCaption}
                maxLength={200}
                multiline
              />
              <View style={styles.shareRow}>
                <View style={styles.shareIdentity}>
                  {user?.profile_photo ? (
                    <Image source={{ uri: user.profile_photo }} style={styles.shareAvatar} />
                  ) : (
                    <View style={[styles.shareAvatar, styles.shareAvatarFallback]}>
                      <Text style={styles.shareAvatarInitial}>{(user?.username || '?').charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <Text style={styles.shareIdentityLabel}>Your story</Text>
                </View>
                <TouchableOpacity
                  style={[styles.sendBtn, submitDisabled && styles.sendBtnDisabled]}
                  onPress={onSubmit}
                  disabled={posting}
                  activeOpacity={posting ? 1 : 0.85}
                >
                  {posting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={styles.sendBtnLabel}>Post</Text>
                      <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </KeyboardAvoidingView>

          {/* Top overlay last so its buttons stay tappable: close left, Change music right */}
          <SafeAreaView style={styles.topOverlay} edges={['top']} pointerEvents="box-none">
            <View style={styles.topRow}>
              <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.75}>
                <Ionicons name="close" size={28} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
              <TouchableOpacity style={styles.changeMusicBtn} onPress={() => setSelectedSong(null)} activeOpacity={0.85}>
                <Text style={styles.changeMusicBtnLabel}>Change music</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      ) : (
        <SafeAreaView style={styles.container} edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} activeOpacity={0.75}>
              <Ionicons name="close" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Add Music</Text>
            <View style={styles.closeBtn} />
          </View>
          <SongList onSelectSong={onSelectSong} songIdPrefix="createstory" />
        </SafeAreaView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },

  composerRoot: { flex: 1, backgroundColor: '#121212' },
  songOnly: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  bigCover: { width: 240, height: 240, borderRadius: 12 },
  bigCoverFallback: { backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' },
  songTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', textAlign: 'center', marginTop: 20 },
  songArtist: { color: '#B3B3B3', fontSize: 15, textAlign: 'center', marginTop: 4 },
  topOverlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  topRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 8 },
  iconBtn: { padding: 6 },
  changeMusicBtn: { backgroundColor: '#7C3AED', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20 },
  changeMusicBtnLabel: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  dismissArea: { flex: 1 },
  bottomOverlay: { paddingHorizontal: 16, paddingBottom: 8 },
  captionInputOverlay: { color: '#FFFFFF', fontSize: 16, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, maxHeight: 120, marginBottom: 12 },
  shareRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  shareIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shareAvatar: { width: 36, height: 36, borderRadius: 18 },
  shareAvatarFallback: { backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center' },
  shareAvatarInitial: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  shareIdentityLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  sendBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#7C3AED', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 24 },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnLabel: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },

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
