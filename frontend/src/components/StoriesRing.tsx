import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Image,
  Modal,
  Platform,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { getStoriesFeed, Story, StoryGroup } from '../services/api';
import { setPendingStories } from '../services/pendingStories';

interface CurrentUserShape {
  id?: string | null;
  profile_photo?: string | null;
  username?: string | null;
}

interface Props {
  currentUser: CurrentUserShape | null | undefined;
}

export default function StoriesRing({ currentUser }: Props) {
  const router = useRouter();
  const [following, setFollowing] = useState<StoryGroup[]>([]);
  const [myStories, setMyStories] = useState<Story[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const res = await getStoriesFeed();
          if (!cancelled) {
            setMyStories(res.data.data.your_stories || []);
            setFollowing(res.data.data.following);
          }
        } catch {
          // Network or auth error — render the "your story" item alone.
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  // A group's ring goes grey only when every story in it is seen.
  // Empty groups never reach this — the "Your Vibe" tile handles
  // myStories.length === 0 inline. Defined before `groups` so it can
  // drive the sort below.
  const allSeen = (stories: Story[]) =>
    stories.length > 0 && stories.every((s) => s.seen);

  // Stable partition of followed users: groups with any unseen stories
  // come first, fully-seen groups go to the end. Within each bucket the
  // feed's original order (recency) is preserved — Array.sort is stable
  // for equal keys. Used for BOTH the rendered tiles and the viewer's
  // `groups` so a tap maps to the right user.
  const sortedFollowing = [...following].sort(
    (a, b) => (allSeen(a.stories) ? 1 : 0) - (allSeen(b.stories) ? 1 : 0),
  );

  // Combined feed in viewer order: own group first (if present), then
  // followed users. The viewer scrolls person-to-person through this list.
  const groups = [
    ...(myStories.length > 0
      ? [{
          username: currentUser?.username || 'You',
          avatarUrl: currentUser?.profile_photo || '',
          userId: currentUser?.id || '',
          isOwn: true,
          stories: myStories,
        }]
      : []),
    ...sortedFollowing.map((g) => ({
      username: g.username,
      avatarUrl: g.avatar_url || '',
      userId: g.user_id,
      isOwn: false,
      stories: g.stories,
    })),
  ];
  const ownOffset = myStories.length > 0 ? 1 : 0;

  // Warm the image cache with each group's first photo so tapping a ring
  // opens to a painted photo instead of a blank frame. The viewer renders
  // with expo-image + cachePolicy="memory-disk", so prefetching here hits
  // the same cache. Best-effort — failures are swallowed.
  useEffect(() => {
    for (const group of groups) {
      const first = group.stories[0];
      if (first && first.photo_url) {
        ExpoImage.prefetch(first.photo_url).catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myStories, following]);

  const renderFallback = () => (
    <View style={styles.avatarFallback}>
      <Ionicons name="person" size={26} color="#666666" />
    </View>
  );

  return (
    <>
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroller}
    >
      {/* Your story — always first, renders before the network resolves. */}
      <View style={styles.item}>
        <View
          style={[
            styles.yourRingWrap,
            myStories.length > 0 &&
              (allSeen(myStories)
                ? styles.yourRingWrapSeen
                : styles.yourRingWrapActive),
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => {
              if (myStories.length > 0) {
                setPendingStories(groups);
                router.push({
                  pathname: '/story-viewer',
                  params: {
                    startGroupIndex: '0',
                  },
                } as any);
              } else {
                setMenuOpen(true);
              }
            }}
          >
            {currentUser?.profile_photo ? (
              <Image source={{ uri: currentUser.profile_photo }} style={styles.avatar} />
            ) : (
              renderFallback()
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addBadge}
            activeOpacity={0.75}
            onPress={() => setMenuOpen(true)}
          >
            <Ionicons name="add" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <Text style={styles.label} numberOfLines={1}>
          Today's Vibe
        </Text>
      </View>

      {sortedFollowing.map((g, idx) => (
        <TouchableOpacity
          key={g.user_id}
          style={styles.item}
          activeOpacity={0.75}
          onPress={() => {
            setPendingStories(groups);
            router.push({
              pathname: '/story-viewer',
              params: {
                startGroupIndex: String(ownOffset + idx),
              },
            } as any);
          }}
        >
          <View style={[styles.ringWrap, allSeen(g.stories) && styles.ringWrapSeen]}>
            {g.avatar_url ? (
              <Image source={{ uri: g.avatar_url }} style={styles.avatar} />
            ) : (
              renderFallback()
            )}
          </View>
          <Text style={styles.label} numberOfLines={1}>
            @{g.username}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>

    <Modal
      visible={menuOpen}
      transparent
      animationType="fade"
      onRequestClose={() => setMenuOpen(false)}
    >
      <TouchableWithoutFeedback onPress={() => setMenuOpen(false)}>
        <View style={styles.sheetOverlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.sheetWrap}>
              <View style={styles.optionsGroup}>
                <TouchableOpacity
                  style={styles.actionRow}
                  activeOpacity={0.6}
                  onPress={() => {
                    setMenuOpen(false);
                    router.push('/create-story' as any);
                  }}
                >
                  <Ionicons name="musical-notes" size={22} color="#7C3AED" />
                  <Text style={styles.actionLabel}>Add Music</Text>
                  <View style={styles.actionRowSpacer} />
                </TouchableOpacity>
                <View style={styles.divider} />
                <TouchableOpacity
                  style={styles.actionRow}
                  activeOpacity={0.6}
                  onPress={() => {
                    setMenuOpen(false);
                    // TODO: /create-photo-story built in 4c-5
                    router.push('/create-photo-story' as any);
                  }}
                >
                  <Ionicons name="camera" size={22} color="#7C3AED" />
                  <Text style={styles.actionLabel}>Add Music + Photo</Text>
                  <View style={styles.actionRowSpacer} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.cancelGroup}
                activeOpacity={0.6}
                onPress={() => setMenuOpen(false)}
              >
                <Text style={styles.cancelLabel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scroller: {
    paddingLeft: 0,
    paddingRight: 20,
    gap: 16,
  },
  item: {
    alignItems: 'center',
  },
  yourRingWrap: {
    borderWidth: 2.5,
    borderColor: 'transparent',
    borderRadius: 999,
    padding: 2.5,
  },
  yourRingWrapActive: {
    borderColor: '#7C3AED',
  },
  yourRingWrapSeen: {
    borderColor: 'rgba(0,0,0,0.20)',
  },
  ringWrap: {
    borderWidth: 2.5,
    borderColor: '#7C3AED',
    borderRadius: 999,
    padding: 2.5,
  },
  ringWrapSeen: {
    borderColor: 'rgba(0,0,0,0.20)',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarFallback: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E4E4E4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  label: {
    fontSize: 11,
    color: '#666666',
    maxWidth: 80,
    textAlign: 'center',
    marginTop: 4,
  },

  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheetWrap: {
    marginHorizontal: 10,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
  },
  optionsGroup: {
    backgroundColor: '#F7F7F7',
    borderRadius: 14,
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 12,
  },
  actionLabel: {
    flex: 1,
    fontSize: 16,
    color: '#000000',
    textAlign: 'center',
  },
  actionRowSpacer: {
    width: 22,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  cancelGroup: {
    marginTop: 8,
    backgroundColor: '#F7F7F7',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
});
