import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../../src/theme/colors';
import { useAuth } from '../../src/context/AuthContext';

const { width } = Dimensions.get('window');

export default function OnboardingTourScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isReplay = mode === 'replay';
  const scrollRef = useRef<ScrollView>(null);
  const [pageIndex, setPageIndex] = useState(0);

  const onPageChange = (i: number) => {
    setPageIndex(i);
  };

  const goToPage = (i: number) => {
    scrollRef.current?.scrollTo({ x: i * width, animated: true });
    setPageIndex(i);
  };

  const finishOnboarding = async () => {
    if (isReplay) { router.back(); return; }
    try { await AsyncStorage.setItem('onboarding_complete', 'true'); } catch {}
    router.replace('/(tabs)/home');
  };

  const leaderRows = [
    { rank: 2, name: 'Riff Lover', points: '3,964' },
    { rank: 3, name: 'BestDJ', points: '3,887' },
    { rank: 4, name: 'Riff It', points: '3,612' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* 1) TOP BAR */}
      <View style={styles.topBar}>
        {pageIndex > 0 ? (
          <TouchableOpacity onPress={() => goToPage(pageIndex - 1)} hitSlop={8} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 26 }} />
        )}
        {pageIndex < 3 ? (
          <TouchableOpacity onPress={finishOnboarding} hitSlop={8} activeOpacity={0.7}>
            <Text style={styles.skip}>Skip</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {/* 2) BODY */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) =>
          onPageChange(Math.round(e.nativeEvent.contentOffset.x / width))
        }
        style={{ flex: 1 }}
      >
        {/* PAGE 1 */}
        <View style={{ width }}>
          <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
            <View>
              <Text style={styles.kicker}>HOW TO PLAY</Text>
              <Text style={styles.headline}>
                Settle who has the best <Text style={styles.headlineAccent}>taste.</Text>
              </Text>
              <Text style={styles.para}>
                Get a group of friends, drop a song each round, vote on everyone else's picks, and find out whose taste actually wins. Here's how it works.
              </Text>

              <Text style={styles.optionTitle}>Create a league</Text>
              <Text style={styles.bodyText}>
                Set up a new league, pick the number of rounds, choose how long each phase lasts, and optionally add a theme for every round. You can also make your league public — listed on the Public Leagues page where anyone can join, up to 100 members, until Round 1 auto-starts on a timer you set.
              </Text>

              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>OR</Text>
                <View style={styles.orLine} />
              </View>

              <Text style={styles.optionTitle}>Join with a code</Text>
              <Text style={styles.bodyText}>
                Every league has a unique 6-character invite code. Share it with friends so they can join before the first round starts.
              </Text>
            </View>
          </ScrollView>
        </View>

        {/* PAGE 2 */}
        <View style={{ width }}>
          <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
            <View>
              <Text style={styles.kicker}>EACH ROUND</Text>
              <Text style={styles.headline}>
                Submit, then <Text style={styles.headlineAccent}>vote.</Text>
              </Text>

              {/* Step 1 — spine continues below the circle */}
              <View style={styles.stepRow}>
                <View style={styles.spineCol}>
                  <View style={styles.spineCircle}>
                    <Text style={styles.spineNum}>1</Text>
                  </View>
                  <View style={styles.spineLine} />
                </View>
                <View style={[styles.stepContent, styles.stepContentSpaced]}>
                  <Text style={styles.subheading}>Submit a song</Text>
                  <Text style={styles.bodyText}>
                    Every round opens with a theme or prompt. Pick one song that fits — one song, no covers, no two-for-ones — and lock it in before the deadline. Miss it and you score zero for the round.
                  </Text>
                </View>
              </View>

              {/* Step 2 — no spine below */}
              <View style={styles.stepRow}>
                <View style={styles.spineCol}>
                  <View style={styles.spineCircle}>
                    <Text style={styles.spineNum}>2</Text>
                  </View>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.subheading}>Vote by ranking</Text>
                  <Text style={styles.bodyText}>
                    Once submissions close, the playlist is shuffled and you listen blind — no names attached. Rank every track from best to worst. First place earns the most points, last earns zero, and points stack up across the league.
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>

        {/* PAGE 3 */}
        <View style={{ width }}>
          <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
            <View>
              <Text style={styles.kicker}>BETWEEN ROUNDS</Text>
              <Text style={styles.headline}>
                More than a <Text style={styles.headlineAccent}>league.</Text>
              </Text>
              <Text style={styles.para}>
                Not in an active round? Post a tune to your story and let everyone hear what you're vibing to. Riff is about sharing taste, not just competing.
              </Text>
              <Text style={styles.para}>
                Follow friends, react to their picks, and keep the music going long after the round closes.
              </Text>
            </View>
          </ScrollView>
        </View>

        {/* PAGE 4 */}
        <View style={{ width }}>
          <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
            <View>
              <Text style={styles.kicker}>THE LONG GAME</Text>
              <Text style={styles.headline}>
                Climb the <Text style={styles.headlineAccent}>leaderboard.</Text>
              </Text>
              <Text style={styles.para}>
                Every league you play stacks points onto your all-time score. The more you play, the higher your taste climbs — see exactly where you rank globally.
              </Text>

              {/* MINI LEADERBOARD */}
              <View style={styles.leaderCard}>
                {/* Row 1 — YOU */}
                <View style={[styles.leaderRow, styles.leaderRowYou]}>
                  <Text style={styles.rankYou}>1</Text>
                  {user?.profile_photo ? (
                    <Image source={{ uri: user.profile_photo }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Ionicons name="person" size={16} color={colors.textTertiary} />
                    </View>
                  )}
                  <View style={styles.nameWrap}>
                    <Text style={styles.nameYou}>
                      {user?.display_name || user?.username || 'You'}
                    </Text>
                    <View style={styles.youPill}>
                      <Text style={styles.youPillText}>YOU</Text>
                    </View>
                  </View>
                  <Text style={styles.pointsYou}>4,012</Text>
                </View>

                {/* Rows 2-4 */}
                {leaderRows.map((r) => (
                  <View key={r.rank} style={[styles.leaderRow, styles.leaderRowDivider]}>
                    <Text style={styles.rank}>{r.rank}</Text>
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Ionicons name="person" size={16} color={colors.textTertiary} />
                    </View>
                    <Text style={styles.name}>{r.name}</Text>
                    <Text style={styles.points}>{r.points}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.para}>
                Build out your profile and show off your stats — wins, rounds played, and your all-time taste breakdown.
              </Text>
              <Text style={styles.closer}>Pick a beat, let's Riff.</Text>
            </View>
          </ScrollView>
        </View>
      </ScrollView>

      {/* 3) FOOTER */}
      <View style={styles.footer}>
        <View style={styles.dots}>
          {[0, 1, 2, 3].map((i) => (
            <TouchableOpacity key={i} onPress={() => goToPage(i)} hitSlop={8} activeOpacity={0.7}>
              <View style={i === pageIndex ? styles.dotActive : styles.dotInactive} />
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={styles.primaryBtn}
          activeOpacity={0.85}
          onPress={() => (pageIndex < 3 ? goToPage(pageIndex + 1) : finishOnboarding())}
        >
          <Text style={styles.primaryBtnText}>
            {pageIndex < 3 ? 'Continue' : (isReplay ? 'Done' : 'Start playing')}
          </Text>
        </TouchableOpacity>
        {pageIndex === 3 ? (
          <TouchableOpacity
            onPress={() => router.push('/how-to-play' as any)}
            activeOpacity={0.7}
            style={{ marginTop: 12, alignItems: 'center' }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>
              Full guide & glossary
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    height: 52,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skip: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  page: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
  },
  kicker: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2.5,
    color: colors.accent,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  headline: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -1,
    color: colors.textPrimary,
    lineHeight: 34,
    marginBottom: 14,
  },
  headlineAccent: {
    color: colors.accent,
  },
  para: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: 14,
  },
  // Shared borderless text treatments (page 1 either/or + page 2 steps).
  subheading: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  optionTitle: {
    fontSize: 23,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  bodyText: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 21,
  },
  rule: {
    height: 1,
    backgroundColor: colors.border,
  },
  // Page 1 — OR divider
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  orText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.textTertiary,
    paddingHorizontal: 12,
  },
  // Page 2 — numbered steps with a vertical spine
  stepRow: {
    flexDirection: 'row',
    gap: 14,
  },
  spineCol: {
    width: 32,
    alignItems: 'center',
  },
  spineCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spineNum: {
    color: colors.onAccent,
    fontWeight: '800',
    fontSize: 15,
  },
  spineLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  stepContent: {
    flex: 1,
  },
  stepContentSpaced: {
    paddingBottom: 28,
  },
  leaderCard: {
    borderRadius: 18,
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.border,
    marginVertical: 8,
    overflow: 'hidden',
  },
  leaderRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  leaderRowYou: {
    backgroundColor: 'rgba(124,92,255,0.12)',
  },
  leaderRowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rank: {
    width: 22,
    color: colors.textSecondary,
    fontWeight: '800',
  },
  rankYou: {
    width: 22,
    color: colors.accent,
    fontWeight: '800',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarFallback: {
    backgroundColor: colors.surface4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    flex: 1,
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  nameYou: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  youPill: {
    backgroundColor: colors.accent,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  youPillText: {
    color: colors.onAccent,
    fontSize: 10,
    fontWeight: '800',
  },
  points: {
    color: colors.textSecondary,
    fontWeight: '800',
  },
  pointsYou: {
    color: colors.accent,
    fontWeight: '800',
  },
  closer: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.accent,
    marginTop: 8,
    marginBottom: 24,
  },
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  dots: {
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    marginBottom: 14,
  },
  dotActive: {
    width: 22,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  dotInactive: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(60,60,67,0.18)',
  },
  primaryBtn: {
    width: '100%',
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: '700',
  },
});
