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
import {
  getMyFollowRequests,
  approveFollowRequest,
  denyFollowRequest,
  FollowRequestUser,
} from '../src/services/api';

const SUBMISSION_COLORS = ['#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899'];
const pickColor = (seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) >>> 0;
  return SUBMISSION_COLORS[h % SUBMISSION_COLORS.length];
};

export default function FollowRequestsScreen() {
  const router = useRouter();

  const [users, setUsers] = useState<FollowRequestUser[] | null>(null);
  // Per-row in-flight guard, keyed by user_id, so a request's buttons
  // disable while its accept/decline call is pending.
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    getMyFollowRequests()
      .then((res) => setUsers(res.data.data.users))
      .catch(() => setUsers([]));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Optimistically drop the row, then call the action. On failure,
  // splice the row back into its original position and surface an alert.
  const act = useCallback(
    (item: FollowRequestUser, action: (id: string) => Promise<unknown>) => {
      if (busy[item.user_id]) return;
      setBusy((b) => ({ ...b, [item.user_id]: true }));

      let index = -1;
      setUsers((prev) => {
        if (!prev) return prev;
        index = prev.findIndex((u) => u.user_id === item.user_id);
        return prev.filter((u) => u.user_id !== item.user_id);
      });

      action(item.user_id)
        .catch(() => {
          setUsers((prev) => {
            if (!prev) return prev;
            const next = [...prev];
            const at = index >= 0 ? Math.min(index, next.length) : next.length;
            next.splice(at, 0, item);
            return next;
          });
          Alert.alert('Something went wrong', "Couldn't update request. Try again.");
        })
        .finally(() => {
          setBusy((b) => {
            const next = { ...b };
            delete next[item.user_id];
            return next;
          });
        });
    },
    [busy],
  );

  return (
    <SafeAreaView style={styles.container}>
      <Header onBack={() => router.back()} title="Follow Requests" />
      {users === null ? (
        <Centered>
          <ActivityIndicator color="#FFFFFF" />
        </Centered>
      ) : users.length === 0 ? (
        <Centered>
          <Text style={styles.emptyText}>No pending requests.</Text>
        </Centered>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(row) => row.user_id}
          renderItem={({ item }) => (
            <RequestRow
              row={item}
              busy={!!busy[item.user_id]}
              onPress={() => router.push(`/user/${item.user_id}` as any)}
              onAccept={() => act(item, approveFollowRequest)}
              onDecline={() => act(item, denyFollowRequest)}
            />
          )}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

function Header({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} hitSlop={8} style={styles.headerBtn}>
        <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
      <View style={styles.headerBtn} />
    </View>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.center}>{children}</View>;
}

function RequestRow({
  row,
  busy,
  onPress,
  onAccept,
  onDecline,
}: {
  row: FollowRequestUser;
  busy: boolean;
  onPress: () => void;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <View style={styles.row}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        style={styles.rowMain}
      >
        <View style={[styles.avatar, { backgroundColor: pickColor(row.user_id) }]}>
          {row.avatar_url ? (
            <Image source={{ uri: row.avatar_url }} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarInitial}>
              {(row.username || '?').charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
        <View style={styles.rowInfo}>
          <Text style={styles.rowUsername} numberOfLines={1}>@{row.username}</Text>
        </View>
      </TouchableOpacity>
      <View style={styles.actions}>
        <TouchableOpacity
          onPress={onAccept}
          activeOpacity={0.8}
          disabled={busy}
          style={[styles.actionBtn, styles.actionBtnPrimary]}
        >
          <Text style={[styles.actionBtnLabel, styles.actionBtnLabelPrimary]}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onDecline}
          activeOpacity={0.8}
          disabled={busy}
          style={[styles.actionBtn, styles.actionBtnSecondary]}
        >
          <Text style={[styles.actionBtnLabel, styles.actionBtnLabelSecondary]}>Decline</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerBtn: {
    minWidth: 40, minHeight: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 17, fontWeight: '700', color: '#FFFFFF',
  },

  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingHorizontal: 24,
  },
  emptyText: { fontSize: 14, color: '#B3B3B3' },

  listContent: { paddingVertical: 4 },
  separator: { height: 0.5, backgroundColor: 'rgba(255,255,255,0.06)' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 44, height: 44, borderRadius: 22 },
  avatarInitial: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  rowInfo: { flex: 1 },
  rowUsername: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 999,
    alignItems: 'center',
  },
  actionBtnPrimary: { backgroundColor: '#7C3AED' },
  actionBtnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  actionBtnLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  actionBtnLabelPrimary: { color: '#FFFFFF' },
  actionBtnLabelSecondary: { color: '#FFFFFF' },
});
