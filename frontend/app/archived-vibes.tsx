import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { getArchivedStories, Story } from '../src/services/api';
import {
  setPendingStories,
  PendingStoryGroup,
} from '../src/services/pendingStories';
import { useAuth } from '../src/context/AuthContext';
import { colors } from '../src/theme/colors';

const GRID_COLS = 3;
const HORIZ_PAD = 20;
const GAP = 8;
const TILE_SIZE = Math.floor(
  (Dimensions.get('window').width - HORIZ_PAD * 2 - GAP * (GRID_COLS - 1)) /
    GRID_COLS,
);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function ArchivedVibesScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);

  // Re-fetch on every focus so a story deleted in the viewer disappears
  // from the grid when the user returns. Mirrors LikedSongsTab.
  const load = useCallback(async () => {
    try {
      const res = await getArchivedStories();
      setStories(res.data.data.stories || []);
    } catch {
      setStories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onTapStory = (i: number) => {
    const group: PendingStoryGroup = {
      username: user?.username ?? '',
      avatarUrl: user?.profile_photo ?? '',
      userId: user?.id ?? '',
      isOwn: true,
      stories,
    };
    setPendingStories([group]);
    router.push({
      pathname: '/story-viewer',
      params: { startGroupIndex: '0', startStoryIndex: String(i) },
    } as any);
  };

  const renderTile = ({ item, index }: { item: Story; index: number }) => {
    const imgUri = item.photo_url || item.song.cover_url || null;
    const d = new Date(item.created_at);
    const day = d.getDate();
    const month = MONTHS[d.getMonth()] ?? '';
    // 3-column grid: only the first two cells per row get a right-margin
    // so the last column lines up flush with the right edge.
    const isLastInRow = index % GRID_COLS === GRID_COLS - 1;
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => onTapStory(index)}
        style={[
          styles.tile,
          { marginRight: isLastInRow ? 0 : GAP },
        ]}
      >
        {imgUri ? (
          <Image source={{ uri: imgUri }} style={styles.tileImg} />
        ) : (
          <View style={[styles.tileImg, styles.tileImgFallback]} />
        )}
        <View style={styles.dateBadge}>
          <Text style={styles.dateBadgeDay}>{day}</Text>
          <Text style={styles.dateBadgeMonth}>{month}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerBtn}
          activeOpacity={0.75}
        >
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Today's Vibes Archive</Text>
        <View style={styles.headerBtn} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.textPrimary} />
        </View>
      ) : stories.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="archive-outline" size={56} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>No archived vibes yet</Text>
          <Text style={styles.emptyBody}>
            Stories you don't delete appear here after 24 hours.
          </Text>
        </View>
      ) : (
        <FlatList
          data={stories}
          keyExtractor={(s) => s.id}
          renderItem={renderTile}
          numColumns={GRID_COLS}
          contentContainerStyle={styles.gridContent}
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
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  headerBtn: {
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  emptyBody: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },

  gridContent: {
    paddingHorizontal: HORIZ_PAD,
    paddingTop: 16,
    paddingBottom: 32,
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    marginBottom: GAP,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  tileImg: {
    width: TILE_SIZE,
    height: TILE_SIZE,
  },
  tileImgFallback: {
    backgroundColor: colors.surface3,
  },
  dateBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: colors.bg,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
    alignItems: 'center',
    minWidth: 36,
  },
  dateBadgeDay: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 18,
  },
  dateBadgeMonth: {
    color: colors.textSecondary,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
