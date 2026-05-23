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
import { searchUsers, followUser, UserSearchResult } from '../services/api';

const PURPLE = '#7C3AED';

interface Props {
  query: string;
}

export default function MembersSearchTab({ query }: Props) {
  const router = useRouter();

  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [users, setUsers] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  // Tracks which private rows have a follow request in flight (busy)
  // or already sent in this session (so the icon can swap). Map values
  // are 'requesting' | 'sent'.
  const [requestState, setRequestState] = useState<
    Record<string, 'requesting' | 'sent'>
  >({});

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

  const onRequestFollow = async (item: UserSearchResult) => {
    if (requestState[item.id]) return;
    setRequestState((prev) => ({ ...prev, [item.id]: 'requesting' }));
    try {
      await followUser(item.id);
      setRequestState((prev) => ({ ...prev, [item.id]: 'sent' }));
      Alert.alert(
        'Request sent',
        `Your follow request was sent to @${item.username}.`,
      );
    } catch {
      setRequestState((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      Alert.alert('Could not send request', 'Please try again.');
    }
  };

  const renderRow = ({ item }: { item: UserSearchResult }) => {
    const initial = (item.username || '?').charAt(0).toUpperCase();
    const state = requestState[item.id];
    const requesting = state === 'requesting';
    const sent = state === 'sent';

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
        <Text style={styles.username} numberOfLines={1}>
          @{item.username}
        </Text>
        {item.is_private && (
          <View style={styles.actions}>
            <Ionicons
              name="lock-closed"
              size={14}
              color="#8B8B8B"
              style={styles.lockIcon}
            />
            <TouchableOpacity
              style={styles.addBtn}
              activeOpacity={0.75}
              onPress={() => onRequestFollow(item)}
              disabled={requesting || sent}
              hitSlop={10}
            >
              {requesting ? (
                <ActivityIndicator color={PURPLE} size="small" />
              ) : (
                <Ionicons
                  name={sent ? 'checkmark' : 'person-add-outline'}
                  size={20}
                  color={sent ? '#8B8B8B' : PURPLE}
                />
              )}
            </TouchableOpacity>
          </View>
        )}
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
  username: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lockIcon: { marginRight: 10 },
  addBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
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
