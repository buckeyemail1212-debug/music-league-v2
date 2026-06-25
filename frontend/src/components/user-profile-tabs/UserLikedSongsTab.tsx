import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Dimensions,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import { getUserLikedSongs, LikedSong } from '../../services/api';
import { apiCache } from '../../services/apiCache';
import LikeButton from '../LikeButton';
import { colors } from '../../theme/colors';
import { openInService } from '../../utils/openInService';
import { PreviewPlayButton } from '../PreviewPlayButton';

const GRID_COLS = 3;
const SCREEN_WIDTH = Dimensions.get('window').width;
const HORIZ_PAD = 20;
const GAP = 8;
const TILE_SIZE = Math.floor(
  (SCREEN_WIDTH - HORIZ_PAD * 2 - GAP * (GRID_COLS - 1)) / GRID_COLS,
);

const TTL_MS = 60 * 1000;
const cacheKey = (targetId: string, viewerId: string) =>
  `user-liked-songs:${targetId}:${viewerId}`;

export default function UserLikedSongsTab({
  targetId,
  viewerId,
}: {
  targetId: string;
  viewerId: string;
}) {
  // null = loading, [] = loaded empty. We render null on 403 too — the
  // outer screen is responsible for showing the privacy screen, so a
  // safety-null here just prevents flicker if something racey happens.
  const [songs, setSongs] = useState<LikedSong[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [selected, setSelected] = useState<LikedSong | null>(null);

  const load = useCallback(() => {
    if (!targetId || !viewerId) return;
    setHidden(false);
    apiCache
      .swr<LikedSong[]>(
        cacheKey(targetId, viewerId),
        () => getUserLikedSongs(targetId).then((r) => r.data.data.songs ?? []),
        setSongs,
        TTL_MS,
      )
      .then(setSongs)
      .catch((err) => {
        if (err?.response?.status === 403) {
          setHidden(true);
        } else {
          setSongs([]);
        }
      });
  }, [targetId, viewerId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (hidden) return null;

  if (songs === null) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Loading…</Text>
      </View>
    );
  }

  if (songs.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="heart-outline" size={40} color={colors.textTertiary} />
        <Text style={styles.emptyText}>No liked songs yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      {songs.map((s) => (
        <View key={s.deezer_id} style={styles.tile}>
          <View style={styles.coverWrap}>
            <TouchableOpacity activeOpacity={0.85} onPress={() => setSelected(s)}>
              {s.cover_url ? (
                <Image source={{ uri: s.cover_url }} style={styles.cover} />
              ) : (
                <View style={[styles.cover, styles.coverFallback]}>
                  <Ionicons name="musical-note" size={28} color={colors.textTertiary} />
                </View>
              )}
            </TouchableOpacity>
            <View style={styles.heartBtn}>
              {/* Heart reflects the VIEWER'S like state, not target's.
                  Tapping toggles the viewer's list (LikeButton normal
                  behavior). It sits above the cover touchable, so a heart
                  tap never opens the detail sheet. */}
              <LikeButton song={s} size={18} />
            </View>
          </View>
          <Text style={styles.title} numberOfLines={1}>{s.title}</Text>
          <Text style={styles.artist} numberOfLines={1}>{s.artist}</Text>
        </View>
      ))}

      <SongDetailSheet selected={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

function SongDetailSheet({
  selected,
  onClose,
}: {
  selected: LikedSong | null;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={!!selected}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={onClose}>
        {selected && (
          <TouchableOpacity style={styles.sheetCard} activeOpacity={1} onPress={() => {}}>
            <TouchableOpacity style={styles.sheetClose} onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>

            {selected.cover_url ? (
              <Image source={{ uri: selected.cover_url }} style={styles.sheetCover} />
            ) : (
              <View style={[styles.sheetCover, styles.sheetCoverFallback]}>
                <Ionicons name="musical-note" size={44} color={colors.textTertiary} />
              </View>
            )}

            <Text style={styles.sheetTitle} numberOfLines={2}>{selected.title}</Text>
            <Text style={styles.sheetArtist} numberOfLines={1}>{selected.artist}</Text>

            <View style={styles.sheetActionsRow}>
              <PreviewPlayButton
                previewUrl={selected.preview_url ?? ''}
                deezerId={selected.deezer_id}
                songId={`liked-${selected.deezer_id}`}
                size={20}
              />
              <LikeButton song={selected} size={22} />
            </View>

            <View style={styles.sheetServices}>
              <TouchableOpacity
                style={[styles.sheetServiceBtn, { backgroundColor: colors.spotify }]}
                onPress={() => openInService(selected, 'spotify')}
                activeOpacity={0.85}
              >
                <FontAwesome name="spotify" size={20} color={colors.onAccent} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetServiceBtn, { backgroundColor: colors.appleMusic }]}
                onPress={() => openInService(selected, 'apple')}
                activeOpacity={0.85}
              >
                <Ionicons name="logo-apple" size={20} color={colors.onAccent} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetServiceBtn, { backgroundColor: colors.explicitRed }]}
                onPress={() => openInService(selected, 'youtube')}
                activeOpacity={0.85}
              >
                <Ionicons name="logo-youtube" size={20} color={colors.onAccent} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: HORIZ_PAD,
    gap: GAP,
    marginTop: 4,
  },
  tile: { width: TILE_SIZE, marginBottom: 12 },
  coverWrap: { position: 'relative' },
  cover: { width: TILE_SIZE, height: TILE_SIZE, borderRadius: 8 },
  coverFallback: {
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartBtn: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 12, fontWeight: '700', color: '#FFFFFF', marginTop: 6 },
  artist: { fontSize: 11, color: '#B3B3B3', marginTop: 1 },

  empty: {
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 13, color: '#B3B3B3', textAlign: 'center', lineHeight: 19,
  },

  // ── Song detail sheet ──────────────────────────────────────────────
  sheetOverlay: {
    flex: 1,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  sheetCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.bg,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
  },
  sheetClose: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 4,
    zIndex: 1,
  },
  sheetCover: {
    width: 120,
    height: 120,
    borderRadius: 12,
    marginTop: 8,
  },
  sheetCoverFallback: {
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: 14,
  },
  sheetArtist: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },
  sheetActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginTop: 16,
  },
  sheetServices: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 18,
  },
  sheetServiceBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
