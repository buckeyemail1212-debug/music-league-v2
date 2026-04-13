import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  FlatList,
  RefreshControl,
  Modal,
  ActivityIndicator,
  Image,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../src/context/AuthContext';
import {
  getLeagues, getRounds, joinLeague, createLeague,
  League, Round,
} from '../../src/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { leagueEvents } from '../../src/utils/leagueEvents';
import { tabEvents } from '../../src/utils/tabEvents';

// ─── helpers ─────────────────────────────────────────────────────────────────

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

// ─── component ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();

  // league list
  const [leagues, setLeagues] = useState<League[]>([]);
  const [activeRounds, setActiveRounds] = useState<{ [id: string]: Round | null }>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cachedImages, setCachedImages] = useState<{ [id: string]: string }>({});
  const [zoomLeagueImage, setZoomLeagueImage] = useState<string | null>(null);
  const flatListRef  = useRef<FlatList>(null);
  const dataLoaded   = useRef(false);

  // timer re-render
  useEffect(() => {
    const t = setInterval(() => {}, 1000);
    return () => clearInterval(t);
  }, []);

  // add/join modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [leagueCode, setLeagueCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [leagueName, setLeagueName] = useState('');
  const [totalRounds, setTotalRounds] = useState(5);
  const [leagueImage, setLeagueImage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // ── modal helpers ──────────────────────────────────────────────────────────

  const resetAndClose = () => {
    setShowAddModal(false);
    setAddMode('choose');
    setLeagueCode('');
    setLeagueName('');
    setTotalRounds(5);
    setLeagueImage(null);
  };

  const handleJoin = async () => {
    if (!leagueCode.trim()) return;
    setJoining(true);
    try {
      const res = await joinLeague(leagueCode.trim().toUpperCase());
      resetAndClose();
      leagueEvents.emit();
      Alert.alert('League Joined!', `You joined ${res.data.name}`);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.detail || 'Failed to join');
    } finally {
      setJoining(false);
    }
  };

  const handleCreate = async () => {
    if (!leagueName.trim()) return;
    setCreating(true);
    try {
      const payload: any = { name: leagueName.trim(), total_rounds: totalRounds };
      if (leagueImage) payload.league_image = leagueImage;
      const res = await createLeague(payload);
      if (leagueImage && res.data?.id) {
        try { await AsyncStorage.setItem(`league_image_${res.data.id}`, leagueImage); } catch {}
      }
      resetAndClose();
      leagueEvents.emit();
      Alert.alert('League Created!', `Code: ${res.data.league_code}`);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.detail || 'Failed to create');
    } finally {
      setCreating(false);
    }
  };

  const pickImage = () => {
    Alert.alert('League Photo', '', [
      {
        text: 'Take Photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Permission needed'); return; }
          const r = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.15, base64: true });
          if (!r.canceled && r.assets[0].base64) setLeagueImage(`data:image/jpeg;base64,${r.assets[0].base64}`);
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.15, base64: true });
          if (!r.canceled && r.assets[0].base64) setLeagueImage(`data:image/jpeg;base64,${r.assets[0].base64}`);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const renderModalContent = () => {
    if (addMode === 'join') {
      return (
        <View style={ms.popup}>
          <View style={ms.popupHeader}>
            <TouchableOpacity onPress={() => setAddMode('choose')}>
              <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={ms.popupTitle}>Join League</Text>
            <View style={{ width: 22 }} />
          </View>
          <TextInput
            style={ms.codeInput}
            placeholder="Enter code"
            placeholderTextColor="#B3B3B3"
            value={leagueCode}
            onChangeText={setLeagueCode}
            autoCapitalize="characters"
            maxLength={6}
            autoFocus
          />
          <TouchableOpacity
            style={[ms.actionBtn, !leagueCode.trim() && ms.actionBtnOff]}
            onPress={handleJoin}
            disabled={!leagueCode.trim() || joining}
          >
            {joining ? <ActivityIndicator color="#121212" /> : <Text style={ms.actionBtnText}>Join League</Text>}
          </TouchableOpacity>
        </View>
      );
    }

    if (addMode === 'create') {
      return (
        <View style={ms.popup}>
          <View style={ms.popupHeader}>
            <TouchableOpacity onPress={() => setAddMode('choose')}>
              <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={ms.popupTitle}>Create League</Text>
            <View style={{ width: 22 }} />
          </View>
          <TouchableOpacity style={ms.imgPicker} onPress={pickImage}>
            {leagueImage ? (
              <Image source={{ uri: leagueImage }} style={ms.imgPreview} />
            ) : (
              <>
                <Ionicons name="camera-outline" size={24} color="#7C3AED" />
                <Text style={ms.imgLabel}>Add Photo</Text>
              </>
            )}
          </TouchableOpacity>
          {leagueImage && (
            <TouchableOpacity onPress={() => setLeagueImage(null)}>
              <Text style={ms.removeImg}>Remove</Text>
            </TouchableOpacity>
          )}
          <Text style={ms.label}>League Name</Text>
          <TextInput
            style={ms.input}
            placeholder="e.g., Friday Night Vibes"
            placeholderTextColor="#B3B3B3"
            value={leagueName}
            onChangeText={setLeagueName}
          />
          <Text style={ms.label}>Rounds</Text>
          <View style={ms.roundsGrid}>
            {[1,2,3,4,5,6,7,8,9,10].map(n => (
              <TouchableOpacity
                key={n}
                style={[ms.roundCircle, totalRounds === n && ms.roundCircleSel]}
                onPress={() => setTotalRounds(n)}
              >
                <Text style={[ms.roundText, totalRounds === n && ms.roundTextSel]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[ms.actionBtn, !leagueName.trim() && ms.actionBtnOff]}
            onPress={handleCreate}
            disabled={!leagueName.trim() || creating}
          >
            {creating ? <ActivityIndicator color="#121212" /> : <Text style={ms.actionBtnText}>Create League</Text>}
          </TouchableOpacity>
        </View>
      );
    }

    // choose
    return (
      <View style={ms.popup}>
        <Text style={[ms.popupTitle, { marginBottom: 8 }]}>What would you like to do?</Text>
        <TouchableOpacity style={ms.optionBtn} onPress={() => setAddMode('create')}>
          <Ionicons name="add-circle-outline" size={24} color="#7C3AED" />
          <Text style={ms.optionText}>Create League</Text>
        </TouchableOpacity>
        <TouchableOpacity style={ms.optionBtn} onPress={() => setAddMode('join')}>
          <Ionicons name="enter-outline" size={24} color="#7C3AED" />
          <Text style={ms.optionText}>Join League</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ── league fetching ────────────────────────────────────────────────────────

  const getTimeRemaining = (deadline: string): string => {
    const endTime = deadline.endsWith('Z') || deadline.includes('+')
      ? new Date(deadline)
      : new Date(deadline + 'Z');
    const diff = endTime.getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const getStatusSubtitle = (item: League, activeRound: Round | null): string => {
    if (item.current_round === 0) return 'Not started';
    const label = `Round ${item.current_round}${item.total_rounds > 0 ? ` of ${item.total_rounds}` : ''}`;
    if (!activeRound) return `${label} · Completed`;
    if (activeRound.status === 'submission') return `${label} · Submission open`;
    if (activeRound.status === 'voting') return `${label} · Voting open`;
    return label;
  };

  const fetchLeagues = async () => {
    try {
      const res = await getLeagues();
      const list = res.data;
      setLeagues(list);
      dataLoaded.current = true;
      const imgCache: { [id: string]: string } = {};
      await Promise.all(list.map(async (l: League) => {
        if (!l.league_image) {
          try {
            const cached = await AsyncStorage.getItem(`league_image_${l.id}`);
            if (cached) imgCache[l.id] = cached;
          } catch {}
        }
      }));
      setCachedImages(imgCache);
      const roundsData: { [id: string]: Round | null } = {};
      for (const l of list) {
        try {
          const rr = await getRounds(l.id);
          roundsData[l.id] = rr.data.find((r: Round) => r.status === 'submission' || r.status === 'voting') || null;
        } catch {
          roundsData[l.id] = null;
        }
      }
      setActiveRounds(roundsData);
    } catch (err) {
      console.error('Failed to fetch leagues:', err);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => {
    fetchLeagues();
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []));

  useEffect(() => leagueEvents.subscribe(fetchLeagues), []);
  useEffect(() => tabEvents.onNewLeague(() => setShowAddModal(true)), []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchLeagues();
    setRefreshing(false);
  };

  // ── render league card ─────────────────────────────────────────────────────

  const renderLeagueItem = ({ item }: { item: League }) => {
    const activeRound = activeRounds[item.id];
    const displayImage = item.league_image || cachedImages[item.id];

    return (
      <TouchableOpacity
        style={styles.leagueCard}
        onPress={() => router.push(`/league/${item.id}`)}
        onLongPress={() => displayImage && setZoomLeagueImage(displayImage)}
        delayLongPress={300}
        activeOpacity={0.75}
      >
        <View style={styles.cardTop}>
          <View style={styles.leagueIcon}>
            {displayImage
              ? <Image source={{ uri: displayImage }} style={styles.leagueIconImage} resizeMode="cover" />
              : <Text style={styles.leagueIconInitial}>{item.name.charAt(0).toUpperCase()}</Text>
            }
          </View>
          <View style={styles.leagueInfo}>
            <Text style={styles.leagueName} numberOfLines={1}>{item.name}</Text>
            <Text style={[styles.leagueSubtitle, item.current_round === 0 && styles.leagueSubtitleDimmed]} numberOfLines={1}>
              {getStatusSubtitle(item, activeRound)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.20)" />
        </View>

        {activeRound && (
          <View style={styles.timerPill}>
            <Ionicons name="time-outline" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.timerPillText}>
              {activeRound.status === 'submission' ? 'Submission: ' : 'Voting: '}
              {activeRound.status === 'submission'
                ? getTimeRemaining(activeRound.submission_deadline)
                : getTimeRemaining(activeRound.voting_deadline)}
            </Text>
          </View>
        )}

        <View style={styles.cardSeparator} />

        <View style={styles.cardBottom}>
          <View style={styles.memberAvatarsContainer}>
            {item.members.slice(0, 5).map((m, i) => (
              <View key={m.id} style={[styles.memberAvatar, { marginLeft: i > 0 ? -8 : 0, zIndex: 5 - i }]}>
                {m.profile_photo
                  ? <Image source={{ uri: m.profile_photo }} style={styles.memberAvatarImage} />
                  : <Text style={styles.memberAvatarText}>{m.username.charAt(0).toUpperCase()}</Text>
                }
              </View>
            ))}
            {item.members.length > 5 && (
              <View style={[styles.memberAvatar, styles.memberAvatarMore, { marginLeft: -8, zIndex: 0 }]}>
                <Text style={styles.memberAvatarMoreText}>+{item.members.length - 5}</Text>
              </View>
            )}
          </View>
          {item.current_round === 0 && (
            <View style={styles.codePill}>
              <Text style={styles.codePillText}>Code: {item.league_code}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.greeting}>{getGreeting()},</Text>
        <Text style={styles.username}>{user?.display_name || user?.username}</Text>
      </View>

      {loading && !dataLoaded.current ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={leagues}
          keyExtractor={(item) => item.id}
          renderItem={renderLeagueItem}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="musical-notes" size={64} color="#7C3AED" />
              <Text style={styles.emptyTitle}>No Leagues Yet</Text>
              <Text style={styles.emptyText}>
                Tap the + button to create a new league or join an existing one.
              </Text>
            </View>
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" />
          }
        />
      )}

      {/* League image zoom */}
      <Modal visible={!!zoomLeagueImage} transparent animationType="fade" onRequestClose={() => setZoomLeagueImage(null)}>
        <TouchableOpacity style={styles.zoomOverlay} activeOpacity={1} onPress={() => setZoomLeagueImage(null)}>
          <View style={styles.zoomContainer}>
            {zoomLeagueImage && (
              <Image source={{ uri: zoomLeagueImage }} style={styles.zoomImage} resizeMode="contain" />
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Add / Join modal */}
      <Modal visible={showAddModal} transparent animationType="fade" onRequestClose={resetAndClose}>
        <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); resetAndClose(); }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={ms.overlay}
          >
            <TouchableWithoutFeedback onPress={() => {}}>
              {renderModalContent()}
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

// ─── league list styles ───────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
  greeting: { fontSize: 14, color: '#B3B3B3', fontWeight: '400' },
  username: { fontSize: 28, fontWeight: '700', color: '#FFFFFF', marginTop: 2 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: 20, paddingBottom: 20, flexGrow: 1 },
  leagueCard: {
    backgroundColor: '#181818',
    borderRadius: 8,
    marginBottom: 8,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  leagueIcon: {
    width: 72, height: 72, borderRadius: 8,
    backgroundColor: '#282828', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  leagueIconImage: { width: 72, height: 72, borderRadius: 8 },
  leagueIconInitial: { fontSize: 24, fontWeight: '700', color: '#7C3AED' },
  leagueInfo: { flex: 1, marginLeft: 12, marginRight: 8 },
  leagueName: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  leagueSubtitle: { fontSize: 12, fontWeight: '400', color: '#B3B3B3', marginTop: 3 },
  leagueSubtitleDimmed: { color: '#6A6A6A' },
  timerPill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#7C3AED', marginHorizontal: 16, marginBottom: 12,
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 4,
  },
  timerPillText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  cardSeparator: { height: 0.5, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 16 },
  cardBottom: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  memberAvatarsContainer: { flexDirection: 'row', alignItems: 'center' },
  memberAvatar: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: '#282828',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#121212', overflow: 'hidden',
  },
  memberAvatarImage: { width: 26, height: 26, borderRadius: 13 },
  memberAvatarText: { fontSize: 10, fontWeight: '500', color: '#FFFFFF' },
  memberAvatarMore: { backgroundColor: '#282828' },
  memberAvatarMoreText: { fontSize: 9, fontWeight: '500', color: '#B3B3B3' },
  codePill: {
    backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6,
  },
  codePillText: { fontSize: 11, fontWeight: '400', color: '#6A6A6A', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 80, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 24, fontWeight: '700', color: '#FFFFFF', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#B3B3B3', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  zoomOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  zoomContainer: { width: '80%', aspectRatio: 1, borderRadius: 20, overflow: 'hidden' },
  zoomImage: { width: '100%', height: '100%' },
});

// ─── modal styles ─────────────────────────────────────────────────────────────

const ms = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', paddingHorizontal: 24 },
  popup: { backgroundColor: '#282828', borderRadius: 12, padding: 24 },
  popupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  popupTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', textAlign: 'center', flex: 1 },
  optionBtn: {
    flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 8,
    backgroundColor: '#3E3E3E', marginTop: 10, gap: 12,
  },
  optionText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  codeInput: {
    backgroundColor: '#3E3E3E', borderRadius: 8, padding: 16, fontSize: 22,
    fontWeight: '700', color: '#FFFFFF', textAlign: 'center', letterSpacing: 6,
    marginBottom: 12,
  },
  actionBtn: { backgroundColor: '#7C3AED', borderRadius: 50, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  actionBtnOff: { opacity: 0.4 },
  actionBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  imgPicker: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#282828',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center',
    borderWidth: 2, borderColor: '#7C3AED', borderStyle: 'dashed', overflow: 'hidden',
  },
  imgPreview: { width: 80, height: 80, borderRadius: 40 },
  imgLabel: { fontSize: 10, color: '#B3B3B3', marginTop: 2 },
  removeImg: { fontSize: 13, color: '#7C3AED', textAlign: 'center', marginTop: 6 },
  label: { fontSize: 12, fontWeight: '700', color: '#B3B3B3', marginTop: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1.5 },
  input: { backgroundColor: '#3E3E3E', borderRadius: 8, padding: 14, fontSize: 15, color: '#FFFFFF' },
  roundsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  roundCircle: { width: 40, height: 40, borderRadius: 4, backgroundColor: '#3E3E3E', alignItems: 'center', justifyContent: 'center' },
  roundCircleSel: { backgroundColor: '#7C3AED' },
  roundText: { fontSize: 14, fontWeight: '600', color: '#B3B3B3' },
  roundTextSel: { color: '#FFFFFF', fontWeight: '700' },
});
