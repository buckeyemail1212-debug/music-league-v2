import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import {
  BlockedUser,
  getBlockedUsers,
  unblockUser,
} from '../src/services/api';
import { apiCache } from '../src/services/apiCache';

const TTL_MS = 60 * 1000;

const SUBMISSION_COLORS = ['#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899'];
const pickColor = (seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) >>> 0;
  return SUBMISSION_COLORS[h % SUBMISSION_COLORS.length];
};

const cacheKey = (viewerId: string) => `blocked-users:${viewerId}`;

export default function BlockedAccountsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const viewerId = user?.id ?? '';

  const [users, setUsers] = useState<BlockedUser[] | null>(null);
  const [loadError, setLoadError] = useState<'network' | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [unblocking, setUnblocking] = useState(false);

  const load = useCallback(() => {
    if (!viewerId) return;
    setLoadError(null);
    apiCache
      .swr<BlockedUser[]>(
        cacheKey(viewerId),
        () => getBlockedUsers().then((r) => r.data.data.users ?? []),
        setUsers,
        TTL_MS,
      )
      .then(setUsers)
      .catch(() => setLoadError((prev) => prev ?? 'network'));
  }, [viewerId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onUnblock = (target: BlockedUser) => {
    Alert.alert(
      `Unblock @${target.username}?`,
      `They'll be able to see your profile and join leagues with you again. (You'll need to re-follow them if you want to.)`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          style: 'destructive',
          onPress: async () => {
            // Optimistic removal — the call is idempotent server-side
            // so a retry-after-rollback is safe.
            const prev = users ?? [];
            setUsers(prev.filter((u) => u.user_id !== target.user_id));
            try {
              await unblockUser(target.user_id);
              apiCache.invalidate(cacheKey(viewerId));
              load();
            } catch {
              setUsers(prev);
              Alert.alert('Could not unblock', 'Please try again.');
            }
          },
        },
      ],
    );
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const allIds = (users ?? []).map((u) => u.user_id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(allIds));
  };
  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); };
  const onUnblockSelected = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    Alert.alert(
      'Unblock selected',
      `Unblock ${ids.length} ${ids.length === 1 ? 'account' : 'accounts'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          style: 'destructive',
          onPress: async () => {
            setUnblocking(true);
            try {
              for (const id of ids) {
                await unblockUser(id);
              }
              apiCache.clear?.(cacheKey(viewerId));
              exitSelectMode();
              load();
            } catch {
              Alert.alert('Could not unblock', 'Some accounts may not have been unblocked. Please try again.');
              load();
            } finally {
              setUnblocking(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        {selectMode ? (
          <>
            <TouchableOpacity onPress={exitSelectMode} hitSlop={8} style={styles.headerBtn}>
              <Text style={styles.headerActionText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{selectedIds.size} selected</Text>
            <TouchableOpacity onPress={toggleSelectAll} hitSlop={8} style={styles.headerBtn}>
              <Text style={styles.headerActionText}>{allSelected ? 'None' : 'All'}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
              <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Blocked accounts</Text>
            <TouchableOpacity
              onPress={() => setSelectMode(true)}
              hitSlop={8}
              style={styles.headerBtn}
              disabled={(users ?? []).length === 0}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={(users ?? []).length === 0 ? '#3A3A3A' : '#FFFFFF'} />
            </TouchableOpacity>
          </>
        )}
      </View>

      {users === null && !loadError ? (
        <View style={styles.center}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : loadError === 'network' ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color="#6A6A6A" />
          <Text style={styles.emptyTitle}>Couldn&rsquo;t load</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryBtnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (users ?? []).length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="ban-outline" size={40} color="#6A6A6A" />
          <Text style={styles.emptyText}>You haven&rsquo;t blocked anyone.</Text>
        </View>
      ) : (
        <FlatList
          data={users ?? []}
          keyExtractor={(u) => u.user_id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              activeOpacity={selectMode ? 0.7 : 1}
              onPress={selectMode ? () => toggleSelect(item.user_id) : undefined}
            >
              {selectMode && (
                <Ionicons
                  name={selectedIds.has(item.user_id) ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={selectedIds.has(item.user_id) ? '#7C3AED' : '#6A6A6A'}
                  style={{ marginRight: 12 }}
                />
              )}
              <View style={[styles.avatar, { backgroundColor: pickColor(item.user_id) }]}>
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={styles.avatarImg} />
                ) : (
                  <Text style={styles.avatarInitial}>{(item.username || '?').charAt(0).toUpperCase()}</Text>
                )}
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowUsername} numberOfLines={1}>@{item.username}</Text>
              </View>
              {!selectMode && (
                <TouchableOpacity style={styles.unblockBtn} onPress={() => onUnblock(item)} activeOpacity={0.8}>
                  <Text style={styles.unblockBtnText}>Unblock</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )}
        />
      )}

      {selectMode && selectedIds.size > 0 && (
        <View style={styles.actionBar}>
          <TouchableOpacity style={styles.actionUnblockBtn} onPress={onUnblockSelected} disabled={unblocking} activeOpacity={0.85}>
            {unblocking ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.actionUnblockText}>Unblock {selectedIds.size}</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerBtn: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  headerActionText: { color: '#7C3AED', fontSize: 16, fontWeight: '600' },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  emptyText: { fontSize: 14, color: '#B3B3B3', textAlign: 'center' },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#7C3AED',
  },
  retryBtnText: { color: '#FFFFFF', fontWeight: '800' },

  listContent: { paddingVertical: 4 },
  separator: { height: 0.5, backgroundColor: 'rgba(255,255,255,0.06)' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 44, height: 44, borderRadius: 22 },
  avatarInitial: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  rowInfo: { flex: 1 },
  rowUsername: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  unblockBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    minWidth: 96,
    alignItems: 'center',
  },
  unblockBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },

  actionBar: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#2A2A2A' },
  actionUnblockBtn: { backgroundColor: '#EF4444', borderRadius: 24, paddingVertical: 14, alignItems: 'center' },
  actionUnblockText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
