import React, { useCallback, useEffect, useState } from 'react';
import { TouchableOpacity, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import {
  LikedSong,
  loadLikedSongs,
  getCachedLikedIds,
  toggleLikedSong,
  subscribeLikedSongs,
} from '../utils/likedSongs';

// Render a heart toggle next to a play button. Liked state lives in
// the per-user AsyncStorage list (same backing store the Discover tab
// and the LikedSongsTab on Profile read). Module-level subscriptions
// keep every mounted button on the same screen in sync.

export default function LikeButton({
  song,
  size = 22,
  style,
}: {
  song: LikedSong;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const songKey = String(song.deezer_id);

  const [liked, setLiked] = useState<boolean>(() =>
    userId ? getCachedLikedIds(userId).has(songKey) : false,
  );

  // First-mount hydrate. loadLikedSongs is a no-op past the first call
  // per user (it always re-reads disk, but the cost is one AsyncStorage
  // read; cheap). Subscribe so a tap on a sibling LikeButton flips
  // this one too without prop drilling.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    loadLikedSongs(userId).then(() => {
      if (cancelled) return;
      setLiked(getCachedLikedIds(userId).has(songKey));
    });
    const unsub = subscribeLikedSongs(userId, (ids) => {
      if (!cancelled) setLiked(ids.has(songKey));
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [userId, songKey]);

  const onPress = useCallback(async () => {
    if (!userId) return;
    // Optimistic flip — the toggle helper writes through to disk and
    // notifies subscribers so we re-converge if storage somehow lies.
    setLiked((p) => !p);
    try {
      await toggleLikedSong(userId, song);
    } catch {
      // Cache update + notify already happened inside toggleLikedSong;
      // the subscriber will pull state back to truth.
    }
  }, [userId, song]);

  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={8}
      activeOpacity={0.7}
      style={style}
      accessibilityLabel={liked ? 'Unlike song' : 'Like song'}
      accessibilityRole="button"
    >
      <Ionicons
        name={liked ? 'heart' : 'heart-outline'}
        size={size}
        color="#EF4444"
      />
    </TouchableOpacity>
  );
}
