import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Animated,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { deletePastLeague, getPastLeagues, PastLeague } from '../src/services/api';
import { useAuth } from '../src/context/AuthContext';
import { leagueEvents } from '../src/utils/leagueEvents';
import { pastLeaguesCache } from '../src/utils/pastLeaguesCache';
import LeagueAvatar from '../src/components/LeagueAvatar';
import { colors } from '../src/theme/colors';

const PURPLE = colors.accent;

// Format a finish date as "Aug 24" — abbreviated month + 2-digit year.
function formatFinishShort(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // Display "Mon D" (e.g. "Apr 22"). The previous "Mon YY" was
  // ambiguous — "Apr 26" read as day-26 instead of year-2026.
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function ordinalParts(n: number): { num: string; suffix: string } {
  const s = ['TH', 'ST', 'ND', 'RD'];
  const v = n % 100;
  const suffix = s[(v - 20) % 10] || s[v] || s[0];
  return { num: String(n), suffix };
}

export default function PastLeaguesPage() {
  const router = useRouter();
  const { user } = useAuth();
  // Seed from the module-level cache so re-entering the page shows data
  // immediately while a background refetch runs (stale-while-revalidate).
  // Spinner only renders when there's literally nothing to show yet.
  const cached = pastLeaguesCache.get();
  const [leagues, setLeagues] = useState<PastLeague[]>(cached ?? []);
  const [loading, setLoading] = useState(cached == null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState<string>('');

  const fetchAll = useCallback(async () => {
    try {
      const res = await getPastLeagues();
      setLeagues(res.data.leagues);
      pastLeaguesCache.set(res.data.leagues);
    } catch (e) {
      // Keep prior state on error — avoids a flash-to-empty.
      console.warn('getPastLeagues failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Always kick a background refetch on focus. The UI already shows
      // cached data (via state seeded from pastLeaguesCache), so this is
      // silent unless the response actually changes.
      fetchAll();
    }, [fetchAll]),
  );

  useEffect(() => {
    // League deletion / completion / clear-account-data all emit on
    // leagueEvents. Invalidate the cache and refetch so the list stays
    // in sync without navigating away and back.
    const unsub = leagueEvents.subscribe(() => {
      pastLeaguesCache.clear();
      fetchAll();
    });
    return () => {
      unsub();
    };
  }, [fetchAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    pastLeaguesCache.clear();
    await fetchAll();
    setRefreshing(false);
  };

  // Swipe-to-delete state. `pendingDelete` drives the confirmation
  // modal; `deletingId` disables the confirm button while the API call
  // is in flight.
  const [pendingDelete, setPendingDelete] = useState<PastLeague | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const swipeRefs = useRef<Record<string, Swipeable | null>>({});

  const askDelete = (league: PastLeague) => {
    // Close the swipe so the red "Delete" button doesn't remain exposed
    // behind the confirm modal.
    swipeRefs.current[league.id]?.close();
    setPendingDelete(league);
  };

  const confirmDelete = async () => {
    const league = pendingDelete;
    if (!league) return;
    setDeletingId(league.id);
    try {
      await deletePastLeague(league.id);
      // Optimistic local removal — matches the snapshot state the
      // backend just wrote for this user.
      setLeagues((prev) => {
        const next = prev.filter((l) => l.id !== league.id);
        pastLeaguesCache.set(next);
        return next;
      });
      setPendingDelete(null);
    } catch (e: any) {
      Alert.alert(
        'Error',
        e?.response?.data?.detail || 'Could not remove this league.',
      );
    } finally {
      setDeletingId(null);
    }
  };

  const renderRightAction = (
    progress: Animated.AnimatedInterpolation<number>,
    item: PastLeague,
  ) => {
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [88, 0],
      extrapolate: 'clamp',
    });
    return (
      <Animated.View
        style={[styles.swipeActionWrap, { transform: [{ translateX }] }]}
      >
        <TouchableOpacity
          style={styles.swipeDeleteBtn}
          activeOpacity={0.85}
          onPress={() => askDelete(item)}
        >
          <Ionicons name="trash" size={20} color={colors.onAccent} />
          <Text style={styles.swipeDeleteText}>Delete</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderRow = ({ item }: { item: PastLeague }) => {
    const isNotFinished = item.ended_status === 'not_finished';
    const winner = item.winner;
    const winnerIsMe = !!winner && winner.user_id === user?.id;
    const mePlace = item.my_place;
    const totalPlayers = item.members_count || 0;
    const place = mePlace != null ? ordinalParts(mePlace) : null;
    const placeColor = place && place.num === '1' ? PURPLE : colors.textPrimary;
    const rounds = item.total_rounds || item.rounds_completed || 0;

    return (
      <Swipeable
        ref={(ref) => {
          swipeRefs.current[item.id] = ref;
        }}
        renderRightActions={(p) => renderRightAction(p, item)}
        rightThreshold={40}
        friction={2}
        overshootRight={false}
      >
        <TouchableOpacity
          style={styles.row}
          activeOpacity={0.75}
          onPress={() => router.push(`/past-league/${item.id}` as any)}
        >
          <LeagueAvatar
            image={item.league_image}
            name={item.name}
            size={48}
            imageBorderRadius={10}
          />
          <View style={styles.middle}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
            </View>
            <Text style={styles.meta} numberOfLines={1}>
              {formatFinishShort(item.finished_at)} · {rounds} rounds
              {!isNotFinished && winner ? ' · ' : ''}
              {!isNotFinished && winner ? (
                winnerIsMe ? (
                  <>
                    won by <Text style={styles.wonByYou}>you</Text>
                  </>
                ) : (
                  `won by ${winner.username}`
                )
              ) : null}
            </Text>
          </View>
          <View style={styles.placeWrap}>
            {isNotFinished ? (
              <View style={styles.notFinishedPill}>
                <Text style={styles.notFinishedText}>NOT FINISHED</Text>
              </View>
            ) : place ? (
              <>
                <View style={styles.placeRow}>
                  <Text style={[styles.placeNum, { color: placeColor }]}>{place.num}</Text>
                  <Text style={[styles.placeSuffix, { color: placeColor }]}>{place.suffix}</Text>
                </View>
                <Text style={styles.placeOf}>OF {totalPlayers}</Text>
              </>
            ) : (
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            )}
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  const count = leagues.length;

  const trimmedQuery = query.trim().toLowerCase();
  const filteredLeagues = trimmedQuery
    ? leagues.filter((l) => {
        if (l.name && l.name.toLowerCase().includes(trimmedQuery)) return true;
        if (l.winner && l.winner.username.toLowerCase().includes(trimmedQuery)) return true;
        if (l.standings && l.standings.some((s) => s.username.toLowerCase().includes(trimmedQuery))) return true;
        if (l.left_members && l.left_members.some((m) => m.username.toLowerCase().includes(trimmedQuery))) return true;
        return false;
      })
    : leagues;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.headerBar}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            hitSlop={10}
          >
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.titleBlock}>
          <Text style={styles.title}>PAST LEAGUES</Text>
          <View style={styles.subtitleRow}>
            <Text style={styles.subtitle}>
              {count} archived · Tap league to view results
            </Text>
            <TouchableOpacity
              hitSlop={10}
              onPress={() =>
                Alert.alert(
                  'About past leagues',
                  'Tap a past league to see its final standings and the songs you submitted. To permanently delete a league, swipe the row left and press Delete.',
                  [{ text: 'Got it', style: 'default' }]
                )
              }
              style={styles.infoBtn}
            >
              <Ionicons
                name="information-circle-outline"
                size={16}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>

        {leagues.length > 0 && (
          <View style={styles.searchBarWrap}>
            <View style={styles.searchBar}>
              <Ionicons
                name="search"
                size={18}
                color={colors.textTertiary}
                style={styles.searchIcon}
              />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search by league or member"
                placeholderTextColor={colors.textPlaceholder}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
              />
              {query.length > 0 && (
                <TouchableOpacity
                  onPress={() => setQuery('')}
                  hitSlop={10}
                  style={styles.searchClearBtn}
                >
                  <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {loading && leagues.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={PURPLE} />
          </View>
        ) : leagues.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>
              Finished and deleted leagues will show up here.
            </Text>
          </View>
        ) : trimmedQuery && filteredLeagues.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>
              No leagues or members match "{query}"
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredLeagues}
            keyExtractor={(item) => item.id}
            renderItem={renderRow}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={PURPLE}
              />
            }
          />
        )}

        {/* Swipe-to-delete confirm modal */}
        <Modal
          visible={pendingDelete != null}
          transparent
          animationType="fade"
          onRequestClose={() => setPendingDelete(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalPopup}>
              <Text style={styles.modalTitle}>Delete this league?</Text>
              <Text style={styles.modalBody}>
                Delete this league from your past leagues? This removes it
                from your archive but does not affect other members.
              </Text>
              <View style={styles.modalRow}>
                <TouchableOpacity
                  style={styles.modalCancel}
                  onPress={() => setPendingDelete(null)}
                  disabled={deletingId != null}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalConfirm}
                  onPress={confirmDelete}
                  disabled={deletingId != null}
                  activeOpacity={0.85}
                >
                  {deletingId != null ? (
                    <ActivityIndicator color={colors.onAccent} />
                  ) : (
                    <Text style={styles.modalConfirmText}>Delete</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 4,
  },
  backBtn: { padding: 6 },

  titleBlock: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 6,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoBtn: {
    marginLeft: 6,
    marginTop: 6,
  },

  searchBarWrap: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  searchBar: {
    height: 52,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  searchIcon: { marginRight: 10 },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
    paddingVertical: 0,
  },
  searchClearBtn: {
    marginLeft: 8,
  },

  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  separator: { height: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface2,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  middle: {
    flex: 1,
    marginHorizontal: 14,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 15,
    flexShrink: 1,
  },
  meta: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  wonByYou: {
    color: colors.accent,
    fontWeight: '700',
  },
  deletedTag: {
    backgroundColor: 'rgba(239,68,68,0.18)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  deletedTagText: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  notFinishedPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.border,
  },
  notFinishedText: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  placeWrap: {
    alignItems: 'flex-end',
    minWidth: 56,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  placeNum: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  placeSuffix: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginLeft: 1,
  },
  placeOf: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 2,
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },

  // Swipe-to-delete action + confirm modal
  swipeActionWrap: {
    width: 88,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  swipeDeleteBtn: {
    backgroundColor: colors.danger,
    width: 72,
    height: 72,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  swipeDeleteText: {
    color: colors.onAccent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalPopup: {
    backgroundColor: colors.surface3,
    borderRadius: 14,
    padding: 20,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  modalBody: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 18,
  },
  modalRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: colors.surface4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: { color: colors.textPrimary, fontWeight: '700', fontSize: 14 },
  modalConfirm: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: {
    color: colors.onAccent,
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.5,
  },
});
