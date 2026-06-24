import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import ViewShot from 'react-native-view-shot';
import { colors } from '../theme/colors';

// Solid app primary purple — match the existing theme so the share card
// reads as part of the brand.
const PURPLE = '#7C3AED';
const PURPLE_DARK = '#5B21B6';

export type ShareEntry = {
  rank: number;
  username: string;
  user_id?: string;
  songTitle?: string | null;
  songArtist?: string | null;
  songCover?: string | null;
  points: number;
  isViewer?: boolean;
};

export type ShareResultsData = {
  // 'round' = single-round results (winner song + top entries with songs)
  // 'standings' = full league leaderboard (top players by points)
  variant: 'round' | 'standings';
  leagueName: string;
  roundNumber?: number;
  theme?: string | null;
  // Ordered list of entries; entries[0] is the winner / 1st place.
  entries: ShareEntry[];
  // Shareable deep link for the "Copy link" action.
  shareLink: string;
  // Optional viewer-finished-place override for the Square view's
  // personalization line. Falls back to looking up isViewer in entries.
  viewerPlace?: number | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  data: ShareResultsData;
};

// SHARE TO grid: a single row of three utility actions. Social-network
// deep links (Instagram Story, TikTok) and Messages were removed — users
// can still surface them through the iOS share sheet via "More".
const SHARE_BUTTONS: {
  key: 'save' | 'copy' | 'more';
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor?: string;
  iconBg?: string;
}[] = [
  { key: 'save', label: 'Save image', icon: 'download', iconColor: colors.onAccent, iconBg: colors.accent },
  { key: 'copy', label: 'Copy link', icon: 'link', iconColor: colors.onAccent, iconBg: '#4B5563' },
  { key: 'more', label: 'More', icon: 'ellipsis-horizontal', iconColor: colors.onAccent, iconBg: '#3A3A3A' },
];

export default function ShareResultsModal({ visible, onClose, data }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const cardRef = useRef<ViewShot>(null);

  const captureCard = async (): Promise<string | null> => {
    try {
      const uri = await cardRef.current?.capture?.();
      return uri ?? null;
    } catch (e) {
      console.error('share capture failed', e);
      return null;
    }
  };

  const onSaveImage = async () => {
    if (busy) return;
    setBusy('save');
    try {
      const uri = await captureCard();
      if (!uri) throw new Error('capture failed');
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert(
          'Permission needed',
          'Allow photo library access to save the image.',
        );
        return;
      }
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Saved!', 'Image saved to your photos.');
    } catch (e) {
      Alert.alert('Error', 'Failed to save image.');
    } finally {
      setBusy(null);
    }
  };

  const onCopyLink = async () => {
    if (busy) return;
    setBusy('copy');
    try {
      await Clipboard.setStringAsync(data.shareLink);
      Alert.alert('Copied!', 'Link copied to clipboard.');
    } catch {
      Alert.alert('Error', 'Failed to copy link.');
    } finally {
      setBusy(null);
    }
  };

  const onShareSheet = async () => {
    if (busy) return;
    setBusy('more');
    try {
      const uri = await captureCard();
      if (!uri) throw new Error('capture failed');
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('Sharing unavailable', "This device doesn't support the system share sheet.");
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share results',
      });
    } catch (e) {
      Alert.alert('Error', 'Failed to share.');
    } finally {
      setBusy(null);
    }
  };

  const onPressShareButton = (key: typeof SHARE_BUTTONS[number]['key']) => {
    if (key === 'save') return onSaveImage();
    if (key === 'copy') return onCopyLink();
    if (key === 'more') return onShareSheet();
  };

  const headerLabel = (() => {
    if (data.variant === 'round' && data.roundNumber) {
      const t = (data.theme || '').trim().toUpperCase();
      return t
        ? `ROUND ${data.roundNumber} · ${t}`
        : `ROUND ${data.roundNumber}`;
    }
    return 'FINAL RESULTS';
  })();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={26} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Share results</Text>
            <View style={{ width: 26 }} />
          </View>

          {/* Card preview area */}
          <View style={styles.previewArea}>
            <ViewShot
              ref={cardRef}
              options={{ format: 'png', quality: 1, result: 'tmpfile' }}
              style={styles.shotWrap}
            >
              <ResultCard
                headerLabel={headerLabel}
                winner={data.entries[0]}
                runnersUp={data.entries.slice(1, 3)}
              />
            </ViewShot>
          </View>

          {/* Share buttons */}
          <Text style={styles.shareToLabel}>SHARE TO</Text>
          <View style={styles.shareGrid}>
            {SHARE_BUTTONS.map((b) => {
              const isBusy = busy === b.key;
              return (
                <TouchableOpacity
                  key={b.key}
                  style={styles.shareBtn}
                  onPress={() => onPressShareButton(b.key)}
                  activeOpacity={0.8}
                  disabled={busy != null}
                >
                  <View style={[styles.shareBtnIcon, { backgroundColor: b.iconBg }]}>
                    {isBusy ? (
                      <ActivityIndicator color={colors.onAccent} />
                    ) : (
                      <Ionicons name={b.icon} size={22} color={b.iconColor} />
                    )}
                  </View>
                  <Text style={styles.shareBtnLabel}>{b.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ──────────────────────────────────────────────────────────────────────
// ResultCard — the single shareable graphic. Purple branded card:
// round header, a featured WINNER (cover + song + points), then 2nd and
// 3rd place rows. Sizes to content (fixed width, dynamic height) so song
// names can wrap without truncation.
// ──────────────────────────────────────────────────────────────────────
function ResultCard({
  headerLabel,
  winner,
  runnersUp,
}: {
  headerLabel: string;
  winner?: ShareEntry;
  runnersUp: ShareEntry[];
}) {
  if (!winner) return <View style={[cardStyles.card, cardStyles.cardEmpty]} />;

  const winnerName = winner.songTitle || winner.username;

  return (
    <View style={cardStyles.card}>
      {/* Header */}
      <Text style={cardStyles.header}>{headerLabel}</Text>

      {/* Featured winner */}
      <View style={cardStyles.winnerBlock}>
        <View style={cardStyles.winnerCoverWrap}>
          {winner.songCover ? (
            <Image source={{ uri: winner.songCover }} style={cardStyles.winnerCover} />
          ) : (
            <View style={[cardStyles.winnerCover, cardStyles.coverFallback]}>
              <Text style={cardStyles.coverFallbackText}>
                {(winnerName || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={cardStyles.winnerBadge}>
            <Text style={cardStyles.winnerBadgeText}>1</Text>
          </View>
        </View>

        <View style={cardStyles.winnerInfo}>
          <Text style={cardStyles.winnerLabel}>WINNER</Text>
          <Text style={cardStyles.winnerTitle} numberOfLines={3}>{winnerName}</Text>
          {winner.songArtist ? (
            <Text style={cardStyles.winnerArtist} numberOfLines={1}>{winner.songArtist}</Text>
          ) : null}
          <Text style={cardStyles.winnerUser} numberOfLines={1} adjustsFontSizeToFit>@{winner.username}</Text>
        </View>
      </View>

      {/* Runners-up (2nd + 3rd) */}
      {runnersUp.length > 0 && (
        <>
          <View style={cardStyles.divider} />
          <View style={cardStyles.runnersList}>
            {runnersUp.map((e) => {
              const songName = e.songTitle || e.username;
              return (
                <View key={`${e.rank}-${e.user_id ?? e.username}`} style={cardStyles.runnerRow}>
                  <Text style={cardStyles.runnerRank}>{e.rank}</Text>
                  <View style={cardStyles.runnerInfo}>
                    <Text style={cardStyles.runnerUser} numberOfLines={1}>@{e.username}</Text>
                    <Text style={cardStyles.runnerTitle}>{songName}</Text>
                  </View>
                  {e.songCover ? (
                    <Image source={{ uri: e.songCover }} style={cardStyles.runnerCover} />
                  ) : (
                    <View style={[cardStyles.runnerCover, cardStyles.coverFallback]}>
                      <Text style={cardStyles.coverFallbackTextSm}>
                        {(songName || '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* Footer watermark */}
      <View style={cardStyles.footer}>
        <Text style={cardStyles.footerText}>riff</Text>
      </View>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface2,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 14,
    paddingHorizontal: 18,
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 16,
  },
  previewArea: {
    // Grows with the (now dynamic-height) ResultCard instead of a fixed
    // height, so a tall wrapped card isn't clipped or overlapping chrome.
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  shotWrap: {
    // ViewShot wraps tightly around the card — height is set by the
    // card's own dimensions per view type.
  },
  shareToLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 18,
    marginBottom: 12,
  },
  shareGrid: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 24,
  },
  shareBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    width: 86,
  },
  shareBtnIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  shareBtnLabel: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 14,
  },
});

// ──────────────────────────────────────────────────────────────────────
// ResultCard styles — the purple branded shareable graphic. Fixed width,
// dynamic height (no forced aspect ratio) so wrapped song names just grow
// the card.
// ──────────────────────────────────────────────────────────────────────
const CARD_W = 300;

const cardStyles = StyleSheet.create({
  card: {
    width: CARD_W,
    backgroundColor: PURPLE,
    borderRadius: 24,
    padding: 18,
    overflow: 'hidden',
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: PURPLE_DARK,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.4,
          shadowRadius: 12,
        }
      : { elevation: 8 }),
  },
  cardEmpty: { backgroundColor: '#3A3A3A', minHeight: 200 },
  header: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  // Featured winner
  winnerBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 16,
  },
  winnerCoverWrap: {
    position: 'relative',
  },
  winnerCover: {
    width: 72,
    height: 72,
    borderRadius: 14,
  },
  winnerBadge: {
    position: 'absolute',
    top: -7,
    right: -7,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: PURPLE,
  },
  winnerBadgeText: {
    color: PURPLE,
    fontWeight: '900',
    fontSize: 13,
  },
  winnerInfo: {
    flex: 1,
    marginLeft: 14,
  },
  winnerLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  winnerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 24,
  },
  winnerArtist: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    marginTop: 2,
  },
  winnerUser: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },

  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginVertical: 14,
  },

  // Runners-up rows (2nd + 3rd)
  runnersList: {
    gap: 10,
  },
  runnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  runnerRank: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 16,
    width: 18,
  },
  runnerInfo: {
    flex: 1,
    marginLeft: 6,
    marginRight: 8,
  },
  runnerUser: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '700',
  },
  runnerTitle: {
    // No numberOfLines — song name wraps to as many lines as needed.
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  runnerCover: {
    width: 54,
    height: 54,
    borderRadius: 8,
  },

  // Shared cover fallback (sizing comes from winnerCover/runnerCover)
  coverFallback: {
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverFallbackText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
  },
  coverFallbackTextSm: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },

  footer: {
    marginTop: 16,
    alignItems: 'center',
  },
  footerText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
});
