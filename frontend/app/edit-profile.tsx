import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ActionSheetIOS,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../src/context/AuthContext';
import ExpandableImage from '../src/components/ExpandableImage';
import { colors } from '../src/theme/colors';

const PRONOUNS_MAX = 30;
const BIO_MAX = 75;

export default function EditProfileScreen() {
  const router = useRouter();
  const { user, updateUser } = useAuth();

  // Local mirror of editable fields — initialised from the auth context
  // on first render so we render the current values immediately.
  const [name, setName] = useState<string>(user?.display_name ?? user?.username ?? '');
  const [username, setUsername] = useState<string>(user?.username ?? '');
  const [pronouns, setPronouns] = useState<string>(user?.pronouns ?? '');
  const [bio, setBio] = useState<string>(user?.bio ?? '');

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Photo picker — mirrors the existing flow on settings.tsx so the
  // visual treatment / permission prompts feel identical.
  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant photo library permissions.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      setUploading(true);
      try {
        await updateUser({ profile_photo: `data:image/jpeg;base64,${result.assets[0].base64}` });
      } catch (e: any) {
        Alert.alert('Error', e?.response?.data?.detail || 'Failed to update photo');
      } finally {
        setUploading(false);
      }
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant camera permissions.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      setUploading(true);
      try {
        await updateUser({ profile_photo: `data:image/jpeg;base64,${result.assets[0].base64}` });
      } catch (e: any) {
        Alert.alert('Error', e?.response?.data?.detail || 'Failed to update photo');
      } finally {
        setUploading(false);
      }
    }
  };

  const handleEditPhoto = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take Photo', 'Choose from Library'], cancelButtonIndex: 0 },
        (i) => {
          if (i === 1) takePhoto();
          else if (i === 2) pickFromGallery();
        },
      );
    } else {
      Alert.alert('Change Profile Photo', '', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take Photo', onPress: takePhoto },
        { text: 'Choose from Library', onPress: pickFromGallery },
      ]);
    }
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    const trimmedUsername = username.trim();
    const trimmedPronouns = pronouns.trim();
    const trimmedBio = bio.trim();

    if (!trimmedName) {
      Alert.alert('Error', 'Name cannot be empty.');
      return;
    }
    if (!trimmedUsername) {
      Alert.alert('Error', 'Username cannot be empty.');
      return;
    }
    if (trimmedPronouns.length > PRONOUNS_MAX) {
      Alert.alert('Error', `Pronouns must be ${PRONOUNS_MAX} characters or fewer.`);
      return;
    }
    if (trimmedBio.length > BIO_MAX) {
      Alert.alert('Error', `Bio must be ${BIO_MAX} characters or fewer.`);
      return;
    }

    setSaving(true);
    try {
      await updateUser({
        username: trimmedUsername,
        display_name: trimmedName,
        pronouns: trimmedPronouns,
        bio: trimmedBio,
      });
      router.back();
    } catch (e: any) {
      const status = e?.response?.status;
      const detail: string = e?.response?.data?.detail || '';
      if (status === 409 || (status === 400 && /taken/i.test(detail))) {
        Alert.alert(
          'Username Taken',
          'That username is already taken. Please choose a different one.',
        );
      } else {
        Alert.alert('Error', detail || 'Failed to update profile');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar block */}
          <View style={styles.avatarBlock}>
            {/* Short-press wires the existing photo picker; long-press
                fires the expand modal via ExpandableImage. */}
            <ExpandableImage
              source={user?.profile_photo ? { uri: user.profile_photo } : null}
              onShortPress={handleEditPhoto}
              style={styles.avatarWrap}
            >
              <View style={styles.avatar}>
                {uploading ? (
                  <ActivityIndicator color={colors.accent} />
                ) : user?.profile_photo ? (
                  <Image source={{ uri: user.profile_photo }} style={styles.avatarImg} />
                ) : (
                  <Ionicons name="person" size={48} color={colors.accent} />
                )}
              </View>
            </ExpandableImage>
            <TouchableOpacity onPress={handleEditPhoto} hitSlop={8}>
              <Text style={styles.editPhotoLink}>Edit photo</Text>
            </TouchableOpacity>
          </View>

          {/* Form fields */}
          <View style={styles.form}>
            <Field label="Name" value={name} onChangeText={setName} placeholder="Your name" />
            <Field
              label="Username"
              value={username}
              onChangeText={setUsername}
              placeholder="username"
              autoCapitalize="none"
            />
            <Field
              label="Pronouns"
              value={pronouns}
              onChangeText={(t) => setPronouns(t.slice(0, PRONOUNS_MAX))}
              placeholder="e.g. she/her"
              maxLength={PRONOUNS_MAX}
              showCounter
              counterCurrent={pronouns.trim().length}
              counterMax={PRONOUNS_MAX}
            />
            <Field
              label="Bio"
              value={bio}
              onChangeText={(t) => setBio(t.slice(0, BIO_MAX))}
              placeholder="Tell people about yourself"
              maxLength={BIO_MAX}
              multiline
              showCounter
              counterCurrent={bio.trim().length}
              counterMax={BIO_MAX}
            />
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  autoCapitalize,
  maxLength,
  showCounter,
  counterCurrent,
  counterMax,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences';
  maxLength?: number;
  showCounter?: boolean;
  counterCurrent?: number;
  counterMax?: number;
}) {
  return (
    <View style={styles.fieldGroup}>
      <View style={styles.fieldHeaderRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {showCounter && counterMax !== undefined ? (
          <Text style={styles.fieldCounter}>
            {(counterCurrent ?? 0)}/{counterMax}
          </Text>
        ) : null}
      </View>
      <TextInput
        style={[styles.fieldInput, multiline && styles.fieldInputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textPlaceholder}
        multiline={!!multiline}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        autoCorrect={!multiline ? false : undefined}
        maxLength={maxLength}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: { paddingBottom: 48 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerBtn: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  headerSpacer: { minWidth: 40 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },

  avatarBlock: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 24,
  },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 120, height: 120, borderRadius: 60 },
  editPhotoLink: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 12,
  },

  form: { paddingHorizontal: 20 },
  fieldGroup: { marginBottom: 18 },
  fieldHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  fieldCounter: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textTertiary,
  },
  fieldInput: {
    backgroundColor: colors.surface3,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
  },
  fieldInputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },

  saveBtn: {
    marginTop: 8,
    marginHorizontal: 20,
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: colors.onAccent, fontSize: 14, fontWeight: '800', letterSpacing: 0.4 },
});
