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
  { key: 'save', label: 'Save image', icon: 'download', iconColor: '#FFFFFF', iconBg: '#7C3AED' },
  { key: 'copy', label: 'Copy link', icon: 'link', iconColor: '#FFFFFF', iconBg: '#4B5563' },
  { key: 'more', label: 'More', icon: 'ellipsis-horizontal', iconColor: '#FFFFFF', iconBg: '#3A3A3A' },
];

export default function ShareResultsModal({ visible, onClose, data }: Props) {
  const [view, setView] = useState<ViewType>('story');
  const [busy, setBusy] = useState<string | null>(null);
  const cardRef = useRef<ViewShot>(null);

  // Tie detection: the "winner" is everyone tied at the highest point
  // total — that's `tiedWinners`, and `tiedWinnerCount >= 2` flips the
  // card layouts into multi-winner mode (no giant "1" square, equal
  // visual weight per winner). Runners-up are everything below the top
  // group. This relies on `data.entries` being sorted by points
  // descending, which the callers do.
  const maxPoints = data.entries.length > 0 ? data.entries[0].points : 0;
  const tiedWinners = data.entries.filter((e) => e.points === maxPoints);
  const tiedWinnerCount = tiedWinners.length;
  const isTopTie = tiedWinnerCount >= 2;
  const nonWinners = data.entries.filter((e) => e.points !== maxPoints);
  // Single-winner anchor for the legacy non-tied layout paths.
  const winner = data.entries[0];
  const others = nonWinners.slice(0, 3);

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
                  tiedWinners={tiedWinners}
                  isTopTie={isTopTie}
                  variant={data.variant}
                />
              )}
              {view === 'square' && (
                <SquareCard
                  headerLabel={headerLabel}
                  winner={winner}
                  tiedWinners={tiedWinners}
                  isTopTie={isTopTie}
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
// Story view — tall portrait, ~9:16. Single winner gets the big "1"
// placement square; ties stack the tied winners with equal weight and
// drop the placement square (a single number can't represent N people).
// Runner-up rows render below the divider in either case.
// ──────────────────────────────────────────────────────────────────────
function StoryCard({
  headerLabel,
  winner,
  others,
  tiedWinners,
  isTopTie,
  variant,
}: {
  headerLabel: string;
  winner?: ShareEntry;
  others: ShareEntry[];
  tiedWinners: ShareEntry[];
  isTopTie: boolean;
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

      {isTopTie ? (
        <View style={storyStyles.tieBlock}>
          <Text style={storyStyles.tieBanner}>{`TIE · ${tiedWinners.length} WINNERS`}</Text>
          {tiedWinners.map((w) => (
            <View
              key={`tied-${w.user_id ?? w.username}`}
              style={storyStyles.tieWinnerRow}
            >
              <View style={{ flex: 1 }}>
                <Text style={storyStyles.tieWinnerHero} numberOfLines={2}>
                  {variant === 'round'
                    ? w.songTitle || w.username
                    : w.username}
                </Text>
                {variant === 'round' && w.songArtist ? (
                  <Text style={storyStyles.tieWinnerArtist} numberOfLines={1}>
                    {w.songArtist}
                  </Text>
                ) : null}
                {variant === 'round' ? (
                  <Text style={storyStyles.tieWinnerSubmitter} numberOfLines={1}>
                    @{w.username}
                  </Text>
                ) : null}
              </View>
              <View style={storyStyles.pointsPill}>
                <Text style={storyStyles.pointsPillText}>{w.points} PTS</Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <>
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
              </View>
            </View>
          )}
        </>
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
// Square view — 1:1. Solo winner gets the big "1" placement square on
// the left and the song hero on the right. Ties drop the square and
// stack the tied winners with equal weight (smaller per-row hero so
// they fit). The bottom personalization line stays for both modes.
// ──────────────────────────────────────────────────────────────────────
function SquareCard({
  headerLabel,
  winner,
  tiedWinners,
  isTopTie,
  variant,
  viewerPlace,
}: {
  headerLabel: string;
  winner?: ShareEntry;
  tiedWinners: ShareEntry[];
  isTopTie: boolean;
  variant: 'round' | 'standings';
  viewerPlace: number | null;
}) {
  if (!winner) return <View style={[squareStyles.card, squareStyles.cardEmpty]} />;

  // Anchor for the bottom personalization line. For ties we pick the
  // first tied winner — which winner's name appears there is largely
  // arbitrary, but it matches the existing single-winner convention.
  const bottomAnchor = isTopTie ? tiedWinners[0] : winner;

  return (
    <View style={squareStyles.card}>
      <Text style={squareStyles.topLabel} numberOfLines={1}>{headerLabel}</Text>
      {isTopTie ? (
        <View style={squareStyles.tieBody}>
          <Text style={squareStyles.winnerLabel}>{`TIE · ${tiedWinners.length} WINNERS`}</Text>
          <View style={squareStyles.tieList}>
            {tiedWinners.map((w) => (
              <View key={`tied-${w.user_id ?? w.username}`} style={squareStyles.tieWinnerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={squareStyles.tieWinnerHero} numberOfLines={1}>
                    {variant === 'round' ? w.songTitle || w.username : w.username}
                  </Text>
                  {variant === 'round' && w.songArtist ? (
                    <Text style={squareStyles.winnerArtist} numberOfLines={1}>
                      {w.songArtist}
                    </Text>
                  ) : null}
                </View>
                <View style={squareStyles.pointsPill}>
                  <Text style={squareStyles.pointsPillText}>{w.points} PTS</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : (
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
      )}
      <Text style={squareStyles.bottomLine} numberOfLines={1}>
        {variant === 'round'
          ? `Submitted by @${bottomAnchor.username}`
          : `Won by @${bottomAnchor.username}`}
        {viewerPlace ? ` · You finished #${viewerPlace}` : ''}
      </Text>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Top 3 view — three card-style rows for ranks 1–3. When two or more
// of the top 3 share a rank, the header gains a "TIE FOR Nth"
// suffix and the tied rows get a small "TIE" pill next to their points.
// All rows render with equal visual weight regardless of whose card
// is being shared.
// ──────────────────────────────────────────────────────────────────────
function Top3Card({
  headerLabel,
  entries,
}: {
  headerLabel: string;
  entries: ShareEntry[];
}) {
  // Group by rank to detect tied positions among the top-3 rows.
  // A rank with 2+ rows is a tie; we use the LOWEST tied rank for the
  // header suffix ("TIE FOR 1ST" beats "TIE FOR 3RD" when both exist).
  const rankCounts: Record<number, number> = {};
  for (const e of entries) rankCounts[e.rank] = (rankCounts[e.rank] || 0) + 1;
  const tiedRanks = Object.keys(rankCounts)
    .map((r) => Number(r))
    .filter((r) => rankCounts[r] >= 2)
    .sort((a, b) => a - b);
  const headerSuffix =
    tiedRanks.length > 0 ? ` · TIE FOR ${getOrdinalUpper(tiedRanks[0])}` : '';
  return (
    <View style={top3Styles.card}>
      <Text style={top3Styles.topLabel} numberOfLines={1}>{headerLabel}</Text>
      <Text style={top3Styles.bigHeader}>{`TOP THREE${headerSuffix}`}</Text>
      <View style={{ gap: 10 }}>
        {entries.map((e) => {
          const rowIsTied = (rankCounts[e.rank] || 0) >= 2;
          return (
            <View
              key={`${e.rank}-${e.user_id ?? e.username}`}
              style={top3Styles.row}
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
                </Text>
              </View>
              <Text style={top3Styles.pts}>{e.points}</Text>
              {rowIsTied && (
                <View style={top3Styles.tiePill}>
                  <Text style={top3Styles.tiePillText}>TIE</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
      <View style={top3Styles.footer}>
        <Text style={top3Styles.footerText}>music leeg</Text>
      </View>
    </View>
  );
}

// Uppercase ordinal helper for header copy ("1ST", "2ND", "3RD", etc).
// Mirrors `getOrdinalSuffix` from the shared util but without the
// number prefix and forced to uppercase to match the surrounding
// "TOP THREE · TIE FOR …" header style.
function getOrdinalUpper(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  const lastTwo = abs % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}TH`;
  switch (abs % 10) {
    case 1:
      return `${n}ST`;
    case 2:
      return `${n}ND`;
    case 3:
      return `${n}RD`;
    default:
      return `${n}TH`;
  }
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
    fontSize: 11,
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
    fontSize: 11,
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
    fontSize: 11,
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
    fontSize: 11,
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
  // Tied-winner block: replaces the single hero+square layout with a
  // stacked, equal-weight list of tied winners. Used by StoryCard when
  // tiedWinnerCount >= 2.
  tieBlock: {
    marginTop: 14,
  },
  tieBanner: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 10,
  },
  tieWinnerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  tieWinnerHero: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 18,
  },
  tieWinnerArtist: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    marginTop: 1,
  },
  tieWinnerSubmitter: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '700',
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
  // Tie variant: stacks the tied winners vertically in the body slot,
  // dropping the giant placement square so no single number stands in
  // for multiple winners.
  tieBody: {
    flex: 1,
    marginTop: 10,
    justifyContent: 'flex-start',
  },
  tieList: {
    marginTop: 8,
    gap: 6,
  },
  tieWinnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tieWinnerHero: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 17,
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
  rank: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 16,
    width: 18,
  },
  // "TIE" pill rendered next to the points on tied rows. Semi-
  // transparent white background, small uppercase label.
  tiePill: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  tiePillText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
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
