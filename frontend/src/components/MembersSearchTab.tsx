import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { searchUsers, followUser, unfollowUser, UserSearchResult } from '../services/api';

const PURPLE = '#7C3AED';

interface Props {
  query: string;
}

export default function MembersSearchTab({ query }: Props) {
  const router = useRouter();

  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [users, setUsers] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  // The row whose Follow pill is currently in flight — single id since
  // we don't expect concurrent taps. Disables the pill and lets us
  // ignore double-tap.
  const [followingId, setFollowingId] = useState<string | null>(null);

  // Debounce the incoming query so we don't fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  // Fetch when the debounced query changes. Empty query → clear results
  // and don't hit the network (the hint state below renders instead).
  useEffect(() => {
    if (!debouncedQuery) {
      setUsers([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await searchUsers(debouncedQuery);
        if (!cancelled) setUsers(res.data.users);
      } catch {
        if (!cancelled) setUsers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  // Tap "Follow" — the backend returns the fully-resolved relationship
  // status ('following', 'friends', 'requested', etc.), so we trust it
  // directly. We only fall back to deriving the next state from the
  // prior one (mutual → 'friends', otherwise 'following') if the server
  // returns nothing.
  const onFollow = async (item: UserSearchResult) => {
    if (followingId) return;
    setFollowingId(item.id);
    try {
      const res = await followUser(item.id);
      const status = res.data?.data?.status;
      const next: UserSearchResult['follow_state'] =
        (status as UserSearchResult['follow_state']) ??
        (item.follow_state === 'follows_you' ? 'friends' : 'following');
      setUsers((prev) =>
        prev.map((u) =>
          u.id === item.id ? { ...u, follow_state: next } : u,
        ),
      );
    } catch {
      Alert.alert('Could not follow', 'Please try again.');
    } finally {
      setFollowingId(null);
    }
  };

  const onCancelRequest = async (item: UserSearchResult) => {
    if (followingId) return;
    setFollowingId(item.id);
    const prevState = item.follow_state;
    // Optimistically clear the request
    setUsers((prev) =>
      prev.map((u) => (u.id === item.id ? { ...u, follow_state: 'none' } : u)),
    );
    try {
      await unfollowUser(item.id);
    } catch {
      setUsers((prev) =>
        prev.map((u) => (u.id === item.id ? { ...u, follow_state: prevState } : u)),
      );
      Alert.alert('Could not cancel', 'Please try again.');
    } finally {
      setFollowingId(null);
    }
  };

  const renderRow = ({ item }: { item: UserSearchResult }) => {
    const initial = (item.username || '?').charAt(0).toUpperCase();
    const inFlight = followingId === item.id;

    // 'follows_you' is rendered as a plain "Follow" pill too —
    // Instagram-style. The muted-tag branch is reserved for outgoing
    // states (following / friends / requested).
    const isFollowable =
      item.follow_state === 'none' || item.follow_state === 'follows_you';

    let indicator: React.ReactNode;
    if (isFollowable) {
      indicator = (
        <TouchableOpacity
          style={styles.followBtn}
          activeOpacity={0.85}
          onPress={() => onFollow(item)}
          disabled={inFlight}
          hitSlop={6}
        >
          {inFlight ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Ionicons name="add" size={14} color="#FFFFFF" />
              <Text style={styles.followBtnText}>Follow</Text>
            </>
          )}
        </TouchableOpacity>
      );
    } else if (item.follow_state === 'requested') {
      indicator = (
        <TouchableOpacity
          style={styles.mutedTag}
          activeOpacity={0.85}
          onPress={() => onCancelRequest(item)}
          disabled={inFlight}
          hitSlop={6}
        >
          {inFlight ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.mutedTagText}>Requested</Text>
          )}
        </TouchableOpacity>
      );
    } else {
      const label =
        item.follow_state === 'following' ? 'Following' : 'Friends';
      indicator = (
        <View style={styles.mutedTag}>
          <Text style={styles.mutedTagText}>{label}</Text>
        </View>
      );
    }

    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.75}
        onPress={() => router.push(`/user/${item.id}` as any)}
      >
        {item.profile_photo ? (
          <Image source={{ uri: item.profile_photo }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
        )}
        <View style={styles.identity}>
          <View style={styles.nameRow}>
            {item.is_private && (
              <Ionicons
                name="lock-closed"
                size={12}
                color="#8B8B8B"
                style={styles.lockIcon}
              />
            )}
            <Text style={styles.username} numberOfLines={1}>
              @{item.username}
            </Text>
          </View>
        </View>
        {indicator}
      </TouchableOpacity>
    );
  };

  if (!debouncedQuery) {
    return (
      <View style={styles.center}>
        <Text style={styles.hintText}>Search for a member by username</Text>
      </View>
    );
  }

  if (loading && users.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={PURPLE} />
      </View>
    );
  }

  if (users.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>
          No members match "{debouncedQuery}".
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={users}
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
    paddingVertical: 12,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    backgroundColor: '#282828',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  identity: { flex: 1 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lockIcon: { marginRight: 6 },
  username: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  followBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PURPLE,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    gap: 4,
    minWidth: 92,
    justifyContent: 'center',
  },
  followBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.4,
  },
  mutedTag: {
    paddingVertical: 7,
    paddingHorizontal: 12,
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
    letterSpacing: 0.4,
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
