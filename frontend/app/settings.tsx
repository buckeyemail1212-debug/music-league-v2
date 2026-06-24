import React, { useCallback, useEffect, useState } from 'react';
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
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../src/context/AuthContext';
import ExpandableImage from '../src/components/ExpandableImage';
import {
  clearAccountData,
  deleteAccountFull,
  getFollowCounts,
  FollowCounts,
} from '../src/services/api';
import { apiCache } from '../src/services/apiCache';
import { leagueEvents } from '../src/utils/leagueEvents';
import { colors } from '../src/theme/colors';

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
  const [deleteBusy, setDeleteBusy] = useState(false);
  // Confirm modals for destructive account actions. Two separate flags
  // so the two modals can differ in copy / CTA color.
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const [followCounts, setFollowCounts] = useState<FollowCounts | null>(null);
  // Toggle state is sourced from the auth context (which already reflects
  // is_private from the server). Local mirror lets us flip optimistically
  // and roll back on PATCH failure without waiting for a context update.
  const [isPrivate, setIsPrivate] = useState<boolean>(!!user?.is_private);
  const [privacyBusy, setPrivacyBusy] = useState(false);

  useEffect(() => {
    setIsPrivate(!!user?.is_private);
  }, [user?.is_private]);

  const loadFollowCounts = useCallback(() => {
    const userId = user?.id;
    if (!userId) return;
    apiCache
      .swr(
        `follow-counts:${userId}`,
        () => getFollowCounts(userId).then((r) => r.data.data),
        setFollowCounts,
      )
      .then(setFollowCounts)
      .catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    loadFollowCounts();
  }, [loadFollowCounts]);

  const handleTogglePrivate = async (next: boolean) => {
    if (privacyBusy) return;
    const prev = isPrivate;
    setIsPrivate(next);
    setPrivacyBusy(true);
    try {
      // updateUser pushes the change to PUT /api/auth/me and refreshes
      // both AsyncStorage and the auth context. The route accepts PATCH
      // as well, but the existing helper uses PUT; the backend handler
      // is shared so the wire result is identical.
      await updateUser({ is_private: next });
    } catch (e: any) {
      setIsPrivate(prev);
      Alert.alert(
        'Could not update',
        e?.response?.data?.detail || 'Please try again.',
      );
    } finally {
      setPrivacyBusy(false);
    }
  };

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

  // --- Destructive account actions ----------------------------------
  // Both actions use a custom in-screen Modal (not Alert.alert) so the
  // copy and CTA colors match the spec exactly: purple "Clear Data"
  // button vs red "Delete Account" button.

  const confirmClearData = async () => {
    setClearConfirmOpen(false);
    setClearBusy(true);
    try {
      await clearAccountData();
      // Past leagues list + My Game stats both key off server state, so
      // fan out a league-events tick to force the home/profile tabs to
      // refetch when they focus next.
      leagueEvents.emit();
      setClearSuccess(true);
    } catch (e: any) {
      Alert.alert(
        'Error',
        e?.response?.data?.detail || 'Failed to clear account data',
      );
    } finally {
      setClearBusy(false);
    }
  };

  const confirmDeleteAccount = async () => {
    setDeleteConfirmOpen(false);
    setDeleteBusy(true);
    try {
      await deleteAccountFull();
      // Flush any locally cached state so the freshly-signed-up user
      // doesn't inherit stale preferences from the previous account.
      await AsyncStorage.clear();
      await logout();
      router.replace('/(auth)/login');
    } catch (e: any) {
      Alert.alert(
        'Error',
        e?.response?.data?.detail || 'Failed to delete account',
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.headerBtn}
        >
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>SETTINGS</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Profile header */}
        <View style={styles.profileBlock}>
          {/* Short-press: photo picker (existing). Long-press: expand
              via ExpandableImage. Replaces the prior TouchableOpacity
              wrapper. */}
          <ExpandableImage
            source={user?.profile_photo ? { uri: user.profile_photo } : null}
            onShortPress={handleChangePhoto}
            style={styles.avatarWrap}
          >
            <View style={styles.avatar}>
              {uploading ? (
                <ActivityIndicator color={colors.accent} />
              ) : user?.profile_photo ? (
                <Image source={{ uri: user.profile_photo }} style={styles.avatarImg} />
              ) : (
                <Ionicons name="person" size={40} color={colors.accent} />
              )}
            </View>
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={14} color={colors.onAccent} />
            </View>
          </ExpandableImage>
          <Text style={styles.profileName}>
            {user?.display_name || user?.username}
          </Text>
          {user?.email ? (
            <Text style={styles.profileEmail} numberOfLines={1}>
              {user.email}
            </Text>
          ) : null}
          <TouchableOpacity style={styles.editChip} onPress={openEdit} activeOpacity={0.85}>
            <Text style={styles.editChipText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* Followers / Following counts — moved here from My Game; tap to
            open the existing list screens. Em-dash placeholder while
            follow-counts:${userId} is still in flight. */}
        {user?.id ? (
          <View style={styles.followCountsRow}>
            <TouchableOpacity
              style={styles.followCountItem}
              activeOpacity={0.7}
              onPress={() => router.push(`/user/${user.id}/followers` as any)}
            >
              <Text style={styles.followCountValue}>
                {followCounts ? followCounts.followers.toLocaleString() : '—'}
              </Text>
              <Text style={styles.followCountLabel}>Followers</Text>
            </TouchableOpacity>
            <View style={styles.followCountDivider} />
            <TouchableOpacity
              style={styles.followCountItem}
              activeOpacity={0.7}
              onPress={() => router.push(`/user/${user.id}/following` as any)}
            >
              <Text style={styles.followCountValue}>
                {followCounts ? followCounts.following.toLocaleString() : '—'}
              </Text>
              <Text style={styles.followCountLabel}>Following</Text>
            </TouchableOpacity>
          </View>
        ) : null}

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

        {/* Account */}
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.group}>
          <SwitchRow
            icon="lock-closed-outline"
            label="Private account"
            value={isPrivate}
            onValueChange={handleTogglePrivate}
            disabled={privacyBusy}
          />
          <Separator />
          <Row
            icon="archive-outline"
            label="Archived Vibes"
            onPress={() => router.push('/archived-vibes' as any)}
          />
          <Separator />
          <Row
            icon="log-out-outline"
            label="Log out"
            onPress={handleLogout}
            last
          />
        </View>
        <Text style={styles.helperCaption}>
          Only approved followers can see your stats, leagues, and submissions when private.
        </Text>

        {/* Blocked accounts — between Account and Danger Zone so it's
            easy to find without sitting next to the destructive
            actions. */}
        <Text style={styles.sectionLabel}>Blocked accounts</Text>
        <View style={styles.group}>
          <Row
            icon="ban-outline"
            label="Blocked accounts"
            onPress={() => router.push('/blocked-accounts' as any)}
            last
          />
        </View>

        {/* Danger */}
        <Text style={styles.sectionLabel}>Danger zone</Text>
        <View style={styles.group}>
          <Row
            icon="trash-bin-outline"
            label={clearBusy ? 'Clearing...' : 'Clear account data'}
            danger
            onPress={() => setClearConfirmOpen(true)}
            disabled={clearBusy || deleteBusy}
          />
          <Separator />
          <Row
            icon="close-circle-outline"
            label={deleteBusy ? 'Deleting…' : 'Delete account'}
            danger
            onPress={() => setDeleteConfirmOpen(true)}
            disabled={clearBusy || deleteBusy}
            last
          />
        </View>

        <Text style={styles.version}>Riff v1.0</Text>
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
                <ActivityIndicator color={colors.onAccent} />
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
                  ? 'Riff collects your email address, display name, and profile photo to provide the app experience. We do not sell your data to third parties. Song submissions and votes are stored to calculate league results. You can delete your account and all associated data at any time from this screen. By using this app you agree to these terms.'
                  : 'Riff is provided for entertainment purposes. You are responsible for the content you submit including song selections and chat messages. We reserve the right to suspend accounts that violate community standards. Song previews are provided by Deezer for personal use only. We may update these terms at any time and continued use of the app constitutes acceptance.'}
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

      {/* Clear account data — confirm modal */}
      <Modal
        visible={clearConfirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setClearConfirmOpen(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.popup}>
            <Text style={styles.popupTitle}>Clear account data?</Text>
            <Text style={styles.confirmBody}>
              This permanently deletes your past leagues, Your Taste, recent
              submissions, and My Game stats. Active leagues you're in will
              not be affected. This cannot be undone.
            </Text>
            <View style={styles.confirmRow}>
              <TouchableOpacity
                style={styles.confirmCancel}
                onPress={() => setClearConfirmOpen(false)}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmCta, styles.confirmCtaPurple]}
                onPress={confirmClearData}
                disabled={clearBusy}
              >
                {clearBusy ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <Text style={styles.confirmCtaText}>Clear Data</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete account — confirm modal */}
      <Modal
        visible={deleteConfirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteConfirmOpen(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.popup}>
            <Text style={styles.popupTitle}>Delete your account?</Text>
            <Text style={styles.confirmBody}>
              This permanently deletes your account and all your data. You'll
              be removed from all active leagues. If you sign up with this
              email again, you'll start fresh. This cannot be undone.
            </Text>
            <View style={styles.confirmRow}>
              <TouchableOpacity
                style={styles.confirmCancel}
                onPress={() => setDeleteConfirmOpen(false)}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmCta, styles.confirmCtaRed]}
                onPress={confirmDeleteAccount}
                disabled={deleteBusy}
              >
                {deleteBusy ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <Text style={styles.confirmCtaText}>Delete Account</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Clear account data — success modal */}
      <Modal
        visible={clearSuccess}
        transparent
        animationType="fade"
        onRequestClose={() => setClearSuccess(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.popup}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={48} color={colors.success} />
            </View>
            <Text style={styles.successTitle}>Data cleared</Text>
            <Text style={styles.successBody}>
              Your past leagues, Your Taste, recent submissions, and stats
              have been permanently deleted.
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
          color={danger ? colors.danger : colors.textSecondary}
        />
        <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
      </View>
      {!danger && <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />}
    </TouchableOpacity>
  );
}

function SwitchRow({
  icon,
  label,
  value,
  onValueChange,
  disabled,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={20} color={colors.textSecondary} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.surface3, true: colors.accent }}
        thumbColor={colors.onAccent}
        ios_backgroundColor={colors.surface3}
      />
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
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
    color: colors.textPrimary,
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
    backgroundColor: colors.surface2,
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
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  profileName: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 14,
  },
  profileEmail: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
    maxWidth: '90%',
  },
  editChip: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  editChipText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textTertiary,
    letterSpacing: 1.2,
    marginHorizontal: 20,
    marginTop: 18,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  group: {
    marginHorizontal: 20,
    backgroundColor: colors.surface2,
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
    color: colors.textPrimary,
    fontWeight: '500',
  },
  rowLabelDanger: {
    color: colors.danger,
  },
  separator: {
    height: 1,
    backgroundColor: colors.borderFaint,
    marginLeft: 50,
  },

  followCountsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -8,
    marginBottom: 8,
    paddingHorizontal: 20,
    gap: 28,
  },
  followCountItem: { alignItems: 'center', minWidth: 80 },
  followCountValue: {
    fontSize: 18, fontWeight: '800', color: colors.textPrimary,
  },
  followCountLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textSecondary,
    letterSpacing: 0.8, marginTop: 2, textTransform: 'uppercase',
  },
  followCountDivider: {
    width: 1, height: 28, backgroundColor: colors.border,
  },

  helperCaption: {
    fontSize: 12,
    color: colors.textTertiary,
    lineHeight: 17,
    marginHorizontal: 20,
    marginTop: 8,
  },
  version: {
    fontSize: 11,
    color: colors.textTertiary,
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
    backgroundColor: colors.surface3,
    borderRadius: 14,
    padding: 20,
  },
  popupTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  popupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 8,
  },
  popupInput: {
    backgroundColor: colors.surface4,
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: 18,
  },
  popupSave: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  popupSaveText: { color: colors.onAccent, fontSize: 14, fontWeight: '700' },
  popupCancel: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  popupCancelText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  legalBody: {
    color: colors.textSecondary,
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
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  successBody: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },

  // Destructive-action confirm modals.
  confirmBody: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 18,
  },
  confirmRow: {
    flexDirection: 'row',
    gap: 10,
  },
  confirmCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: colors.surface4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelText: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  confirmCta: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCtaPurple: {
    backgroundColor: colors.accent,
  },
  confirmCtaRed: {
    backgroundColor: colors.danger,
  },
  confirmCtaText: {
    color: colors.onAccent,
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.5,
  },
});
