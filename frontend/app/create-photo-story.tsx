import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Song } from '../src/services/api';
import { consumePendingSong } from '../src/services/pendingSong';

export default function CreatePhotoStoryScreen() {
  const router = useRouter();

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [caption, setCaption] = useState('');

  // Receive a song picked via /song-picker on every focus. consume clears
  // the slot so a previous pick can't leak back in later.
  useFocusEffect(
    useCallback(() => {
      const s = consumePendingSong();
      if (s) setSelectedSong(s);
    }, []),
  );

  const takePhoto = async () => {
    console.log('[PHOTO] picker opening');
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant camera access to take a photo.');
      router.back();
      return;
    }
    try {
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.7,
        allowsEditing: false,
      });
      console.log('[PHOTO] picker result:', JSON.stringify(result));
      if (result.canceled) {
        console.log('[PHOTO] canceled, photoUri is:', photoUri);
        return;
      }
      console.log('[PHOTO] setting photoUri to:', result.assets[0].uri);
      setPhotoUri(result.assets[0].uri);
    } catch (e) {
      console.log('[PHOTO] picker threw:', String(e), JSON.stringify(e));
    }
  };

  const pickFromLibrary = async () => {
    console.log('[PHOTO] picker opening');
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant photo library access to add a photo.');
      router.back();
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'] as any,
        quality: 0.7,
        allowsEditing: false,
      });
      console.log('[PHOTO] picker result:', JSON.stringify(result));
      if (result.canceled) {
        console.log('[PHOTO] canceled, photoUri is:', photoUri);
        return;
      }
      console.log('[PHOTO] setting photoUri to:', result.assets[0].uri);
      setPhotoUri(result.assets[0].uri);
    } catch (e) {
      console.log('[PHOTO] picker threw:', String(e), JSON.stringify(e));
    }
  };

  const onAddMusicTap = () => {
    router.push('/song-picker' as any);
  };

  const onSubmitTap = () => {
    if (!selectedSong) return;
    Alert.alert(
      'Ready to post',
      'Photo + song + caption captured. Upload wiring comes next.',
    );
  };

  const submitDisabled = !selectedSong;

  return (
    <View style={styles.container}>
      {photoUri ? (
        <>
          <Image
            source={{ uri: photoUri }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="contain"
          />

          {/* KAV wraps the dismiss-tap area + bottom overlay so the
              caption/submit lift above the keyboard. Top overlay is
              rendered AFTER the KAV so its buttons stay tappable above
              the dismiss-area. */}
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
                style={styles.captionInput}
                placeholder="Add a caption... (optional)"
                placeholderTextColor="rgba(255,255,255,0.6)"
                value={caption}
                onChangeText={setCaption}
                maxLength={200}
                multiline
              />
              <TouchableOpacity
                style={[styles.submitBtn, submitDisabled && styles.submitBtnDisabled]}
                onPress={onSubmitTap}
                disabled={submitDisabled}
                activeOpacity={submitDisabled ? 1 : 0.75}
              >
                <Ionicons name="arrow-forward" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </SafeAreaView>
          </KeyboardAvoidingView>

          {/* Top overlay last → sits above the KAV's dismiss layer so
              close + Add Music remain tappable. */}
          <SafeAreaView style={styles.topOverlay} edges={['top']} pointerEvents="box-none">
            <View style={styles.topRow}>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => router.back()}
                activeOpacity={0.75}
              >
                <Ionicons name="close" size={28} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                style={styles.musicPill}
                onPress={onAddMusicTap}
                activeOpacity={0.75}
              >
                {selectedSong ? (
                  <>
                    {selectedSong.cover_url ? (
                      <Image source={{ uri: selectedSong.cover_url }} style={styles.musicPillCover} />
                    ) : (
                      <View style={[styles.musicPillCover, styles.musicPillCoverFallback]}>
                        <Ionicons name="musical-note" size={12} color="#B3B3B3" />
                      </View>
                    )}
                    <View style={styles.musicPillText}>
                      <Text style={styles.musicPillTitle} numberOfLines={1}>{selectedSong.title}</Text>
                      <Text style={styles.musicPillArtist} numberOfLines={1}>{selectedSong.artist}</Text>
                    </View>
                  </>
                ) : (
                  <>
                    <Ionicons name="musical-notes" size={18} color="#FFFFFF" />
                    <Text style={styles.musicPillLabel}>Add Music</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </>
      ) : (
        <>
          <SafeAreaView style={styles.topOverlay} edges={['top']} pointerEvents="box-none">
            <View style={styles.topRow}>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => router.back()}
                activeOpacity={0.75}
              >
                <Ionicons name="close" size={28} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
          <View style={styles.chooserCenter}>
            <Text style={styles.chooserTitle}>Add a photo to your story</Text>
            <TouchableOpacity
              style={styles.chooserBtn}
              onPress={takePhoto}
              activeOpacity={0.75}
            >
              <Ionicons name="camera" size={20} color="#FFFFFF" />
              <Text style={styles.chooserBtnLabel}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.chooserBtn}
              onPress={pickFromLibrary}
              activeOpacity={0.75}
            >
              <Ionicons name="images" size={20} color="#FFFFFF" />
              <Text style={styles.chooserBtnLabel}>Choose from Library</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },

  topOverlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  musicPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
    maxWidth: 220,
  },
  musicPillLabel: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  musicPillCover: { width: 28, height: 28, borderRadius: 4 },
  musicPillCoverFallback: {
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
  },
  musicPillText: { flex: 1 },
  musicPillTitle: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  musicPillArtist: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 1 },

  bottomOverlay: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  dismissArea: { flex: 1 },
  captionInput: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    color: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 48,
    maxHeight: 120,
    textAlignVertical: 'top',
  },
  submitBtn: {
    alignSelf: 'flex-end',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
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

  chooserCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 14,
  },
  chooserTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  chooserBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    minWidth: 240,
  },
  chooserBtnLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
