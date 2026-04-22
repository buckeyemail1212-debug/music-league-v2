import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { getPastLeagues, PastLeague } from '../src/services/api';
import { useAuth } from '../src/context/AuthContext';
import { leagueEvents } from '../src/utils/leagueEvents';
import LeagueAvatar from '../src/components/LeagueAvatar';

const PURPLE = '#7C3AED';

// Format a finish date as "Aug 24" — abbreviated month + 2-digit year.
function formatFinishShort(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const yy = String(d.getFullYear()).slice(-2);
  return `${months[d.getMonth()]} ${yy}`;
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [leagues, setLeagues] = useState<PastLeague[]>([]);

  const fetchAll = useCallback(async () => {
    try {
      const res = await getPastLeagues();
      setLeagues(res.data.leagues);
    } catch (e) {
      // Keep prior state on error — avoids a flash-to-empty.
      console.warn('getPastLeagues failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll]),
  );

  useEffect(() => {
    const unsub = leagueEvents.subscribe(fetchAll);
    return () => {
      unsub();
    };
  }, [fetchAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const renderRow = ({ item }: { item: PastLeague }) => {
    const winner = item.winner;
    const winnerIsMe = !!winner && winner.user_id === user?.id;
    const mePlace = item.my_place;
    const totalPlayers = item.members_count || 0;
    const place = mePlace != null ? ordinalParts(mePlace) : null;
    const placeColor = place && place.num === '1' ? PURPLE : '#FFFFFF';
    const rounds = item.total_rounds || item.rounds_completed || 0;

    return (
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
            {item.is_deleted && (
              <View style={styles.deletedTag}>
                <Text style={styles.deletedTagText}>DELETED</Text>
              </View>
            )}
          </View>
          <Text style={styles.meta} numberOfLines={1}>
            {formatFinishShort(item.finished_at)} · {rounds} rounds
            {winner ? ' · ' : ''}
            {winner ? (
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
          {place ? (
            <>
              <View style={styles.placeRow}>
                <Text style={[styles.placeNum, { color: placeColor }]}>{place.num}</Text>
                <Text style={[styles.placeSuffix, { color: placeColor }]}>{place.suffix}</Text>
              </View>
              <Text style={styles.placeOf}>OF {totalPlayers}</Text>
            </>
          ) : (
            <Ionicons name="chevron-forward" size={18} color="#6A6A6A" />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const count = leagues.length;

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
        <Text style={styles.title}>PAST LEAGUES</Text>
        <Text style={styles.subtitle}>
          {count} archived · tap any to see final standings
        </Text>
      </View>

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
    paddingBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 13,
    color: '#B3B3B3',
    marginTop: 6,
  },

  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  separator: { height: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181818',
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
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
    flexShrink: 1,
  },
  meta: {
    color: '#B3B3B3',
    fontSize: 12,
    marginTop: 4,
  },
  wonByYou: {
    color: PURPLE,
    fontWeight: '700',
  },
  deletedTag: {
    backgroundColor: 'rgba(239,68,68,0.18)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  deletedTagText: {
    color: '#EF4444',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
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
    color: '#6A6A6A',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 2,
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { color: '#B3B3B3', fontSize: 13, textAlign: 'center' },
});
