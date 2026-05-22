import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getStoriesFeed, StoryGroup } from '../services/api';

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getStoriesFeed();
        if (!cancelled) setFollowing(res.data.data.following);
      } catch {
        // Network or auth error — render the "your story" item alone.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const renderFallback = () => (
    <View style={styles.avatarFallback}>
      <Ionicons name="person" size={26} color="#B3B3B3" />
    </View>
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroller}
    >
      {/* Your story — always first, renders before the network resolves. */}
      <TouchableOpacity
        style={styles.item}
        activeOpacity={0.75}
        onPress={() => router.push('/create-story' as any)}
      >
        <View style={styles.yourRingWrap}>
          {currentUser?.profile_photo ? (
            <Image source={{ uri: currentUser.profile_photo }} style={styles.avatar} />
          ) : (
            renderFallback()
          )}
          <View style={styles.addBadge}>
            <Ionicons name="add" size={14} color="#FFFFFF" />
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
    right: 3,
    bottom: 3,
    width: 22,
    height: 22,
    borderRadius: 11,
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
});
