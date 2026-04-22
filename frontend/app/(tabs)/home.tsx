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
  getUserStats, getLeagueStandings,
  getLifetimeStats, getWeeklyPoints,
  League, Round, UserStats, LeagueStandings, LifetimeStats,
} from '../../src/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { leagueEvents } from '../../src/utils/leagueEvents';
import { tabEvents } from '../../src/utils/tabEvents';
import { pluralize, pluralWord } from '../../src/utils/pluralize';

// ─── helpers ─────────────────────────────────────────────────────────────────

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

const LEAGUE_COLORS = ['#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899', '#14B8A6', '#F97316'];
const getLeagueColor = (name: string) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) >>> 0;
  return LEAGUE_COLORS[h % LEAGUE_COLORS.length];
};

const parseDeadline = (d: string) =>
  new Date(d.endsWith('Z') || d.includes('+') ? d : d + 'Z');

const shortTimeLeft = (deadline: string): string => {
  const diff = parseDeadline(deadline).getTime() - Date.now();
  if (diff <= 0) return 'ended';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
};

const shortDay = (deadline: string): string => {
  const end = parseDeadline(deadline);
  const today = new Date();
  const diffDays = Math.floor(
    (new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime() -
      new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
      86400000,
  );
  if (diffDays <= 0) return 'TODAY';
  if (diffDays === 1) return 'TMRW';
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  return days[end.getDay()];
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
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [leagueStandings, setLeagueStandings] = useState<{ [leagueId: string]: LeagueStandings }>({});
  const [weeklyPoints, setWeeklyPoints] = useState<number>(0);
  const [lifetimeStats, setLifetimeStats] = useState<LifetimeStats | null>(null);
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
        try { if (user?.id) await AsyncStorage.setItem(`league_image_${user.id}_${res.data.id}`, leagueImage); } catch {}
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

  const fetchLeagues = async () => {
    try {
      const [leaguesRes, statsRes, lifetimeRes] = await Promise.all([
        getLeagues(),
        getUserStats().catch(() => null),
        getLifetimeStats().catch(() => null),
      ]);
      const list = leaguesRes.data;
      setLeagues(list);
      setUserStats(statsRes?.data ?? null);
      setLifetimeStats(lifetimeRes?.data ?? null);
      dataLoaded.current = true;

      const imgCache: { [id: string]: string } = {};
      await Promise.all(list.map(async (l: League) => {
        if (!l.league_image) {
          try {
            const cached = user?.id ? await AsyncStorage.getItem(`league_image_${user.id}_${l.id}`) : null;
            if (cached) imgCache[l.id] = cached;
          } catch {}
        }
      }));
      setCachedImages(imgCache);

      const roundsData: { [id: string]: Round | null } = {};
      const standingsData: { [id: string]: LeagueStandings } = {};

      await Promise.all(list.map(async (l: League) => {
        const [roundsRes, standingsRes] = await Promise.all([
          getRounds(l.id).catch(() => null),
          getLeagueStandings(l.id).catch(() => null),
        ]);
        if (roundsRes) {
          const rounds = roundsRes.data;
          roundsData[l.id] = rounds.find((r: Round) => r.status === 'submission' || r.status === 'voting') || null;
        } else {
          roundsData[l.id] = null;
        }
        if (standingsRes) standingsData[l.id] = standingsRes.data;
      }));
      setActiveRounds(roundsData);
      setLeagueStandings(standingsData);

      // Weekly delta comes from the server's permanent submission history,
      // so it stays accurate even after leagues are deleted.
      try {
        const wr = await getWeeklyPoints();
        setWeeklyPoints(wr.data.weekly_points ?? 0);
      } catch {
        setWeeklyPoints(0);
      }
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

  // ── derived data ───────────────────────────────────────────────────────────

  // "Across all leagues" pulls from the server's running all_time_points
  // which is incremented when a round completes and is never decreased when
  // a league is deleted. The current-standings sum is used as a fallback on
  // first launch before the server has finalized any rounds.
  const liveTotalPoints = Object.values(leagueStandings).reduce((sum, s) => {
    const mine = s.standings.find((st) => st.user_id === user?.id);
    return sum + (mine?.total_points || 0);
  }, 0);
  const totalPoints = Math.max(lifetimeStats?.all_time_points ?? 0, liveTotalPoints);

  const activeLeaguesCount = leagues.filter(l => l.status !== 'completed').length;

  const pendingAction = (() => {
    for (const l of leagues) {
      const r = activeRounds[l.id];
      if (!r) continue;
      if (r.status === 'submission' && !r.has_user_submitted) return { league: l, round: r };
      if (r.status === 'voting' && !r.has_user_voted) return { league: l, round: r };
    }
    return null;
  })();

  // ── render league card ─────────────────────────────────────────────────────

  const renderLeagueItem = ({ item }: { item: League }) => {
    const activeRound = activeRounds[item.id];
    const displayImage = item.league_image || cachedImages[item.id];
    const standings = leagueStandings[item.id];
    const sorted = standings?.standings ?? [];
    const mineIdx = sorted.findIndex(s => s.user_id === user?.id);
    const mine = mineIdx >= 0 ? sorted[mineIdx] : null;
    const leader = sorted[0];
    const rank = mineIdx >= 0 ? mineIdx + 1 : null;
    const myPoints = mine?.total_points ?? 0;
    const leaderPoints = leader?.total_points ?? 0;
    const isLeading = rank === 1 && myPoints > 0;
    const progressPct = leaderPoints > 0 ? Math.min(1, myPoints / leaderPoints) : 0;
    const squareColor = getLeagueColor(item.name);

    let pillText: string | null = null;
    let pillColor = '#B3B3B3';
    if (activeRound) {
      if (activeRound.status === 'voting') {
        // Once the user has voted we reflect that instead of the deadline.
        pillText = activeRound.has_user_voted ? 'VOTED' : 'VOTING OPEN';
        pillColor = activeRound.has_user_voted ? '#10B981' : '#10B981';
      } else if (activeRound.status === 'submission') {
        pillText = activeRound.has_user_submitted
          ? 'SUBMITTED'
          : `SUBMIT BY ${shortDay(activeRound.submission_deadline)}`;
        pillColor = activeRound.has_user_submitted ? '#10B981' : '#F59E0B';
      }
    } else if (item.current_round > 0) {
      pillText = 'COMPLETED';
      pillColor = '#6A6A6A';
    }

    // A league has no useful standings yet if nobody has earned points.
    const hasAnyPoints = sorted.some(p => (p.total_points || 0) > 0);

    return (
      <TouchableOpacity
        style={styles.leagueCardV2}
        onPress={() => router.push(`/league/${item.id}`)}
        onLongPress={() => displayImage && setZoomLeagueImage(displayImage)}
        delayLongPress={300}
        activeOpacity={0.75}
      >
        <View style={styles.leagueCardTopRow}>
          <View style={[styles.leagueColorSquare, { backgroundColor: squareColor }]}>
            {displayImage
              ? <Image source={{ uri: displayImage }} style={styles.leagueColorSquareImage} resizeMode="cover" />
              : <Text style={styles.leagueColorSquareInitial}>{item.name.charAt(0).toUpperCase()}</Text>
            }
          </View>
          <View style={styles.leagueCardInfo}>
            <Text style={styles.leagueCardName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.leagueCardSubtext} numberOfLines={1}>
              {item.current_round > 0
                ? `R${item.current_round}/${item.total_rounds} · ${pluralize(item.members.length, 'player')}`
                : `${pluralize(item.members.length, 'player')} · Code ${item.league_code}`}
            </Text>
          </View>
          {pillText && (
            <View style={[styles.statusPill, { borderColor: pillColor, backgroundColor: `${pillColor}22` }]}>
              <Text style={[styles.statusPillText, { color: pillColor }]}>{pillText}</Text>
            </View>
          )}
        </View>

        {hasAnyPoints && rank !== null ? (
          <View style={styles.leagueCardProgressRow}>
            <Text style={styles.leagueCardRank}>#{rank}</Text>
            <View style={styles.leagueCardMiddle}>
              <Text style={[styles.leagueCardGap, isLeading && { color: '#10B981' }]}>
                {isLeading
                  ? 'LEADING'
                  : leaderPoints > myPoints
                    ? `${pluralize(leaderPoints - myPoints, 'PT', 'PTS')} BEHIND`
                    : 'TIED FOR 1ST'}
              </Text>
              <View style={styles.progressBarTrack}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.max(4, progressPct * 100)}%`,
                      backgroundColor: isLeading ? '#10B981' : '#7C3AED',
                    },
                  ]}
                />
              </View>
            </View>
            <Text style={styles.leagueCardTotal}>{myPoints}</Text>
          </View>
        ) : (
          <View style={styles.leagueCardProgressRow}>
            <View style={styles.memberAvatarsInline}>
              {item.members.slice(0, 4).map((m, i) => (
                <View
                  key={m.id}
                  style={[
                    styles.memberAvatarInline,
                    { marginLeft: i > 0 ? -8 : 0, zIndex: 4 - i },
                  ]}
                >
                  {m.profile_photo
                    ? <Image source={{ uri: m.profile_photo }} style={styles.memberAvatarInlineImage} />
                    : <Text style={styles.memberAvatarInlineText}>{m.username.charAt(0).toUpperCase()}</Text>}
                </View>
              ))}
              {item.members.length > 4 && (
                <View
                  style={[
                    styles.memberAvatarInline,
                    styles.memberAvatarInlineMore,
                    { marginLeft: -8, zIndex: 0 },
                  ]}
                >
                  <Text style={styles.memberAvatarInlineMoreText}>
                    +{item.members.length - 4}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.leagueCardMiddle}>
              <Text style={styles.leagueCardGap}>NOT STARTED</Text>
              <View style={styles.progressBarTrack} />
            </View>
            <Text style={styles.leagueCardTotal}>0</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // ── render ─────────────────────────────────────────────────────────────────

  const listHeader = (
    <View>
      {/* Greeting */}
      <View style={styles.header}>
        <Text style={styles.greeting}>{getGreeting()},</Text>
        <Text style={styles.username}>{user?.display_name || user?.username}</Text>
      </View>

      {/* Stats Card */}
      <View style={styles.statsCard}>
        <View style={styles.statsCardTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.statsCardLabel}>ACROSS ALL LEAGUES</Text>
            <View style={styles.statsCardPointsRow}>
              <Text style={styles.statsCardPoints}>{totalPoints.toLocaleString()}</Text>
              <Text style={styles.statsCardPointsUnit}>PTS</Text>
            </View>
          </View>
          {weeklyPoints > 0 && (
            <Text style={styles.statsCardDelta}>
              +{pluralize(weeklyPoints, 'point')} this week
            </Text>
          )}
        </View>
        <View style={styles.statsCardDivider} />
        <View style={styles.statsCardBottomRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{userStats?.leagues_count ?? leagues.length}</Text>
            <Text style={styles.statLabel}>LEAGUES</Text>
          </View>
          <View style={styles.statItemDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{userStats?.total_wins ?? 0}</Text>
            <Text style={styles.statLabel}>WINS</Text>
          </View>
          <View style={styles.statItemDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{Math.round(userStats?.win_rate ?? 0)}%</Text>
            <Text style={styles.statLabel}>WIN RATE</Text>
          </View>
        </View>
      </View>

      {/* Active Action Card */}
      {pendingAction && (
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push(`/round/${pendingAction.round.id}`)}
          activeOpacity={0.8}
        >
          <View style={styles.actionCardAccent} />
          <View style={styles.actionCardContent}>
            <View style={styles.actionCardPill}>
              <View style={styles.actionCardDot} />
              <Text style={styles.actionCardPillText}>
                {pendingAction.round.status === 'voting' ? 'VOTING OPEN' : 'SUBMISSION OPEN'} · {shortTimeLeft(
                  pendingAction.round.status === 'voting'
                    ? pendingAction.round.voting_deadline
                    : pendingAction.round.submission_deadline,
                )}
              </Text>
            </View>
            <Text style={styles.actionCardTheme} numberOfLines={1}>
              {pendingAction.round.theme}
            </Text>
            <Text style={styles.actionCardSubtext} numberOfLines={1}>
              {pendingAction.league.name} · Round {pendingAction.round.round_number}
            </Text>
          </View>
          <View style={styles.actionCardArrow}>
            <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
      )}

      {/* Section Header */}
      {leagues.length > 0 && (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderTitle}>YOUR LEAGUES</Text>
          <Text style={styles.sectionHeaderCount}>
            {activeLeaguesCount} ACTIVE
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {loading && !dataLoaded.current ? (
        <View style={styles.listContent}>
          <View style={styles.header}>
            <View style={styles.skeletonLineShort} />
            <View style={styles.skeletonLineLong} />
          </View>
          <View style={[styles.statsCard, styles.skeletonBlock, { height: 140 }]} />
          {[0, 1, 2].map(i => (
            <View key={i} style={[styles.leagueCardV2, styles.skeletonCard, { height: 120 }]} />
          ))}
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={leagues}
          keyExtractor={(item) => item.id}
          renderItem={renderLeagueItem}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="musical-notes" size={64} color="#7C3AED" />
              <Text style={styles.emptyTitle}>No Leagues Yet</Text>
              <Text style={styles.emptyText}>
                Tap the Add button below to create a league or join an existing one.
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
    paddingBottom: 16,
  },
  greeting: { fontSize: 14, color: '#B3B3B3', fontWeight: '400' },
  username: { fontSize: 26, fontWeight: '700', color: '#FFFFFF', marginTop: 2 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  skeletonCard: { opacity: 0.6, backgroundColor: '#181818' },
  skeletonBlock: { backgroundColor: '#282828', opacity: 0.5 },
  skeletonLineLong: {
    height: 14, width: '60%', borderRadius: 4,
    backgroundColor: '#282828', marginBottom: 8,
  },
  skeletonLineShort: {
    height: 12, width: '35%', borderRadius: 4, backgroundColor: '#1F1F1F', marginBottom: 8,
  },
  listContent: { paddingHorizontal: 20, paddingBottom: 40, flexGrow: 1 },

  // ── Stats card ───────────────────────────────────────────────────────────
  statsCard: {
    backgroundColor: '#181818',
    borderRadius: 12,
    padding: 20,
    marginBottom: 14,
  },
  statsCardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  statsCardLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#B3B3B3',
    letterSpacing: 1,
  },
  statsCardPointsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 6,
  },
  statsCardPoints: {
    fontSize: 40,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 44,
  },
  statsCardPointsUnit: {
    fontSize: 14,
    fontWeight: '700',
    color: '#B3B3B3',
    letterSpacing: 1,
    marginLeft: 8,
    marginBottom: 6,
  },
  statsCardDelta: {
    fontSize: 13,
    fontWeight: '600',
    color: '#10B981',
    marginBottom: 6,
  },
  statsCardDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 16,
  },
  statsCardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statItemDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.08)',
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
    letterSpacing: 1,
    marginTop: 4,
  },

  // ── Active action card ───────────────────────────────────────────────────
  actionCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#181818',
    borderRadius: 12,
    marginBottom: 20,
    overflow: 'hidden',
  },
  actionCardAccent: {
    width: 4,
    backgroundColor: '#10B981',
  },
  actionCardContent: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  actionCardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(16,185,129,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  actionCardDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  actionCardPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10B981',
    letterSpacing: 0.5,
  },
  actionCardTheme: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 8,
  },
  actionCardSubtext: {
    fontSize: 12,
    fontWeight: '400',
    color: '#B3B3B3',
    marginTop: 2,
  },
  actionCardArrow: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7C3AED',
  },

  // ── Section header ───────────────────────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  sectionHeaderCount: {
    fontSize: 11,
    fontWeight: '600',
    color: '#B3B3B3',
    letterSpacing: 1,
  },

  // ── League card ──────────────────────────────────────────────────────────
  leagueCardV2: {
    backgroundColor: '#181818',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  leagueCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leagueColorSquare: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  leagueColorSquareImage: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  leagueColorSquareInitial: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  leagueCardInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  leagueCardName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  leagueCardSubtext: {
    fontSize: 12,
    fontWeight: '400',
    color: '#B3B3B3',
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  leagueCardProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
  },
  leagueCardRank: {
    fontSize: 18,
    fontWeight: '700',
    color: '#7C3AED',
    width: 44,
  },
  leagueCardMiddle: {
    flex: 1,
    marginHorizontal: 8,
  },
  leagueCardGap: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B3B3B3',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 4,
    borderRadius: 2,
  },
  leagueCardTotal: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    minWidth: 40,
    textAlign: 'right',
  },
  memberAvatarsInline: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 44,
  },
  memberAvatarInline: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#181818',
    overflow: 'hidden',
  },
  memberAvatarInlineImage: { width: 22, height: 22, borderRadius: 11 },
  memberAvatarInlineText: { fontSize: 9, fontWeight: '600', color: '#FFFFFF' },
  memberAvatarInlineMore: { backgroundColor: '#3A3A3A' },
  memberAvatarInlineMoreText: { fontSize: 9, fontWeight: '600', color: '#B3B3B3' },

  // ── Empty / zoom ─────────────────────────────────────────────────────────
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
