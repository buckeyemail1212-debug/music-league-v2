import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  FlatList,
  Modal,
  Image,
  ActivityIndicator,
  ActionSheetIOS,
  Platform,
  Alert,
  Linking,
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
  getLeagues, getRounds, getResults,
} from '../../src/services/api';
import AlbumArt from '../../src/components/AlbumArt';

const HOW_TO_PLAY_STEPS = [
  'Create a league or join one with a code',
  'Submit a song matching the round\'s theme',
  'Vote on songs by ranking them best to worst',
  'See who wins when voting ends!',
];

const LIKED_KEY = 'liked_songs';

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

  // Wins modal
  const [showWins, setShowWins]     = useState(false);
  const [winsLoading, setWinsLoading] = useState(false);
  const [winsData, setWinsData]     = useState<{ leagueName: string; roundNumber: number; songTitle: string }[] | null>(null);

  const loadWins = useCallback(async () => {
    if (winsData !== null) return; // already loaded
    setWinsLoading(true);
    try {
      const leaguesRes = await getLeagues();
      const leagues = leaguesRes.data;
      const wins: { leagueName: string; roundNumber: number; songTitle: string }[] = [];

      await Promise.all(leagues.map(async (league) => {
        try {
          const roundsRes = await getRounds(league.id);
          const completed = roundsRes.data.filter(r => r.status === 'completed');
          await Promise.all(completed.map(async (round) => {
            try {
              const resultRes = await getResults(round.id);
              const result = resultRes.data;
              const isWinner = result.winners.some(w => w.user_id === user?.id);
              if (isWinner) {
                const myWin = result.winners.find(w => w.user_id === user?.id);
                if (myWin) {
                  wins.push({
                    leagueName: league.name,
                    roundNumber: round.round_number,
                    songTitle: myWin.song.title,
                  });
                }
              }
            } catch {}
          }));
        } catch {}
      }));

      setWinsData(wins);
    } catch {
      setWinsData([]);
    } finally {
      setWinsLoading(false);
    }
  }, [user?.id, winsData]);

  // Liked songs
  const [likedSongs, setLikedSongs] = useState<LikedSong[]>([]);
  const [showLiked, setShowLiked] = useState(false);

  // Load liked songs
  const loadLikedSongs = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(LIKED_KEY);
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
  }, []);

  // Reload liked songs whenever the tab gains focus
  useFocusEffect(useCallback(() => {
    loadLikedSongs();
  }, [loadLikedSongs]));

  const unlikeSong = async (song: LikedSong) => {
    const next = likedSongs.filter(s => s.deezer_id !== song.deezer_id);
    setLikedSongs(next);
    await AsyncStorage.setItem(LIKED_KEY, JSON.stringify(next)).catch(() => {});
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure? This is permanent and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
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
              style={styles.editButton}
              onPress={handleChangePhoto}
              disabled={uploading}
            >
              <Ionicons name="camera" size={14} color="#121212" />
            </TouchableOpacity>
          </View>
          <Text style={styles.profileName}>{user?.display_name || user?.username}</Text>
          <Text style={styles.profileEmail}>{user?.email}</Text>
        </View>

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

        <Text style={styles.version}>Music League v1.0</Text>
      </ScrollView>

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

      {/* ── Wins Modal ── */}
      <Modal
        visible={showWins}
        transparent
        animationType="fade"
        onRequestClose={() => setShowWins(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowWins(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={{ backgroundColor: '#1E1E1E', borderRadius: 16, padding: 24, width: '100%' }}>
                {/* Header */}
                <View style={winsStyles.cardHeader}>
                  <Text style={winsStyles.cardTitle}>Your Wins</Text>
                  <TouchableOpacity onPress={() => setShowWins(false)} hitSlop={8}>
                    <Ionicons name="close" size={22} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>

                {winsLoading ? (
                  <ActivityIndicator size="small" color="#7C3AED" style={{ marginVertical: 24 }} />
                ) : !winsData || winsData.length === 0 ? (
                  <Text style={winsStyles.empty}>No wins yet — keep playing!</Text>
                ) : (
                  <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 360 }}>
                    {winsData.map((win, i) => (
                      <View key={i} style={winsStyles.winRow}>
                        <Ionicons name="trophy" size={20} color="#7C3AED" style={winsStyles.trophyIcon} />
                        <View style={winsStyles.winInfo}>
                          <Text style={winsStyles.winLeague}>{win.leagueName}</Text>
                          <Text style={winsStyles.winRound}>Round {win.roundNumber}</Text>
                          <Text style={winsStyles.winSong}>{win.songTitle}</Text>
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
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
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 28,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 14,
  },
  avatarContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#181818',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(124,58,237,0.40)',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  editButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
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
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  profileEmail: {
    fontSize: 14,
    color: '#B3B3B3',
    marginTop: 4,
  },

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

// ─── Wins Modal Styles ────────────────────────────────────────────────────────

const winsStyles = StyleSheet.create({
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  empty: {
    fontSize: 14,
    color: '#B3B3B3',
    textAlign: 'center',
    paddingVertical: 24,
  },
  winRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  trophyIcon: {
    marginRight: 12,
    marginTop: 1,
  },
  winInfo: {
    flex: 1,
  },
  winLeague: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  winRound: {
    fontSize: 13,
    color: '#B3B3B3',
    marginTop: 2,
  },
  winSong: {
    fontSize: 13,
    color: '#7C3AED',
    marginTop: 2,
  },
});
