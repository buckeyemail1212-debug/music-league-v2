import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Modal,
  Image,
  ActivityIndicator,
  ActionSheetIOS,
  Platform,
  Alert,
  Linking,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../src/context/AuthContext';
import {
  deleteAccount,
  getLeagues,
  getUserStats,
  getLeagueStandings,
  getMySubmissions,
  updateProfile,
  getDeletedLeagues,
  restoreLeague,
  getLifetimeStats,
  getUserTaste,
  MySubmission,
  UserStats,
  DeletedLeague,
  LifetimeStats,
  TasteBreakdown,
} from '../../src/services/api';
import { leagueEvents } from '../../src/utils/leagueEvents';
import AlbumArt from '../../src/components/AlbumArt';

const HOW_TO_PLAY_STEPS = [
  'Create a league or join one with a code',
  'Submit a song matching the round\'s theme',
  'Vote on songs by ranking them best to worst',
  'See who wins when voting ends!',
];

const getLikedKey = (userId: string) => `liked_songs_${userId}`;

const getMusicTitle = (wins: number): string => {
  if (wins >= 10) return 'The Champion';
  if (wins >= 5) return 'The Maestro';
  if (wins >= 3) return 'The Curator';
  if (wins >= 1) return 'The Enthusiast';
  return 'The Newcomer';
};

const getJoinedYear = (createdAt?: string): string => {
  if (!createdAt) return '';
  const d = new Date(createdAt.endsWith('Z') || createdAt.includes('+') ? createdAt : createdAt + 'Z');
  if (isNaN(d.getTime())) return '';
  return `'${String(d.getFullYear()).slice(-2)}`;
};

const TASTE_COLORS: Record<string, string> = {
  Indie: '#7C3AED',
  Electronic: '#14B8A6',
  'Hip-Hop': '#F97316',
  'R&B': '#EC4899',
  Pop: '#EF4444',
  Country: '#F59E0B',
  Rock: '#3B82F6',
  Other: '#6A6A6A',
};

const SUBMISSION_COLORS = ['#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899'];
const pickColor = (seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) >>> 0;
  return SUBMISSION_COLORS[h % SUBMISSION_COLORS.length];
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface LikedSong {
  deezer_id: number;
  title: string;
  artist: string;
  album?: string;
  cover_url?: string;
  preview_url?: string;
}

// ─── LikedSongRow ─────────────────────────────────────────────────────────────

function LikedSongRow({ song, onUnlike }: { song: LikedSong; onUnlike: () => void }) {
  const q = encodeURIComponent(`${song.title} ${song.artist}`);
  const open = (service: 'spotify' | 'apple' | 'youtube') => {
    const urls: Record<string, string> = {
      spotify: `https://open.spotify.com/search/${q}`,
      apple:   `https://music.apple.com/search?term=${q}`,
      youtube: `https://www.youtube.com/results?search_query=${q}`,
    };
    Linking.openURL(urls[service]);
  };

  return (
    <View style={likedStyles.row}>
      <AlbumArt uri={song.cover_url ?? ''} size={44} borderRadius={4} />
      <View style={likedStyles.info}>
        <Text style={likedStyles.title} numberOfLines={1}>{song.title}</Text>
        <Text style={likedStyles.artist} numberOfLines={1}>{song.artist}</Text>
        <View style={likedStyles.links}>
          <TouchableOpacity
            style={[likedStyles.linkBtn, { backgroundColor: '#1DB954' }]}
            onPress={() => open('spotify')}
          >
            <FontAwesome name="spotify" size={11} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[likedStyles.linkBtn, { backgroundColor: '#FA243C' }]}
            onPress={() => open('apple')}
          >
            <Ionicons name="logo-apple" size={11} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[likedStyles.linkBtn, { backgroundColor: '#FF0000' }]}
            onPress={() => open('youtube')}
          >
            <Ionicons name="logo-youtube" size={11} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity style={likedStyles.trashBtn} onPress={onUnlike} hitSlop={8}>
        <Ionicons name="trash-outline" size={20} color="#6A6A6A" />
      </TouchableOpacity>
    </View>
  );
}

// ─── ProfileScreen ────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { user, logout, updateUser } = useAuth();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const [uploading, setUploading] = useState(false);
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen]     = useState(false);
  const [termsOpen, setTermsOpen]         = useState(false);

  // Stats counts
  const [leaguesCount, setLeaguesCount] = useState(0);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [totalPoints, setTotalPoints] = useState(0);
  const [mySubmissions, setMySubmissions] = useState<MySubmission[]>([]);
  const [deletedLeagues, setDeletedLeagues] = useState<DeletedLeague[]>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [lifetimeStats, setLifetimeStats] = useState<LifetimeStats | null>(null);
  const [taste, setTaste] = useState<TasteBreakdown | null>(null);

  // Edit profile modal
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const [leaguesRes, statsRes, subsRes, deletedRes, lifetimeRes, tasteRes] = await Promise.all([
        getLeagues(),
        getUserStats().catch(() => null),
        getMySubmissions().catch(() => null),
        getDeletedLeagues().catch(() => null),
        getLifetimeStats().catch(() => null),
        getUserTaste().catch(() => null),
      ]);
      setLeaguesCount(leaguesRes.data.length);
      setUserStats(statsRes?.data ?? null);
      setMySubmissions(subsRes?.data?.submissions ?? []);
      setDeletedLeagues(deletedRes?.data?.leagues ?? []);
      setLifetimeStats(lifetimeRes?.data ?? null);
      setTaste(tasteRes?.data ?? null);

      // Fall back to summed active-league standings so the display works the
      // first time before the server's all_time_points has been finalized.
      let pts = 0;
      await Promise.all(leaguesRes.data.map(async (l) => {
        try {
          const sr = await getLeagueStandings(l.id);
          const mine = sr.data.standings.find((s) => s.user_id === user?.id);
          if (mine) pts += mine.total_points;
        } catch {}
      }));
      setTotalPoints(Math.max(lifetimeRes?.data?.all_time_points ?? 0, pts));
    } catch {}
  }, [user?.id]);

  const handleRestoreLeague = async (league: DeletedLeague) => {
    if (restoringId) return;
    setRestoringId(league.id);
    try {
      await restoreLeague(league.id);
      setDeletedLeagues(prev => prev.filter(d => d.id !== league.id));
      leagueEvents.emit();
      Alert.alert('Restored', `${league.name} has been restored.`);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.detail || 'Failed to restore league');
    } finally {
      setRestoringId(null);
    }
  };

  const daysLeft = (expiresAt: string): number => {
    const ms = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86400000));
  };

  // Liked songs
  const [likedSongs, setLikedSongs] = useState<LikedSong[]>([]);
  const [showLiked, setShowLiked] = useState(false);

  // Load liked songs
  const loadLikedSongs = useCallback(async () => {
    if (!user?.id) { setLikedSongs([]); return; }
    try {
      const raw = await AsyncStorage.getItem(getLikedKey(user.id));
      if (raw) {
        const parsed = JSON.parse(raw);
        // Ensure it's Song objects not legacy string IDs
        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
          setLikedSongs(parsed);
        } else {
          setLikedSongs([]);
        }
      } else {
        setLikedSongs([]);
      }
    } catch {
      setLikedSongs([]);
    }
  }, [user?.id]);

  // Reload liked songs + stats whenever the tab gains focus
  useFocusEffect(useCallback(() => {
    loadLikedSongs();
    loadStats();
  }, [loadLikedSongs, loadStats]));

  const unlikeSong = async (song: LikedSong) => {
    if (!user?.id) return;
    const next = likedSongs.filter(s => s.deezer_id !== song.deezer_id);
    setLikedSongs(next);
    await AsyncStorage.setItem(getLikedKey(user.id), JSON.stringify(next)).catch(() => {});
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
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const pickFromGallery = async () => {
    try {
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
        await updateUser({ profile_photo: `data:image/jpeg;base64,${result.assets[0].base64}` });
        setUploading(false);
      }
    } catch {
      setUploading(false);
    }
  };

  const takePhoto = async () => {
    try {
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
        await updateUser({ profile_photo: `data:image/jpeg;base64,${result.assets[0].base64}` });
        setUploading(false);
      }
    } catch {
      setUploading(false);
    }
  };

  const openEdit = () => {
    setEditName(user?.display_name || user?.username || '');
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    const trimmed = editName.trim();
    if (!trimmed) { Alert.alert('Error', 'Name cannot be empty.'); return; }
    setSavingEdit(true);
    try {
      await updateProfile({ username: trimmed });
      await updateUser({ username: trimmed });
      setEditOpen(false);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.detail || 'Failed to update profile');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleChangePhoto = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take Photo', 'Choose from Library'], cancelButtonIndex: 0 },
        (i) => { if (i === 1) takePhoto(); else if (i === 2) pickFromGallery(); }
      );
    } else {
      Alert.alert('Change Profile Photo', 'Choose an option', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take Photo', onPress: takePhoto },
        { text: 'Choose from Library', onPress: pickFromGallery },
      ]);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Profile header ── */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarRow}>
            <View style={styles.avatarWrapper}>
              <View style={styles.avatarContainer}>
                {uploading ? (
                  <ActivityIndicator size="large" color="#7C3AED" />
                ) : user?.profile_photo ? (
                  <Image source={{ uri: user.profile_photo }} style={styles.avatarImage} />
                ) : (
                  <Ionicons name="person" size={44} color="#7C3AED" />
                )}
              </View>
              <TouchableOpacity
                style={styles.cameraOverlay}
                onPress={handleChangePhoto}
                disabled={uploading}
                activeOpacity={0.8}
              >
                <Ionicons name="camera" size={14} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <View style={styles.avatarInfo}>
              <Text style={styles.profileName} numberOfLines={1}>
                {user?.display_name || user?.username}
              </Text>
            </View>
            <TouchableOpacity style={styles.editBtn} onPress={openEdit} activeOpacity={0.7}>
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>

          {/* ── Stats row ── */}
          <View style={styles.statsCard}>
            <View style={styles.statCol}>
              <Text style={styles.statNumber}>{userStats?.leagues_count ?? leaguesCount}</Text>
              <Text style={styles.statLabel}>LEAGUES</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCol}>
              <Text style={styles.statNumber}>
                {Math.max(lifetimeStats?.all_time_points ?? 0, totalPoints)}
              </Text>
              <Text style={styles.statLabel}>TOTAL PTS</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCol}>
              <Text style={styles.statNumber}>
                {Math.max(lifetimeStats?.total_wins ?? 0, userStats?.total_wins ?? 0)}
              </Text>
              <Text style={styles.statLabel}>WINS</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCol}>
              <Text style={styles.statNumber}>
                {Math.max(
                  lifetimeStats?.total_submissions ?? 0,
                  mySubmissions.length,
                  userStats?.rounds_played ?? 0,
                )}
              </Text>
              <Text style={styles.statLabel}>SUBMISSIONS</Text>
            </View>
          </View>
        </View>

        {/* ── Recent Submissions ── */}
        {mySubmissions.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>RECENT SUBMISSIONS</Text>
            <View style={styles.group}>
              {mySubmissions.slice(0, 5).map((sub, idx, arr) => {
                const last = idx === arr.length - 1;
                return (
                  <TouchableOpacity
                    key={sub.submission_id}
                    style={[styles.submissionRow, last && styles.rowLast]}
                    onPress={() => router.push(`/round/${sub.round_id}`)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.submissionArt, { backgroundColor: pickColor(sub.song?.title || sub.submission_id) }]}>
                      {sub.song?.cover_url
                        ? <Image source={{ uri: sub.song.cover_url }} style={styles.submissionArtImage} />
                        : <Text style={styles.submissionArtInitial}>{(sub.song?.title || '?').charAt(0).toUpperCase()}</Text>
                      }
                    </View>
                    <View style={styles.submissionInfo}>
                      <Text style={styles.submissionTitle} numberOfLines={1}>{sub.song?.title}</Text>
                      <Text style={styles.submissionArtist} numberOfLines={1}>
                        {sub.song?.artist}
                        {sub.league_name ? ` · ${sub.league_name}` : ''}
                      </Text>
                    </View>
                    {sub.points !== null && sub.points !== undefined ? (
                      <View style={styles.submissionPoints}>
                        <Text style={styles.submissionPointsText}>{sub.points}</Text>
                        <Text style={styles.submissionPointsLabel}>pts</Text>
                      </View>
                    ) : (
                      <Text style={styles.submissionPending}>
                        {sub.round_status === 'voting' ? 'VOTING' : 'OPEN'}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* ── Your Taste · All-Time ── */}
        {taste && taste.total > 0 && taste.breakdown.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>YOUR TASTE · ALL-TIME</Text>
            <View style={[styles.group, styles.tasteCard]}>
              <View style={styles.tasteBar}>
                {taste.breakdown.map((b, i) => {
                  const color = TASTE_COLORS[b.genre] ?? '#6A6A6A';
                  const isFirst = i === 0;
                  const isLast = i === taste.breakdown.length - 1;
                  return (
                    <View
                      key={b.genre}
                      style={{
                        flex: b.pct,
                        height: '100%',
                        backgroundColor: color,
                        borderTopLeftRadius: isFirst ? 6 : 0,
                        borderBottomLeftRadius: isFirst ? 6 : 0,
                        borderTopRightRadius: isLast ? 6 : 0,
                        borderBottomRightRadius: isLast ? 6 : 0,
                      }}
                    />
                  );
                })}
              </View>
              <View style={styles.tasteList}>
                {taste.breakdown.map((b) => {
                  const color = TASTE_COLORS[b.genre] ?? '#6A6A6A';
                  return (
                    <View key={b.genre} style={styles.tasteRow}>
                      <View style={[styles.tasteDot, { backgroundColor: color }]} />
                      <Text style={styles.tasteGenre}>{b.genre}</Text>
                      <Text style={styles.tastePct}>{b.pct}%</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </>
        )}

        {/* ── Liked Songs row ── */}
        <View style={styles.group}>
          <TouchableOpacity
            style={[styles.row, styles.rowLast]}
            onPress={() => setShowLiked(true)}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <View style={styles.likedIconBox}>
                <Ionicons name="heart" size={20} color="#FFFFFF" />
              </View>
              <View>
                <Text style={styles.rowLabel}>Liked Songs</Text>
                <Text style={styles.likedSubtitle}>{likedSongs.length} songs</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#B3B3B3" />
          </TouchableOpacity>
        </View>

        {/* ── Recently Deleted Leagues (creator only) ── */}
        {deletedLeagues.length > 0 && (
          <>
            <Text style={styles.groupLabel}>Recently Deleted Leagues</Text>
            <View style={styles.group}>
              {deletedLeagues.map((d, i, arr) => {
                const last = i === arr.length - 1;
                const left = daysLeft(d.expires_at);
                return (
                  <View
                    key={d.id}
                    style={[styles.deletedRow, last && styles.rowLast]}
                  >
                    <View style={styles.deletedThumb}>
                      {d.league_image ? (
                        <Image source={{ uri: d.league_image }} style={styles.deletedThumbImg} />
                      ) : (
                        <Text style={styles.deletedThumbInitial}>
                          {d.name.charAt(0).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={styles.deletedInfo}>
                      <Text style={styles.rowLabel} numberOfLines={1}>{d.name}</Text>
                      <Text style={styles.deletedSubtitle}>
                        {left === 0
                          ? 'Expires today'
                          : `Expires in ${left} day${left === 1 ? '' : 's'}`}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.restoreBtn}
                      onPress={() => handleRestoreLeague(d)}
                      disabled={restoringId === d.id}
                      activeOpacity={0.7}
                    >
                      {restoringId === d.id ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.restoreBtnText}>Restore</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ── Group 2: Support ── */}
        <Text style={styles.groupLabel}>Support</Text>
        <View style={styles.group}>
          <TouchableOpacity
            style={[styles.row, howToPlayOpen ? null : styles.rowLast]}
            onPress={() => setHowToPlayOpen(v => !v)}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="help-circle-outline" size={20} color="#B3B3B3" />
              <Text style={styles.rowLabel}>How to Play</Text>
            </View>
            <Ionicons
              name={howToPlayOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color="#6A6A6A"
            />
          </TouchableOpacity>
          {howToPlayOpen && (
            <View style={[styles.howToPlayContent, styles.rowLast]}>
              {HOW_TO_PLAY_STEPS.map((step, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Group 3: Legal ── */}
        <Text style={styles.groupLabel}>Legal</Text>
        <View style={styles.group}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => setPrivacyOpen(v => !v)}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="shield-outline" size={20} color="#B3B3B3" />
              <Text style={styles.rowLabel}>Privacy Policy</Text>
            </View>
            <Ionicons
              name={privacyOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color="#6A6A6A"
            />
          </TouchableOpacity>
          {privacyOpen && (
            <Text style={styles.legalText}>
              {'Fantasy Music League collects your email address, display name, and profile photo to provide the app experience. We do not sell your data to third parties. Song submissions and votes are stored to calculate league results. You can delete your account and all associated data at any time from this screen. By using this app you agree to these terms.'}
            </Text>
          )}
          <View style={styles.separator} />
          <TouchableOpacity
            style={[styles.row, styles.rowLast]}
            onPress={() => setTermsOpen(v => !v)}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="document-text-outline" size={20} color="#B3B3B3" />
              <Text style={styles.rowLabel}>Terms of Service</Text>
            </View>
            <Ionicons
              name={termsOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color="#6A6A6A"
            />
          </TouchableOpacity>
          {termsOpen && (
            <Text style={[styles.legalText, styles.rowLast]}>
              {'Fantasy Music League is provided for entertainment purposes. You are responsible for the content you submit including song selections and chat messages. We reserve the right to suspend accounts that violate community standards. Song previews are provided by Deezer for personal use only. We may update these terms at any time and continued use of the app constitutes acceptance.'}
            </Text>
          )}
        </View>

        {/* ── Group 4: Destructive actions ── */}
        <View style={styles.group}>
          <TouchableOpacity style={styles.row} onPress={handleLogout}>
            <View style={styles.rowLeft}>
              <Ionicons name="log-out-outline" size={20} color="#7C3AED" />
              <Text style={styles.rowLabelDanger}>Log out</Text>
            </View>
          </TouchableOpacity>
          <View style={styles.separator} />
          <TouchableOpacity style={[styles.row, styles.rowLast]} onPress={handleDeleteAccount}>
            <View style={styles.rowLeft}>
              <Ionicons name="trash-outline" size={20} color="#7C3AED" />
              <Text style={styles.rowLabelDanger}>Delete Account</Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.version}>Fantasy Music League v1.0</Text>
      </ScrollView>

      {/* ── Edit Profile Modal ── */}
      <Modal
        visible={editOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEditOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.editOverlay}
        >
          <View style={styles.editPopup}>
            <Text style={styles.editPopupTitle}>Edit Profile</Text>
            <Text style={styles.editInputLabel}>USERNAME</Text>
            <TextInput
              style={styles.editInput}
              value={editName}
              onChangeText={setEditName}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
            <TouchableOpacity
              style={styles.editSaveBtn}
              onPress={handleSaveEdit}
              disabled={savingEdit}
              activeOpacity={0.8}
            >
              {savingEdit
                ? <ActivityIndicator color="#FFFFFF" />
                : <Text style={styles.editSaveText}>Save</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.editCancelBtn}
              onPress={() => setEditOpen(false)}
              disabled={savingEdit}
            >
              <Text style={styles.editCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Liked Songs Modal ── */}
      <Modal
        visible={showLiked}
        animationType="slide"
        onRequestClose={() => setShowLiked(false)}
      >
        {/* Plain View — SafeAreaView is unreliable inside Modal; apply insets manually */}
        <View style={likedStyles.container}>
          <View style={[likedStyles.header, { paddingTop: insets.top + 16 }]}>
            <TouchableOpacity
              onPress={() => setShowLiked(false)}
              activeOpacity={0.7}
              style={likedStyles.backBtn}
            >
              <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={likedStyles.headerTitle}>Liked Songs</Text>
            <View style={likedStyles.headerSpacer} />
          </View>

          {likedSongs.length === 0 ? (
            <View style={likedStyles.empty}>
              <Ionicons name="heart-outline" size={52} color="rgba(255,255,255,0.15)" />
              <Text style={likedStyles.emptyTitle}>No liked songs yet</Text>
              <Text style={likedStyles.emptyText}>
                Heart songs in the Discover tab to save them here.
              </Text>
            </View>
          ) : (
            <FlatList
              data={likedSongs}
              keyExtractor={item => String(item.deezer_id)}
              renderItem={({ item }) => (
                <LikedSongRow song={item} onUnlike={() => unlikeSong(item)} />
              )}
              contentContainerStyle={[likedStyles.list, { paddingBottom: insets.bottom + 16 }]}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={likedStyles.separator} />}
            />
          )}
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  scroll: {
    paddingBottom: 48,
  },

  // ── Profile header ──
  profileHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatarContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#181818',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#121212',
  },
  avatarInfo: {
    flex: 1,
    marginLeft: 14,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  profileTitle: {
    fontSize: 13,
    color: '#B3B3B3',
    marginTop: 3,
  },
  editBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  editBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── Stats row ──
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#181818',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginTop: 20,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#B3B3B3',
    letterSpacing: 0.8,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  // ── Recent submissions ──
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B3B3B3',
    letterSpacing: 1.2,
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 8,
  },
  submissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  submissionArt: {
    width: 44,
    height: 44,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  submissionArtImage: {
    width: 44,
    height: 44,
    borderRadius: 6,
  },
  submissionArtInitial: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  submissionInfo: {
    flex: 1,
    marginLeft: 12,
  },
  submissionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  submissionArtist: {
    fontSize: 12,
    color: '#B3B3B3',
    marginTop: 2,
  },
  submissionPoints: {
    alignItems: 'center',
    minWidth: 44,
  },
  submissionPointsText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#7C3AED',
  },
  submissionPointsLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#B3B3B3',
    letterSpacing: 0.6,
  },
  submissionPending: {
    fontSize: 10,
    fontWeight: '700',
    color: '#F59E0B',
    letterSpacing: 0.6,
  },

  // ── Edit profile modal ──
  editOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  editPopup: {
    backgroundColor: '#282828',
    borderRadius: 12,
    padding: 24,
  },
  editPopupTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  editInputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B3B3B3',
    letterSpacing: 1,
    marginBottom: 8,
  },
  editInput: {
    backgroundColor: '#3E3E3E',
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    color: '#FFFFFF',
    marginBottom: 18,
  },
  editSaveBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: 50,
    paddingVertical: 14,
    alignItems: 'center',
  },
  editCancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  editSaveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  editCancelText: { color: '#B3B3B3', fontSize: 13, fontWeight: '600' },

  // ── Liked Songs row ──
  likedIconBox: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  likedSubtitle: {
    fontSize: 13,
    color: '#B3B3B3',
    marginTop: 2,
  },

  // ── Your Taste ──
  tasteCard: {
    padding: 16,
  },
  tasteBar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#282828',
  },
  tasteList: {
    marginTop: 14,
  },
  tasteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  tasteDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  tasteGenre: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  tastePct: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B3B3B3',
  },

  // ── Recently Deleted Leagues ──
  deletedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  deletedThumb: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  deletedThumbImg: {
    width: 40,
    height: 40,
    borderRadius: 6,
  },
  deletedThumbInitial: {
    fontSize: 16,
    fontWeight: '700',
    color: '#7C3AED',
  },
  deletedInfo: {
    flex: 1,
    marginLeft: 12,
  },
  deletedSubtitle: {
    fontSize: 12,
    color: '#B3B3B3',
    marginTop: 2,
  },
  restoreBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#7C3AED',
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Group label ──
  groupLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B3B3B3',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginHorizontal: 20,
    marginBottom: 6,
    marginTop: 0,
  },

  // ── Group container ──
  group: {
    backgroundColor: '#181818',
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },

  // ── Row ──
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  rowLabel: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '400',
  },
  rowLabelDanger: {
    fontSize: 14,
    color: '#7C3AED',
    fontWeight: '400',
  },
  rowValue: {
    fontSize: 12,
    color: '#B3B3B3',
    fontWeight: '400',
  },
  separator: {
    height: 0.5,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginLeft: 58,
  },

  // ── How to Play ──
  howToPlayContent: {
    paddingBottom: 12,
    paddingTop: 4,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 14,
  },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumberText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: '#B3B3B3',
    lineHeight: 20,
  },

  // ── Legal inline text ──
  legalText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    lineHeight: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  // ── Footer ──
  version: {
    fontSize: 11,
    color: '#6A6A6A',
    textAlign: 'center',
    marginTop: 16,
  },
});

// ─── Liked Songs Modal Styles ─────────────────────────────────────────────────

const likedStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    // paddingTop is set inline as insets.top + 16 to clear the status bar inside a Modal
    paddingBottom: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  headerSpacer: {
    minWidth: 44,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 8,
    // paddingBottom is set inline as insets.bottom + 16
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  separator: {
    height: 0.5,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  info: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  artist: {
    fontSize: 13,
    color: '#B3B3B3',
    marginTop: 2,
  },
  links: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  linkBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trashBtn: {
    padding: 4,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyText: {
    fontSize: 14,
    color: '#B3B3B3',
    textAlign: 'center',
    lineHeight: 20,
  },
});

