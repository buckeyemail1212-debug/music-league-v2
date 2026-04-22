import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  Modal,
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../src/context/AuthContext';
import {
  deleteAccount,
  clearPastLeagues,
} from '../src/services/api';
import { leagueEvents } from '../src/utils/leagueEvents';

function formatJoinDate(created?: string): string {
  if (!created) return '';
  const d = new Date(created.endsWith('Z') || created.includes('+') ? created : created + 'Z');
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export default function SettingsPage() {
  const router = useRouter();
  const { user, logout, updateUser } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  const [legalOpen, setLegalOpen] = useState<null | 'privacy' | 'terms'>(null);
  const [clearBusy, setClearBusy] = useState(false);
  const [clearSuccess, setClearSuccess] = useState(false);

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
      } finally {
        setUploading(false);
      }
    }
  };

  const handleChangePhoto = () => {
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

  const openEdit = () => {
    setEditName(user?.display_name || user?.username || '');
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    const trimmed = editName.trim();
    if (!trimmed) {
      Alert.alert('Error', 'Username cannot be empty.');
      return;
    }
    if (trimmed === (user?.display_name ?? user?.username ?? '')) {
      setEditOpen(false);
      return;
    }
    setSaving(true);
    try {
      await updateUser({ username: trimmed, display_name: trimmed });
      setEditOpen(false);
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

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
              await AsyncStorage.clear();
              await logout();
              router.replace('/(auth)/login');
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to delete account');
            }
          },
        },
      ],
    );
  };

  const handleClearPast = () => {
    Alert.alert(
      'Clear past leagues?',
      'This will permanently delete all past league data from your history — finished leagues, deleted leagues, and the songs you submitted in them. Active leagues are not affected. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear history',
          style: 'destructive',
          onPress: async () => {
            setClearBusy(true);
            try {
              await clearPastLeagues();
              // Notify the home screen so the past-leagues list refreshes.
              leagueEvents.emit();
              setClearSuccess(true);
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.detail || 'Failed to clear history');
            } finally {
              setClearBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.headerBtn}
        >
          <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>SETTINGS</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Profile header */}
        <View style={styles.profileBlock}>
          <TouchableOpacity
            onPress={handleChangePhoto}
            activeOpacity={0.8}
            style={styles.avatarWrap}
          >
            <View style={styles.avatar}>
              {uploading ? (
                <ActivityIndicator color="#7C3AED" />
              ) : user?.profile_photo ? (
                <Image source={{ uri: user.profile_photo }} style={styles.avatarImg} />
              ) : (
                <Ionicons name="person" size={40} color="#7C3AED" />
              )}
            </View>
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={14} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
          <Text style={styles.profileName}>
            {user?.display_name || user?.username}
          </Text>
          <Text style={styles.profileJoin}>
            Joined {formatJoinDate(user?.created_at)}
          </Text>
          <TouchableOpacity style={styles.editBtn} onPress={openEdit} activeOpacity={0.85}>
            <Ionicons name="create-outline" size={14} color="#FFFFFF" />
            <Text style={styles.editBtnText}>Edit username</Text>
          </TouchableOpacity>
        </View>

        {/* How to Play */}
        <Text style={styles.sectionLabel}>How to Play</Text>
        <View style={styles.group}>
          <Row
            icon="help-circle-outline"
            label="How to Play"
            onPress={() => router.push('/how-to-play' as any)}
            last
          />
        </View>

        {/* Legal */}
        <Text style={styles.sectionLabel}>Legal</Text>
        <View style={styles.group}>
          <Row
            icon="document-text-outline"
            label="Terms of service"
            onPress={() => setLegalOpen('terms')}
          />
          <Separator />
          <Row
            icon="shield-outline"
            label="Privacy policy"
            onPress={() => setLegalOpen('privacy')}
            last
          />
        </View>

        {/* Danger */}
        <Text style={styles.sectionLabel}>Danger zone</Text>
        <View style={styles.group}>
          <Row
            icon="log-out-outline"
            label="Log out"
            danger
            onPress={handleLogout}
          />
          <Separator />
          <Row
            icon="trash-bin-outline"
            label={clearBusy ? 'Clearing...' : 'Clear past leagues'}
            danger
            onPress={handleClearPast}
            disabled={clearBusy}
          />
          <Separator />
          <Row
            icon="close-circle-outline"
            label="Delete account"
            danger
            onPress={handleDeleteAccount}
            last
          />
        </View>

        <Text style={styles.version}>Fantasy Music League v1.0</Text>
      </ScrollView>

      {/* Edit username modal */}
      <Modal
        visible={editOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEditOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.overlay}
        >
          <View style={styles.popup}>
            <Text style={styles.popupTitle}>Edit username</Text>
            <Text style={styles.popupLabel}>USERNAME</Text>
            <TextInput
              value={editName}
              onChangeText={setEditName}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              style={styles.popupInput}
            />
            <TouchableOpacity
              style={styles.popupSave}
              onPress={handleSaveEdit}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.popupSaveText}>Save</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.popupCancel}
              onPress={() => setEditOpen(false)}
              disabled={saving}
            >
              <Text style={styles.popupCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Legal modal */}
      <Modal
        visible={legalOpen !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setLegalOpen(null)}
      >
        <View style={styles.overlay}>
          <View style={styles.popup}>
            <Text style={styles.popupTitle}>
              {legalOpen === 'privacy' ? 'Privacy policy' : 'Terms of service'}
            </Text>
            <ScrollView style={{ maxHeight: 280 }}>
              <Text style={styles.legalBody}>
                {legalOpen === 'privacy'
                  ? 'Fantasy Music League collects your email address, display name, and profile photo to provide the app experience. We do not sell your data to third parties. Song submissions and votes are stored to calculate league results. You can delete your account and all associated data at any time from this screen. By using this app you agree to these terms.'
                  : 'Fantasy Music League is provided for entertainment purposes. You are responsible for the content you submit including song selections and chat messages. We reserve the right to suspend accounts that violate community standards. Song previews are provided by Deezer for personal use only. We may update these terms at any time and continued use of the app constitutes acceptance.'}
              </Text>
            </ScrollView>
            <TouchableOpacity
              style={styles.popupSave}
              onPress={() => setLegalOpen(null)}
            >
              <Text style={styles.popupSaveText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Clear past leagues success modal */}
      <Modal
        visible={clearSuccess}
        transparent
        animationType="fade"
        onRequestClose={() => setClearSuccess(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.popup}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={48} color="#10B981" />
            </View>
            <Text style={styles.successTitle}>History cleared</Text>
            <Text style={styles.successBody}>
              All past league data has been permanently deleted.
            </Text>
            <TouchableOpacity
              style={styles.popupSave}
              onPress={() => setClearSuccess(false)}
            >
              <Text style={styles.popupSaveText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Row({
  icon,
  label,
  onPress,
  danger,
  last,
  disabled,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, last && styles.rowLast]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <View style={styles.rowLeft}>
        <Ionicons
          name={icon}
          size={20}
          color={danger ? '#EF4444' : '#B3B3B3'}
        />
        <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
      </View>
      {!danger && <Ionicons name="chevron-forward" size={18} color="#6A6A6A" />}
    </TouchableOpacity>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerBtn: { padding: 6 },
  headerTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: '#FFFFFF',
  },
  scroll: { paddingBottom: 60 },

  profileBlock: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 24,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#181818',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#121212',
  },
  profileName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 14,
  },
  profileJoin: {
    fontSize: 13,
    color: '#B3B3B3',
    marginTop: 4,
  },
  editBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  editBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B3B3B3',
    letterSpacing: 1.2,
    marginHorizontal: 20,
    marginTop: 18,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  group: {
    marginHorizontal: 20,
    backgroundColor: '#181818',
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  rowLast: {},
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  rowLabel: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  rowLabelDanger: {
    color: '#EF4444',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginLeft: 50,
  },
  version: {
    fontSize: 11,
    color: '#6A6A6A',
    textAlign: 'center',
    marginTop: 24,
  },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  popup: {
    backgroundColor: '#282828',
    borderRadius: 14,
    padding: 20,
  },
  popupTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  popupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B3B3B3',
    letterSpacing: 1,
    marginBottom: 8,
  },
  popupInput: {
    backgroundColor: '#3E3E3E',
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    color: '#FFFFFF',
    marginBottom: 18,
  },
  popupSave: {
    backgroundColor: '#7C3AED',
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  popupSaveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  popupCancel: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  popupCancelText: { color: '#B3B3B3', fontSize: 13, fontWeight: '600' },
  legalBody: {
    color: '#D9D9D9',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 16,
  },

  successIcon: {
    alignItems: 'center',
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  successBody: {
    fontSize: 14,
    color: '#B3B3B3',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
});
