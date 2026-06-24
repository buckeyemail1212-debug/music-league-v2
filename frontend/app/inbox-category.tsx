import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  consumePendingInboxCategory,
  PendingInboxCategory,
  InboxCategoryItem,
} from '../src/services/pendingInboxCategory';
import { deleteNotifications, dismissInboxItems, followUser } from '../src/services/api';
import { colors } from '../src/theme/colors';

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d`;
  const d = new Date(ts);
  return `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}`;
}

function tiktokTime(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  if (ms >= startOfToday) return 'Today';
  if (ms >= startOfYesterday) return 'Yesterday';
  const sameYear = d.getFullYear() === now.getFullYear();
  const opts: Intl.DateTimeFormatOptions = sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' };
  return d.toLocaleDateString('en-US', opts);
}

export default function InboxCategoryScreen() {
  const router = useRouter();
  const [data, setData] = useState<PendingInboxCategory | null>(null);
  const [items, setItems] = useState<InboxCategoryItem[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [followedNow, setFollowedNow] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const d = consumePendingInboxCategory();
    setData(d);
    setItems(d?.items ?? []);
  }, []);

  const category = data?.category;
  const canSelect =
    category === 'follows' ||
    category === 'system' ||
    category === 'results' ||
    category === 'league';

  const handlePress = (item: InboxCategoryItem) => {
    if (item.tapType === 'user' && item.tapId) {
      router.push(`/user/${item.tapId}`);
    } else if (item.tapType === 'round' && item.tapId) {
      router.push(`/round/${item.tapId}`);
    } else if (item.tapType === 'chat' && item.tapId) {
      router.push(`/league-chat?leagueId=${item.tapId}&leagueName=${encodeURIComponent(item.tapLabel || '')}`);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const enterSelectMode = () => setSelectMode(true);

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelectAll = () => {
    setSelectedIds(prev =>
      prev.size === items.length ? new Set() : new Set(items.map(it => it.id))
    );
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    try {
      if (category === 'results' || category === 'league') {
        await dismissInboxItems(ids);
      } else {
        await deleteNotifications(ids);
      }
      setItems(prev => prev.filter(it => !selectedIds.has(it.id)));
      exitSelectMode();
    } catch {
      Alert.alert("Couldn't delete", 'Please try again.');
    }
  };

  const handleFollowBack = async (item: InboxCategoryItem) => {
    if (!item.actorId) return;
    setFollowedNow(prev => ({ ...prev, [item.id]: true }));
    try {
      await followUser(item.actorId);
    } catch {
      setFollowedNow(prev => ({ ...prev, [item.id]: false }));
    }
  };

  const renderItem = ({ item }: { item: InboxCategoryItem }) => {
    const tappable = item.tapType !== 'none' && !!item.tapId;
    const selected = selectedIds.has(item.id);

    // Rich follow row (TikTok-style) — only when the mapper supplied a title.
    if (item.title) {
      const isFriend = item.followsBack || followedNow[item.id];
      return (
        <TouchableOpacity
          style={styles.followCard}
          onPress={() => (selectMode ? toggleSelect(item.id) : handlePress(item))}
          activeOpacity={selectMode || tappable ? 0.7 : 1}
          disabled={!selectMode && !tappable}
        >
          {selectMode && (
            <Ionicons
              name={selected ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={selected ? colors.accent : colors.textTertiary}
              style={styles.checkbox}
            />
          )}
          {item.avatar ? (
            <Image source={{ uri: item.avatar }} style={styles.avatar} />
          ) : item.showFollowPill ? (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Ionicons name="person" size={20} color={colors.textTertiary} />
            </View>
          ) : (
            <View style={[styles.avatar, styles.leagueInitialFallback]}>
              <Text style={styles.leagueInitialText}>
                {item.title && item.title.trim() ? item.title.trim()[0].toUpperCase() : '?'}
              </Text>
            </View>
          )}
          <View style={styles.followMiddle}>
            <Text style={styles.followTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.followSubtitle} numberOfLines={1}>{item.subtitle}</Text>
          </View>
          {item.timestamp > 0 && (
            <Text style={styles.followTime}>{tiktokTime(item.timestamp)}</Text>
          )}
          {item.showFollowPill && (isFriend ? (
            <View style={styles.friendsPill}>
              <Text style={styles.friendsPillText}>Friends</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.followPill}
              onPress={() => handleFollowBack(item)}
              disabled={selectMode}
              activeOpacity={0.8}
            >
              <Text style={styles.followPillText}>Follow back</Text>
            </TouchableOpacity>
          ))}
        </TouchableOpacity>
      );
    }

    // Text-only fallback for all other categories — unchanged.
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => (selectMode ? toggleSelect(item.id) : handlePress(item))}
        activeOpacity={selectMode || tappable ? 0.7 : 1}
        disabled={!selectMode && !tappable}
      >
        {selectMode && (
          <Ionicons
            name={selected ? 'checkmark-circle' : 'ellipse-outline'}
            size={22}
            color={selected ? colors.accent : colors.textTertiary}
            style={styles.checkbox}
          />
        )}
        <Text style={styles.itemText} numberOfLines={2}>{item.text}</Text>
        {item.timestamp > 0 && (
          <Text style={styles.itemTime}>{relativeTime(item.timestamp)}</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        {selectMode ? (
          <TouchableOpacity onPress={exitSelectMode} hitSlop={8}>
            <Text style={styles.headerButtonText}>Cancel</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
        <Text style={styles.title} numberOfLines={1}>
          {selectMode ? `${selectedIds.size} selected` : data?.label ?? 'Inbox'}
        </Text>
        {selectMode ? (
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={toggleSelectAll} hitSlop={8}>
              <Text style={styles.headerButtonText}>Select all</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDelete}
              hitSlop={8}
              disabled={selectedIds.size === 0}
              style={styles.headerTrash}
            >
              <Ionicons
                name="trash-outline"
                size={22}
                color={selectedIds.size > 0 ? colors.danger : colors.textTertiary}
              />
            </TouchableOpacity>
          </View>
        ) : canSelect && items.length > 0 ? (
          <TouchableOpacity onPress={enterSelectMode} hitSlop={8}>
            <Ionicons name="ellipsis-horizontal" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No activity yet</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginLeft: 12,
  },
  headerSpacer: { width: 28 },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  headerTrash: { marginLeft: 16 },
  checkbox: { marginRight: 12 },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  itemText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    lineHeight: 19,
  },
  itemTime: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textTertiary,
    marginLeft: 12,
  },
  followCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarFallback: {
    backgroundColor: colors.surface4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leagueInitialFallback: { backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  leagueInitialText: { color: colors.onAccent, fontSize: 20, fontWeight: '700' },
  followMiddle: {
    flex: 1,
    marginLeft: 12,
  },
  followTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  followSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  followTime: {
    fontSize: 12,
    color: colors.textTertiary,
    marginLeft: 8,
    marginRight: 8,
  },
  friendsPill: {
    backgroundColor: colors.surface3,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  friendsPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  followPill: {
    backgroundColor: colors.accent,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  followPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.onAccent,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: colors.textTertiary,
  },
});
