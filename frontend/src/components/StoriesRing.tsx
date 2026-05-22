import React, { useCallback, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { getStoriesFeed, Story, StoryGroup } from '../services/api';

interface CurrentUserShape {
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

  const renderFallback = () => (
    <View style={styles.avatarFallback}>
      <Ionicons name="person" size={26} color="#B3B3B3" />
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
      <TouchableOpacity
        style={styles.item}
        activeOpacity={0.75}
        onPress={() => setMenuOpen(true)}
      >
        <View
          style={[
            styles.yourRingWrap,
            myStories.length > 0 && styles.yourRingWrapActive,
          ]}
        >
          {currentUser?.profile_photo ? (
            <Image source={{ uri: currentUser.profile_photo }} style={styles.avatar} />
          ) : (
            renderFallback()
          )}
          <View style={styles.addBadge}>
            <Ionicons name="add" size={16} color="#FFFFFF" />
          </View>
        </View>
        <Text style={styles.label} numberOfLines={1}>
          Today's Vibe
        </Text>
      </TouchableOpacity>

      {following.map((g) => (
        <TouchableOpacity
          key={g.user_id}
          style={styles.item}
          activeOpacity={0.75}
          onPress={() => {
            // TODO: open story viewer (4d)
          }}
        >
          <View style={styles.ringWrap}>
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
  ringWrap: {
    borderWidth: 2.5,
    borderColor: '#7C3AED',
    borderRadius: 999,
    padding: 2.5,
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
    backgroundColor: '#282828',
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
    borderColor: '#121212',
  },
  label: {
    fontSize: 11,
    color: '#B3B3B3',
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
    backgroundColor: '#1E1E1E',
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
    color: '#FFFFFF',
    textAlign: 'center',
  },
  actionRowSpacer: {
    width: 22,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  cancelGroup: {
    marginTop: 8,
    backgroundColor: '#1E1E1E',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
