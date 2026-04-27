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
  Share as RNShare,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import ViewShot from 'react-native-view-shot';

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

type ViewType = 'story' | 'square' | 'top3';

type Props = {
  visible: boolean;
  onClose: () => void;
  data: ShareResultsData;
};

// One source of truth for the SHARE TO grid. The first row is reserved
// for social-network deep links; row 2 is utility.
const SHARE_BUTTONS: {
  key: 'instagram' | 'tiktok' | 'messages' | 'copy' | 'save' | 'more';
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor?: string;
  iconBg?: string;
}[] = [
  { key: 'instagram', label: 'Instagram\nStory', icon: 'logo-instagram', iconColor: '#FFFFFF', iconBg: '#E1306C' },
  { key: 'tiktok', label: 'TikTok', icon: 'logo-tiktok', iconColor: '#FFFFFF', iconBg: '#000000' },
  { key: 'messages', label: 'Messages', icon: 'chatbubble', iconColor: '#FFFFFF', iconBg: '#34C759' },
  { key: 'copy', label: 'Copy link', icon: 'link', iconColor: '#FFFFFF', iconBg: '#4B5563' },
  { key: 'save', label: 'Save image', icon: 'download', iconColor: '#FFFFFF', iconBg: '#7C3AED' },
  { key: 'more', label: 'More', icon: 'ellipsis-horizontal', iconColor: '#FFFFFF', iconBg: '#3A3A3A' },
];

export default function ShareResultsModal({ visible, onClose, data }: Props) {
  const [view, setView] = useState<ViewType>('story');
  const [busy, setBusy] = useState<string | null>(null);
  const cardRef = useRef<ViewShot>(null);

  const winner = data.entries[0];
  const others = data.entries.slice(1, 4);

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

  const onShareSheet = async (label: 'messages' | 'more') => {
    if (busy) return;
    setBusy(label);
    try {
      const uri = await captureCard();
      if (!uri) throw new Error('capture failed');
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Share results',
        });
      } else {
        // expo-sharing isn't available (rare, mostly web). Fall back to
        // RN Share API with a text-only message — the iOS share sheet
        // will still surface Messages.
        await RNShare.share({
          message: `${data.leagueName} — ${data.shareLink}`,
        });
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to share.');
    } finally {
      setBusy(null);
    }
  };

  const onPressShareButton = (key: typeof SHARE_BUTTONS[number]['key']) => {
    if (key === 'instagram' || key === 'tiktok') {
      Alert.alert('Coming soon', `Direct ${key === 'instagram' ? 'Instagram Story' : 'TikTok'} sharing isn't ready yet — try Save image and post manually for now.`);
      return;
    }
    if (key === 'save') return onSaveImage();
    if (key === 'copy') return onCopyLink();
    if (key === 'messages') return onShareSheet('messages');
    if (key === 'more') return onShareSheet('more');
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

  const viewerPlace =
    data.viewerPlace ??
    data.entries.find((e) => e.isViewer)?.rank ??
    null;

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
              <Ionicons name="close" size={26} color="#FFFFFF" />
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
              {view === 'story' && (
                <StoryCard
                  headerLabel={headerLabel}
                  winner={winner}
                  others={others}
                  variant={data.variant}
                />
              )}
              {view === 'square' && (
                <SquareCard
                  headerLabel={headerLabel}
                  winner={winner}
                  variant={data.variant}
                  viewerPlace={viewerPlace}
                />
              )}
              {view === 'top3' && (
                <Top3Card
                  headerLabel={headerLabel}
                  entries={data.entries.slice(0, 3)}
                />
              )}
            </ViewShot>
          </View>

          {/* View toggle */}
          <View style={styles.toggleRow}>
            {(['story', 'square', 'top3'] as ViewType[]).map((v) => (
              <TouchableOpacity
                key={v}
                style={[styles.toggleBtn, view === v && styles.toggleBtnActive]}
                onPress={() => setView(v)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.toggleText,
                    view === v && styles.toggleTextActive,
                  ]}
                >
                  {v === 'top3' ? 'Top 3' : v[0].toUpperCase() + v.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
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
                      <ActivityIndicator color="#FFFFFF" />
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
// Story view — tall portrait, ~9:16. Big winner block + 2/3/4 list.
// ──────────────────────────────────────────────────────────────────────
function StoryCard({
  headerLabel,
  winner,
  others,
  variant,
}: {
  headerLabel: string;
  winner?: ShareEntry;
  others: ShareEntry[];
  variant: 'round' | 'standings';
}) {
  if (!winner) return <View style={[storyStyles.card, storyStyles.cardEmpty]} />;
  return (
    <View style={storyStyles.card}>
      <View style={storyStyles.topRow}>
        <Text style={storyStyles.headerLabel} numberOfLines={1}>
          {headerLabel}
        </Text>
        <View style={storyStyles.finalPill}>
          <Text style={storyStyles.finalPillText}>FINAL</Text>
        </View>
      </View>

      <View style={storyStyles.winnerRow}>
        <View style={{ flex: 1 }}>
          <Text style={storyStyles.winnerLabel}>WINNER</Text>
          <Text style={storyStyles.winnerHero} numberOfLines={2}>
            {variant === 'round'
              ? winner.songTitle || winner.username
              : winner.username}
          </Text>
          {variant === 'round' && winner.songArtist ? (
            <Text style={storyStyles.winnerArtist} numberOfLines={1}>
              {winner.songArtist}
            </Text>
          ) : null}
        </View>
        <View style={storyStyles.placementWrap}>
          <View style={storyStyles.placementSquare}>
            <Text style={storyStyles.placementNum}>{winner.rank}</Text>
          </View>
          <View style={storyStyles.pointsPill}>
            <Text style={storyStyles.pointsPillText}>{winner.points} PTS</Text>
          </View>
        </View>
      </View>

      {variant === 'round' && (
        <View style={storyStyles.submittedRow}>
          <Text style={storyStyles.submittedLabel}>SUBMITTED BY</Text>
          <View style={storyStyles.submittedNameRow}>
            <View style={storyStyles.avatarSm}>
              <Text style={storyStyles.avatarSmLetter}>
                {winner.username.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={storyStyles.submittedName} numberOfLines={1}>
              @{winner.username}
            </Text>
            {winner.isViewer && (
              <View style={storyStyles.youTag}>
                <Text style={storyStyles.youTagText}>YOU</Text>
              </View>
            )}
          </View>
        </View>
      )}

      <View style={storyStyles.divider} />

      <View style={{ gap: 10 }}>
        {others.map((o) => (
          <View key={`${o.rank}-${o.user_id ?? o.username}`} style={storyStyles.miniRow}>
            <Text style={storyStyles.miniRank}>{o.rank}</Text>
            <View style={{ flex: 1 }}>
              <Text style={storyStyles.miniTitle} numberOfLines={1}>
                {variant === 'round' && o.songTitle ? o.songTitle : o.username}
              </Text>
              <Text style={storyStyles.miniSub} numberOfLines={1}>
                {variant === 'round' && o.songTitle
                  ? `@${o.username}`
                  : `${o.points} pts`}
              </Text>
            </View>
            <View style={storyStyles.miniPts}>
              <Text style={storyStyles.miniPtsText}>{o.points}</Text>
            </View>
            {o.isViewer && (
              <View style={storyStyles.youTag}>
                <Text style={storyStyles.youTagText}>YOU</Text>
              </View>
            )}
          </View>
        ))}
      </View>

      <View style={storyStyles.footer}>
        <Text style={storyStyles.footerText}>music leeg</Text>
      </View>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Square view — 1:1, big number on left, winner info right, viewer line.
// ──────────────────────────────────────────────────────────────────────
function SquareCard({
  headerLabel,
  winner,
  variant,
  viewerPlace,
}: {
  headerLabel: string;
  winner?: ShareEntry;
  variant: 'round' | 'standings';
  viewerPlace: number | null;
}) {
  if (!winner) return <View style={[squareStyles.card, squareStyles.cardEmpty]} />;
  return (
    <View style={squareStyles.card}>
      <Text style={squareStyles.topLabel} numberOfLines={1}>{headerLabel}</Text>
      <View style={squareStyles.body}>
        <View style={squareStyles.placementSquareLg}>
          <Text style={squareStyles.placementNumLg}>{winner.rank}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 18 }}>
          <Text style={squareStyles.winnerLabel}>WINNER</Text>
          <Text style={squareStyles.winnerHero} numberOfLines={2}>
            {variant === 'round'
              ? winner.songTitle || winner.username
              : winner.username}
          </Text>
          {variant === 'round' && winner.songArtist ? (
            <Text style={squareStyles.winnerArtist} numberOfLines={1}>
              {winner.songArtist}
            </Text>
          ) : null}
          <View style={squareStyles.pointsPill}>
            <Text style={squareStyles.pointsPillText}>{winner.points} PTS</Text>
          </View>
        </View>
      </View>
      <Text style={squareStyles.bottomLine} numberOfLines={1}>
        {variant === 'round' ? `Submitted by @${winner.username}` : `Won by @${winner.username}`}
        {viewerPlace ? ` · You finished #${viewerPlace}` : ''}
      </Text>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Top 3 view — three card-style rows for ranks 1–3.
// ──────────────────────────────────────────────────────────────────────
function Top3Card({
  headerLabel,
  entries,
}: {
  headerLabel: string;
  entries: ShareEntry[];
}) {
  return (
    <View style={top3Styles.card}>
      <Text style={top3Styles.topLabel} numberOfLines={1}>{headerLabel}</Text>
      <Text style={top3Styles.bigHeader}>TOP THREE</Text>
      <View style={{ gap: 10 }}>
        {entries.map((e) => (
          <View
            key={`${e.rank}-${e.user_id ?? e.username}`}
            style={[
              top3Styles.row,
              e.isViewer && top3Styles.rowViewer,
            ]}
          >
            <Text style={top3Styles.rank}>{e.rank}</Text>
            {e.songCover ? (
              <Image source={{ uri: e.songCover }} style={top3Styles.cover} />
            ) : (
              <View style={top3Styles.coverFallback}>
                <Text style={top3Styles.coverFallbackText}>
                  {(e.songTitle || e.username).charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={top3Styles.title} numberOfLines={1}>
                {e.songTitle || e.username}
              </Text>
              <Text style={top3Styles.sub} numberOfLines={1}>
                @{e.username}
                {e.isViewer ? ' · YOU' : ''}
              </Text>
            </View>
            <Text style={top3Styles.pts}>{e.points}</Text>
          </View>
        ))}
      </View>
      <View style={top3Styles.footer}>
        <Text style={top3Styles.footerText}>music leeg</Text>
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
    backgroundColor: '#181818',
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
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  previewArea: {
    height: 320,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  shotWrap: {
    // ViewShot wraps tightly around the card — height is set by the
    // card's own dimensions per view type.
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#282828',
    borderRadius: 10,
    padding: 4,
    marginTop: 14,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnActive: {
    backgroundColor: '#FFFFFF',
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B3B3B3',
    letterSpacing: 0.4,
  },
  toggleTextActive: {
    color: '#181818',
  },
  shareToLabel: {
    color: '#B3B3B3',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 18,
    marginBottom: 12,
  },
  shareGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  shareBtn: {
    width: '33.333%',
    paddingVertical: 10,
    alignItems: 'center',
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
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 14,
  },
});

const STORY_W = 220;
const STORY_H = 320;

const storyStyles = StyleSheet.create({
  card: {
    width: STORY_W,
    height: STORY_H,
    backgroundColor: PURPLE,
    borderRadius: 24,
    padding: 16,
    overflow: 'hidden',
    // Subtle shadow for depth
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: PURPLE_DARK,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.4,
          shadowRadius: 12,
        }
      : { elevation: 8 }),
  },
  cardEmpty: { backgroundColor: '#3A3A3A' },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLabel: {
    flex: 1,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  finalPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.30)',
  },
  finalPillText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  winnerRow: {
    flexDirection: 'row',
    marginTop: 14,
    alignItems: 'flex-start',
  },
  winnerLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  winnerHero: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 22,
  },
  winnerArtist: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    marginTop: 2,
  },
  placementWrap: {
    marginLeft: 8,
    alignItems: 'flex-end',
  },
  placementSquare: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placementNum: {
    fontSize: 38,
    fontWeight: '900',
    color: PURPLE,
    lineHeight: 42,
  },
  pointsPill: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  pointsPillText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  submittedRow: {
    marginTop: 12,
  },
  submittedLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  submittedNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarSm: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  avatarSmLetter: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 11,
  },
  submittedName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginVertical: 12,
  },
  miniRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  miniRank: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '900',
    width: 16,
  },
  miniTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  miniSub: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 10,
    marginTop: 1,
  },
  miniPts: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginLeft: 6,
  },
  miniPtsText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  youTag: {
    marginLeft: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  youTagText: {
    color: PURPLE,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  footer: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  footerText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
});

const SQUARE_SIDE = 280;

const squareStyles = StyleSheet.create({
  card: {
    width: SQUARE_SIDE,
    height: SQUARE_SIDE,
    backgroundColor: PURPLE,
    borderRadius: 24,
    padding: 18,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: PURPLE_DARK,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.4,
          shadowRadius: 12,
        }
      : { elevation: 8 }),
  },
  cardEmpty: { backgroundColor: '#3A3A3A' },
  topLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  placementSquareLg: {
    width: 110,
    height: 110,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placementNumLg: {
    fontSize: 70,
    fontWeight: '900',
    color: PURPLE,
    lineHeight: 76,
  },
  winnerLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  winnerHero: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 22,
    marginTop: 4,
  },
  winnerArtist: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    marginTop: 2,
  },
  pointsPill: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.40)',
  },
  pointsPillText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  bottomLine: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '600',
  },
});

const TOP3_W = 230;
const TOP3_H = 310;

const top3Styles = StyleSheet.create({
  card: {
    width: TOP3_W,
    height: TOP3_H,
    backgroundColor: PURPLE,
    borderRadius: 24,
    padding: 16,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: PURPLE_DARK,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.4,
          shadowRadius: 12,
        }
      : { elevation: 8 }),
  },
  topLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  bigHeader: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: 6,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  rowViewer: {
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  rank: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 16,
    width: 18,
  },
  cover: {
    width: 38,
    height: 38,
    borderRadius: 6,
    marginHorizontal: 8,
  },
  coverFallback: {
    width: 38,
    height: 38,
    borderRadius: 6,
    marginHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverFallbackText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  sub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    marginTop: 2,
  },
  pts: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 16,
    marginLeft: 4,
  },
  footer: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  footerText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
});
