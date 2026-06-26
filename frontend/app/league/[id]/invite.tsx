import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  searchUsers,
  inviteUsersByUsername,
  getLeagueInvites,
  UserSearchResult,
} from '../../../src/services/api';
import { colors } from '../../../src/theme/colors';

const PURPLE = colors.accent;

// Resolved (non-tappable) result labels keyed by the invite status the
// backend returns. Anything unexpected falls through to "Unavailable".
const RESULT_LABEL: Record<string, string> = {
  already_member: 'Already in',
  already_invited: 'Pending',
  blocked: 'Unavailable',
  not_found: 'Unavailable',
};

export default function InviteUsersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [users, setUsers] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  // Row whose Invite is currently in flight — single id since we don't
  // expect concurrent taps. Disables the pill and ignores double-tap.
  const [invitingId, setInvitingId] = useState<string | null>(null);
  // userId -> result label ('invited' | 'already_member' | ...)
  const [inviteResult, setInviteResult] = useState<Record<string, string>>({});
  // Existing league context: who's already a member / already has a pending
  // invite, so the pill shows 'Already in' / 'Pending' up front.
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  // Load existing members + pending invites once for this league.
  useEffect(() => {
    getLeagueInvites(id!)
      .then((res) => {
        setMemberIds(new Set(res.data?.data?.member_ids ?? []));
        setPendingIds(new Set(res.data?.data?.pending_invitee_ids ?? []));
      })
      .catch(() => {});
  }, [id]);

  // Debounce so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch when the debounced query changes. Empty query → clear and don't
  // hit the network (the hint state renders instead).
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

  // Invites fire ONLY from this explicit per-row pill tap — never on text
  // submit or keyboard return.
  const onInvite = async (item: UserSearchResult) => {
    if (invitingId) return;
    setInvitingId(item.id);
    try {
      const res = await inviteUsersByUsername(id!, [item.username]);
      const status = res.data?.data?.results?.[0]?.status ?? 'invited';
      setInviteResult((prev) => ({ ...prev, [item.id]: status }));
      if (status === 'invited') {
        setPendingIds((prev) => new Set(prev).add(item.id));
      }
    } catch (e: any) {
      Alert.alert("Couldn't invite", e?.response?.data?.detail || 'Please try again.');
    } finally {
      setInvitingId(null);
    }
  };

  const renderRow = ({ item }: { item: UserSearchResult }) => {
    const inFlight = invitingId === item.id;
    // Priority: a status from this session's tap wins, otherwise fall back to
    // the league's existing member / pending state. Both paths flow through
    // the same pill display logic below.
    const sessionResult = inviteResult[item.id];
    const result =
      sessionResult ??
      (memberIds.has(item.id)
        ? 'already_member'
        : pendingIds.has(item.id)
        ? 'already_invited'
        : undefined);

    let indicator: React.ReactNode;
    if (inFlight) {
      indicator = (
        <View style={styles.indicatorSlot}>
          <ActivityIndicator color={PURPLE} size="small" />
        </View>
      );
    } else if (result === undefined) {
      indicator = (
        <TouchableOpacity
          style={styles.inviteBtn}
          activeOpacity={0.85}
          onPress={() => onInvite(item)}
          hitSlop={6}
        >
          <Ionicons name="add" size={14} color={colors.onAccent} />
          <Text style={styles.inviteBtnText}>Invite</Text>
        </TouchableOpacity>
      );
    } else if (result === 'invited') {
      indicator = (
        <View style={styles.indicatorSlot}>
          <Ionicons name="checkmark" size={14} color={colors.success} />
          <Text style={styles.invitedText}>Invited</Text>
        </View>
      );
    } else {
      indicator = (
        <View style={styles.mutedTag}>
          <Text style={styles.mutedTagText}>{RESULT_LABEL[result] ?? 'Unavailable'}</Text>
        </View>
      );
    }

    return (
      <View style={styles.row}>
        {item.profile_photo ? (
          <Image source={{ uri: item.profile_photo }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Ionicons name="person" size={22} color={colors.textTertiary} />
          </View>
        )}
        <View style={styles.identity}>
          <Text style={styles.username} numberOfLines={1}>
            @{item.username}
          </Text>
        </View>
        {indicator}
      </View>
    );
  };

  const renderBody = () => {
    if (!debouncedQuery) {
      return (
        <View style={styles.center}>
          <Text style={styles.hintText}>Search for people to invite</Text>
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
          <Text style={styles.emptyText}>No users found</Text>
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
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Invite users</Text>
        <View style={styles.headerBtn} />
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textTertiary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by username"
          placeholderTextColor={colors.textPlaceholder}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      {renderBody()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface3,
    borderRadius: 10,
    marginHorizontal: 20,
    marginTop: 12,
    paddingHorizontal: 12,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    paddingVertical: 12,
  },

  listContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 },
  separator: { height: 10 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
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
    backgroundColor: colors.surface4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: { flex: 1 },
  username: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },

  inviteBtn: {
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
  inviteBtnText: {
    color: colors.onAccent,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.4,
  },
  indicatorSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 92,
  },
  invitedText: {
    color: colors.success,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.4,
  },
  mutedTag: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 92,
  },
  mutedTagText: {
    color: colors.textPrimary,
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
  hintText: { color: colors.textTertiary, fontSize: 14, textAlign: 'center' },
  emptyText: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
});
