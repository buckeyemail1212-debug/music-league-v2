import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  searchLeagues,
  joinPublicLeague,
  joinLeague,
  LeagueSearchResult,
} from '../services/api';
import { leagueEvents } from '../utils/leagueEvents';
import LeagueAvatar from './LeagueAvatar';

const PURPLE = '#7C3AED';

const parseStartsAt = (s: string): Date =>
  new Date(s.endsWith('Z') || s.includes('+') ? s : s + 'Z');

interface Props {
  query: string;
}

export default function LeaguesSearchTab({ query }: Props) {
  const router = useRouter();

  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [leagues, setLeagues] = useState<LeagueSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  // Debounce the incoming query so we don't fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  // Fetch when the debounced query changes. Empty query → clear results
  // and don't hit the network (the hint state below renders instead).
  useEffect(() => {
    if (!debouncedQuery) {
      setLeagues([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await searchLeagues(debouncedQuery);
        if (!cancelled) setLeagues(res.data.leagues);
      } catch {
        if (!cancelled) setLeagues([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  // Has the league's start time already passed? Treats missing
  // starts_at as already-started so the join is gated.
  const hasStarted = (item: LeagueSearchResult): boolean => {
    if (!item.starts_at) return true;
    return parseStartsAt(item.starts_at).getTime() <= Date.now();
  };

  // Public join — mirrors public-leagues.tsx handleJoin exactly,
  // including the optimistic flip, leagueEvents.emit(), and the
  // generic-block 403 message.
  const handlePublicJoin = async (item: LeagueSearchResult) => {
    if (joiningId) return;
    setJoiningId(item.id);
    try {
      await joinPublicLeague(item.id);
      setLeagues((prev) =>
        prev.map((l) =>
          l.id === item.id
            ? { ...l, has_current_user_joined: true, member_count: l.member_count + 1 }
            : l,
        ),
      );
      leagueEvents.emit();
    } catch (e: any) {
      const status = e?.response?.status;
      const detail = e?.response?.data?.detail || '';
      if (status === 403 && /block/i.test(detail)) {
        Alert.alert('Could not join', "You can't join this league because of a block.");
      } else {
        Alert.alert('Could not join', detail || 'Please try again.');
      }
    } finally {
      setJoiningId(null);
    }
  };

  // Private join — Alert.prompt (iOS) collects the code; on success we
  // flip the matching row optimistically by the returned league id (the
  // entered code may not correspond to the row tapped) and emit the
  // global event so the rest of the app reconciles.
  const onPrivateJoinTap = (item: LeagueSearchResult) => {
    if (joiningId) return;
    Alert.prompt(
      `Join "${item.name}"`,
      'Enter the join code:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Join',
          onPress: (raw?: string) => handlePrivateJoin(item, (raw || '').trim()),
        },
      ],
      'plain-text',
    );
  };

  const handlePrivateJoin = async (item: LeagueSearchResult, code: string) => {
    if (!code) {
      Alert.alert('Could not join', 'Check the code and try again.');
      return;
    }
    if (joiningId) return;
    setJoiningId(item.id);
    try {
      const res = await joinLeague(code);
      const joinedId = (res.data as any)?.id;
      if (joinedId) {
        setLeagues((prev) =>
          prev.map((l) =>
            l.id === joinedId
              ? { ...l, has_current_user_joined: true, member_count: l.member_count + 1 }
              : l,
          ),
        );
      }
      leagueEvents.emit();
      Alert.alert('Joined', `You're in "${item.name}".`);
    } catch (e: any) {
      const detail = e?.response?.data?.detail || '';
      Alert.alert('Could not join', detail || 'Check the code and try again.');
    } finally {
      setJoiningId(null);
    }
  };

  const renderRow = ({ item }: { item: LeagueSearchResult }) => {
    const joined = item.has_current_user_joined;
    const isFull = item.member_count >= item.member_cap;
    const started = hasStarted(item);
    const rounds = item.total_rounds || 0;

    // The row-tap behavior is what the right-side action would do — so
    // tapping anywhere on a joined row goes to the league, a full or
    // started row alerts, a joinable row triggers the matching join.
    let onRowPress: (() => void) | undefined;
    if (joined) {
      onRowPress = () => router.push(`/league/${item.id}` as any);
    } else if (item.is_public && isFull) {
      onRowPress = () => Alert.alert("Can't join", 'This league is already full.');
    } else if (item.is_public && started) {
      onRowPress = () => Alert.alert("Can't join", 'This league has already started.');
    }

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
          <View style={styles.nameRow}>
            {!item.is_public && (
              <Ionicons
                name="lock-closed"
                size={12}
                color="#B3B3B3"
                style={styles.lockIcon}
              />
            )}
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
          </View>
          {item.genre ? (
            <Text style={styles.genre} numberOfLines={1}>
              {item.genre}
            </Text>
          ) : null}
          <Text style={styles.meta} numberOfLines={1}>
            {!item.is_public ? 'Private · ' : ''}
            {rounds} {rounds === 1 ? 'round' : 'rounds'}
          </Text>
        </View>
        <View style={styles.actionWrap}>
          {joined ? (
            <View style={styles.mutedTag}>
              <Text style={styles.mutedTagText}>Joined</Text>
            </View>
          ) : item.is_public && isFull ? (
            <View style={styles.mutedTag}>
              <Text style={styles.mutedTagText}>Full</Text>
            </View>
          ) : item.is_public && started ? (
            <View style={styles.mutedTag}>
              <Text style={styles.mutedTagText}>Started</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.joinBtn}
              onPress={() =>
                item.is_public ? handlePublicJoin(item) : onPrivateJoinTap(item)
              }
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

  if (!debouncedQuery) {
    return (
      <View style={styles.center}>
        <Text style={styles.hintText}>Search for a league by name or genre</Text>
      </View>
    );
  }

  if (loading && leagues.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={PURPLE} />
      </View>
    );
  }

  if (leagues.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>
          No leagues match "{debouncedQuery}".
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={leagues}
      keyExtractor={(item) => item.id}
      renderItem={renderRow}
      contentContainerStyle={styles.listContent}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    />
  );
}

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 },
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lockIcon: { marginRight: 6 },
  name: { color: '#FFFFFF', fontWeight: '700', fontSize: 15, flexShrink: 1 },
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

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  hintText: { color: '#6A6A6A', fontSize: 14, textAlign: 'center' },
  emptyText: { color: '#B3B3B3', fontSize: 13, textAlign: 'center' },
});
