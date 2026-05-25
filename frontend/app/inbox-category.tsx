import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  consumePendingInboxCategory,
  PendingInboxCategory,
  InboxCategoryItem,
} from '../src/services/pendingInboxCategory';

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

  useEffect(() => {
    setData(consumePendingInboxCategory());
  }, []);

  const handlePress = (item: InboxCategoryItem) => {
    if (item.tapType === 'user' && item.tapId) {
      router.push(`/user/${item.tapId}`);
    } else if (item.tapType === 'round' && item.tapId) {
      router.push(`/round/${item.tapId}`);
    }
  };

  const renderItem = ({ item }: { item: InboxCategoryItem }) => {
    const tappable = item.tapType !== 'none' && !!item.tapId;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handlePress(item)}
        activeOpacity={tappable ? 0.7 : 1}
        disabled={!tappable}
      >
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
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {data?.label ?? 'Inbox'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {!data || data.items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No activity yet</Text>
        </View>
      ) : (
        <FlatList
          data={data.items}
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
