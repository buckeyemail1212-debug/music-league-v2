import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  getPublicLeagues,
  joinPublicLeague,
  PublicLeagueSummary,
} from '../src/services/api';
import { leagueEvents } from '../src/utils/leagueEvents';
import { publicLeaguesCache } from '../src/utils/publicLeaguesCache';
import LeagueAvatar from '../src/components/LeagueAvatar';

const PURPLE = '#7C3AED';

const parseDeadline = (d: string) =>
  new Date(d.endsWith('Z') || d.includes('+') ? d : d + 'Z');

// Same smart-format used on the Home screen countdown pill.
const formatCountdown = (deadline: string, now: number): string => {
  const diffMs = parseDeadline(deadline).getTime() - now;
  if (diffMs <= 0) return '0S';
  const totalSeconds = Math.floor(diffMs / 1000);
  if (totalSeconds < 60) return `${Math.max(1, totalSeconds)}S`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}M`;
  const hours = Math.floor(totalMinutes / 60);
  const minutesAfterHours = totalMinutes % 60;
  if (hours < 24) return `${hours}H ${minutesAfterHours}M`;
  const days = Math.floor(hours / 24);
  const hoursAfterDays = hours % 24;
  return `${days}D ${hoursAfterDays}H ${minutesAfterHours}M`;
};

export default function PublicLeaguesPage() {
  const router = useRouter();

  const cached = publicLeaguesCache.get();
  const [leagues, setLeagues] = useState<PublicLeagueSummary[]>(cached ?? []);
  const [loading, setLoading] = useState(cached == null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  // One page-level tick so 50 rows don't each own a timer.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Debounce search input so we don't hammer the server while typing.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  const fetchPublic = useCallback(
    async (q: string) => {
      try {
        const res = await getPublicLeagues(q ? { q } : undefined);
        setLeagues(res.data.leagues);
        // Only seed the shared cache for the unfiltered view — search
        // results are transient and shouldn't leak into later loads.
        if (!q) publicLeaguesCache.set(res.data.leagues);
      } catch (e) {
        console.warn('getPublicLeagues failed', e);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      fetchPublic(debouncedQuery);
    }, [fetchPublic, debouncedQuery]),
  );

  // Refetch when the debounced query changes.
  useEffect(() => {
    fetchPublic(debouncedQuery);
  }, [debouncedQuery, fetchPublic]);

  // Invalidate on join/leave/create events from elsewhere in the app.
  useEffect(() => {
    const unsub = leagueEvents.subscribe(() => {
      publicLeaguesCache.clear();
      fetchPublic(debouncedQuery);
    });
    return () => {
      unsub();
    };
  }, [fetchPublic, debouncedQuery]);

  // Periodic background refresh so newly-created public leagues surface
  // without requiring a pull-to-refresh.
  useEffect(() => {
    const id = setInterval(() => {
      fetchPublic(debouncedQuery);
    }, 30000);
    return () => clearInterval(id);
  }, [fetchPublic, debouncedQuery]);

  const onRefresh = async () => {
    setRefreshing(true);
    publicLeaguesCache.clear();
    await fetchPublic(debouncedQuery);
    setRefreshing(false);
  };

  const handleJoin = async (league: PublicLeagueSummary) => {
    if (joiningId) return;
    setJoiningId(league.id);
    try {
      await joinPublicLeague(league.id);
      // Optimistically flip the row. The subsequent refetch + leagueEvents
      // emit will reconcile counts for other tabs (home active list).
      setLeagues((prev) =>
        prev.map((l) =>
          l.id === league.id
            ? {
                ...l,
                has_current_user_joined: true,
                member_count: l.member_count + 1,
              }
            : l,
        ),
      );
      leagueEvents.emit();
    } catch (e: any) {
      Alert.alert(
        'Could not join',
        e?.response?.data?.detail || 'Please try again.',
      );
    } finally {
      setJoiningId(null);
    }
  };

  const renderRow = ({ item }: { item: PublicLeagueSummary }) => {
    const isFull = item.member_count >= item.member_cap;
    const joined = item.has_current_user_joined;
    const countdown = formatCountdown(item.starts_at, nowMs);
    const rounds = item.total_rounds || 0;

    // If already a member, tapping the row should open the league detail.
    const onRowPress = joined
      ? () => router.push(`/league/${item.id}`)
      : undefined;

    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={onRowPress ? 0.75 : 1}
        onPress={onRowPress}
        disabled={!onRowPress}
      >
        <LeagueAvatar
          image={item.league_image}
          name={item.name}
          size={48}
          imageBorderRadius={10}
        />
        <View style={styles.middle}>
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
          {item.genre ? (
            <Text style={styles.genre} numberOfLines={1}>
              {item.genre}
            </Text>
          ) : null}
          <Text style={styles.meta} numberOfLines={1}>
            {rounds} {rounds === 1 ? 'round' : 'rounds'} · Starts in {countdown}
          </Text>
        </View>
        <View style={styles.actionWrap}>
          {joined ? (
            <View style={styles.mutedTag}>
              <Text style={styles.mutedTagText}>Joined</Text>
            </View>
          ) : isFull ? (
            <View style={styles.mutedTag}>
              <Text style={styles.mutedTagText}>Full</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.joinBtn}
              onPress={() => handleJoin(item)}
              disabled={joiningId === item.id}
              activeOpacity={0.85}
            >
              {joiningId === item.id ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.joinBtnText}>Join League</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const count = leagues.length;
  const countLabel = `${count} public ${count === 1 ? 'league' : 'leagues'}`;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>PUBLIC LEAGUES</Text>
      </View>

      <Text style={styles.countLine}>{countLabel}</Text>

      <View style={styles.searchWrap}>
        <Ionicons
          name="search"
          size={18}
          color="#6A6A6A"
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or genre"
          placeholderTextColor="#6A6A6A"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity
            onPress={() => setQuery('')}
            hitSlop={10}
            style={styles.clearBtn}
          >
            <Ionicons name="close-circle" size={18} color="#6A6A6A" />
          </TouchableOpacity>
        )}
      </View>

      {loading && leagues.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={PURPLE} />
        </View>
      ) : leagues.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            {debouncedQuery
              ? `No public leagues match "${debouncedQuery}".`
              : 'No public leagues are starting soon. Check back later.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={leagues}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
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
    paddingBottom: 6,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  countLine: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    fontSize: 13,
    color: '#B3B3B3',
  },

  searchWrap: {
    marginHorizontal: 20,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181818',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 14,
  },
  clearBtn: { padding: 4 },

  listContent: { paddingHorizontal: 20, paddingBottom: 40 },
  separator: { height: 10 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181818',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  middle: { flex: 1, marginHorizontal: 14 },
  name: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  genre: {
    color: '#8B8B8B',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 3,
  },
  meta: { color: '#B3B3B3', fontSize: 12, marginTop: 4 },
  actionWrap: { alignItems: 'flex-end', minWidth: 92 },
  joinBtn: {
    backgroundColor: PURPLE,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 92,
  },
  joinBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.6,
  },
  mutedTag: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 92,
  },
  mutedTagText: {
    color: '#B3B3B3',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.5,
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { color: '#B3B3B3', fontSize: 13, textAlign: 'center' },
});
