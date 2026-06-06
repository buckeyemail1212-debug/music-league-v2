import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
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
import { deleteNotifications } from '../src/services/api';

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d`;
  const d = new Date(ts);
  return `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}`;
}

export default function InboxCategoryScreen() {
  const router = useRouter();
  const [data, setData] = useState<PendingInboxCategory | null>(null);
  const [items, setItems] = useState<InboxCategoryItem[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const d = consumePendingInboxCategory();
    setData(d);
    setItems(d?.items ?? []);
  }, []);

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
      await deleteNotifications(ids);
      const removed = new Set(ids);
      setItems(prev => prev.filter(it => !removed.has(it.id)));
      exitSelectMode();
    } catch (e) {
      Alert.alert("Couldn't delete. Try again.");
    }
  };

  const renderItem = ({ item }: { item: InboxCategoryItem }) => {
    const tappable = item.tapType !== 'none' && !!item.tapId;
    const selected = selectedIds.has(item.id);
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
            color={selected ? '#7C3AED' : '#6A6A6A'}
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
            <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
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
                color={selectedIds.size > 0 ? '#EF4444' : '#6A6A6A'}
              />
            </TouchableOpacity>
          </View>
        ) : items.length > 0 ? (
          <TouchableOpacity onPress={enterSelectMode} hitSlop={8}>
            <Ionicons name="ellipsis-horizontal" size={24} color="#FFFFFF" />
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
  container: { flex: 1, backgroundColor: '#121212' },
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
    color: '#FFFFFF',
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
    color: '#FFFFFF',
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
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  itemText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    lineHeight: 19,
  },
  itemTime: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6A6A6A',
    marginLeft: 12,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: '#6A6A6A',
  },
});
