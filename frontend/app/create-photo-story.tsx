import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { Song, createStory, uploadImage } from '../src/services/api';
import { consumePendingSong } from '../src/services/pendingSong';
import { useAuth } from '../src/context/AuthContext';

export default function CreatePhotoStoryScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);

  // Music-sticker drag state. The shared values drive the on-screen
  // translate on every frame; the React state is the committed position
  // that S6 will persist with the post. Default 0/0 = the sticker's
  // base position (see styles.stickerAnchor).
  const [sticker, setSticker] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const stickerX = useSharedValue(0);
  const stickerY = useSharedValue(0);
  const stickerStartX = useSharedValue(0);
  const stickerStartY = useSharedValue(0);

  const stickerPan = Gesture.Pan()
    .onStart(() => {
      stickerStartX.value = stickerX.value;
      stickerStartY.value = stickerY.value;
    })
    .onUpdate((e) => {
      stickerX.value = stickerStartX.value + e.translationX;
      stickerY.value = stickerStartY.value + e.translationY;
    })
    .onEnd(() => {
      runOnJS(setSticker)({ x: stickerX.value, y: stickerY.value });
    });

  const stickerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: stickerX.value },
      { translateY: stickerY.value },
    ],
  }));

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
        base64: true,
      });
      console.log('[PHOTO] picker result:', JSON.stringify(result));
      if (result.canceled) {
        console.log('[PHOTO] canceled, photoUri is:', photoUri);
        return;
      }
      console.log('[PHOTO] setting photoUri to:', result.assets[0].uri);
      setPhotoUri(result.assets[0].uri);
      setPhotoBase64(result.assets[0].base64 || null);
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
        base64: true,
      });
      console.log('[PHOTO] picker result:', JSON.stringify(result));
      if (result.canceled) {
        console.log('[PHOTO] canceled, photoUri is:', photoUri);
        return;
      }
      console.log('[PHOTO] setting photoUri to:', result.assets[0].uri);
      setPhotoUri(result.assets[0].uri);
      setPhotoBase64(result.assets[0].base64 || null);
    } catch (e) {
      console.log('[PHOTO] picker threw:', String(e), JSON.stringify(e));
    }
  };

  const onAddMusicTap = () => {
    router.push('/song-picker' as any);
  };

  const onSubmitTap = async () => {
    if (!selectedSong || !photoUri || !photoBase64 || posting) return;
    setPosting(true);
    try {
      const dataUri = `data:image/jpeg;base64,${photoBase64}`;
      const uploadRes = await uploadImage(dataUri);
      const hostedUrl = uploadRes.data.data.url;
      await createStory({
        song: {
          deezer_id: selectedSong.deezer_id,
          title: selectedSong.title,
          artist: selectedSong.artist,
          cover_url: selectedSong.cover_url,
          preview_url: selectedSong.preview_url,
        },
        photo_url: hostedUrl,
        caption: caption.trim() || null,
      });
      router.back();
    } catch {
      setPosting(false);
      Alert.alert("Couldn't post your story", 'Please try again.');
    }
  };

  const submitDisabled = !selectedSong || posting;

  return (
    <View style={styles.container}>
      {photoUri ? (
        <>
          <Image
            source={{ uri: photoUri }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="contain"
          />

          {/* Centered music control — floats over the upper portion of the
              photo. Above the KAV/dismiss layer because it's rendered later
              (the top overlay group is the last sibling). */}

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
              <View style={styles.shareRow}>
                <View style={styles.shareIdentity}>
                  {user?.profile_photo ? (
                    <Image source={{ uri: user.profile_photo }} style={styles.shareAvatar} />
                  ) : (
                    <View style={[styles.shareAvatar, styles.shareAvatarFallback]}>
                      <Text style={styles.shareAvatarInitial}>
                        {(user?.username || '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.shareIdentityLabel}>Your story</Text>
                </View>
                <TouchableOpacity
                  style={[styles.sendBtn, submitDisabled && styles.sendBtnDisabled]}
                  onPress={onSubmitTap}
                  disabled={submitDisabled}
                  activeOpacity={submitDisabled ? 1 : 0.85}
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

          {/* Draggable music sticker — rendered after the KAV so it sits
              above the dismiss-area (so drag gestures aren't swallowed
              by the keyboard-dismiss layer), but before the top overlay
              (so close + Change music remain tappable above it). The
              outer anchor uses pointerEvents="box-none" so taps outside
              the card itself fall through to the KAV's dismiss-area. */}
          {selectedSong && (
            <View style={styles.stickerAnchor} pointerEvents="box-none">
              <GestureDetector gesture={stickerPan}>
                <Animated.View style={[styles.stickerCard, stickerAnimatedStyle]}>
                  {selectedSong.cover_url ? (
                    <Image source={{ uri: selectedSong.cover_url }} style={styles.stickerCover} />
                  ) : (
                    <View style={[styles.stickerCover, styles.stickerCoverFallback]}>
                      <Ionicons name="musical-note" size={20} color="#B3B3B3" />
                    </View>
                  )}
                  <View style={styles.stickerText}>
                    <Text style={styles.stickerTitle} numberOfLines={1}>{selectedSong.title}</Text>
                    <Text style={styles.stickerArtist} numberOfLines={1}>{selectedSong.artist}</Text>
                  </View>
                </Animated.View>
              </GestureDetector>
            </View>
          )}

          {/* Top overlay last → sits above the KAV's dismiss layer so
              close + music control remain tappable. */}
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
            <View style={styles.musicAnchor} pointerEvents="box-none">
              {selectedSong ? (
                <TouchableOpacity
                  style={styles.changeMusicBtn}
                  onPress={onAddMusicTap}
                  activeOpacity={0.85}
                >
                  <Ionicons name="musical-note" size={14} color="#FFFFFF" />
                  <Text style={styles.changeMusicBtnLabel}>Change music</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.addMusicBtn}
                  onPress={onAddMusicTap}
                  activeOpacity={0.85}
                >
                  <Ionicons name="musical-notes" size={18} color="#FFFFFF" />
                  <Text style={styles.addMusicBtnLabel}>Add music</Text>
                </TouchableOpacity>
              )}
            </View>
          </SafeAreaView>
        </>
      ) : (
        <View style={styles.chooserScreen}>
          <SafeAreaView edges={['top']} pointerEvents="box-none">
            <View style={styles.chooserTopRow}>
              <TouchableOpacity
                style={styles.chooserCloseBtn}
                onPress={() => router.back()}
                activeOpacity={0.75}
              >
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </SafeAreaView>

          <View style={styles.chooserBody}>
            <View style={styles.heroCanvas}>
              <TouchableOpacity
                style={styles.heroCameraBtn}
                onPress={takePhoto}
                activeOpacity={0.85}
              >
                <Ionicons name="camera" size={26} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.heroCaption}>Post For Today's Vibe</Text>
            </View>

            <Text style={styles.eyebrow}>NEW STORY</Text>
            <Text style={styles.headline}>Drop a moment.{'\n'}Add a track.</Text>

            <View style={styles.ctaStack}>
              <TouchableOpacity
                style={[styles.ctaBtn, styles.ctaPrimary]}
                onPress={takePhoto}
                activeOpacity={0.85}
              >
                <Ionicons name="camera" size={22} color="#FFFFFF" />
                <Text style={styles.ctaLabel}>Take photo</Text>
                <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ctaBtn, styles.ctaSecondary]}
                onPress={pickFromLibrary}
                activeOpacity={0.85}
              >
                <Ionicons name="images" size={22} color="#FFFFFF" />
                <Text style={styles.ctaLabel}>Choose from library</Text>
                <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
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

  musicAnchor: {
    marginTop: 12,
    alignItems: 'center',
  },
  addMusicBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#7C3AED',
    borderRadius: 28,
    paddingVertical: 10,
    paddingHorizontal: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  addMusicBtnLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  changeMusicBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  changeMusicBtnLabel: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },

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

  bottomOverlay: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  dismissArea: { flex: 1 },
  captionInput: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    color: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 48,
    maxHeight: 120,
    textAlignVertical: 'top',
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  shareIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  shareAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  shareAvatarFallback: {
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareAvatarInitial: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  shareIdentityLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 28,
    backgroundColor: '#7C3AED',
    minWidth: 110,
    justifyContent: 'center',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  sendBtnDisabled: {
    backgroundColor: '#3A3A3A',
    shadowOpacity: 0,
    elevation: 0,
  },
  sendBtnLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },

  chooserScreen: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  chooserTopRow: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 4,
  },
  chooserCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#121212',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chooserBody: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 28,
  },
  heroCanvas: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  heroCameraBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCaption: {
    marginTop: 14,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 11,
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
  },
  eyebrow: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 11,
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 8,
  },
  headline: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 30,
    marginBottom: 24,
  },
  ctaStack: {
    gap: 12,
  },
  ctaBtn: {
    height: 58,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: 12,
  },
  ctaPrimary: {
    backgroundColor: '#7C3AED',
  },
  ctaSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  ctaLabel: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
