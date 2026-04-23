import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

const PURPLE = '#7C3AED';

export default function HowToPlayPage() {
  const router = useRouter();
  const openTerm = (slug: 'submission' | 'voting') =>
    router.push(`/glossary/${slug}` as any);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.headerBtn}
        >
          <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>HOW TO PLAY</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.hero}>
          ARE YOU THE <Text style={styles.heroAccent}>BEST DJ</Text> IN YOUR GROUP?
        </Text>

        <Text style={styles.intro}>
          Do you have the best taste in music? Do you always know the perfect song for the perfect moment?
          If so, get ready to play Fantasy Music League. Get a group of friends, submit songs, vote, and
          find out whose taste ranks on top.
        </Text>

        <View style={styles.stepsWrap}>
          <StepCard
            number={1}
            title="Create a league"
            body="Set up a new league, pick the number of rounds, choose how long each phase lasts, and optionally add a theme for every round."
          />
          <StepCard
            number={2}
            title="Join with a code"
            body="Every league has a unique 6-character invite code. Share it with friends so they can join before the first round starts."
          />
          <StepCard
            number={3}
            title="Game play"
            body={
              <Text style={styles.stepBody}>
                Each round, everyone{' '}
                <Text style={styles.link} onPress={() => openTerm('submission')}>
                  submits
                </Text>
                {' '}a song that fits the prompt. Once the submission window closes, players{' '}
                <Text style={styles.link} onPress={() => openTerm('voting')}>
                  vote
                </Text>
                {' '}by ranking the other songs. Whoever has the best taste wins the round — and eventually the league.
              </Text>
            }
          />
        </View>

        <View style={styles.ctaWrap}>
          <Text style={styles.cta}>PROVE IT.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StepCard({
  number,
  title,
  body,
}: {
  number: number;
  title: string;
  body: string | React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardBadge}>
        <Text style={styles.cardBadgeText}>{number}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        {typeof body === 'string' ? (
          <Text style={styles.stepBody}>{body}</Text>
        ) : (
          body
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerBtn: { padding: 6 },
  headerTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: '#FFFFFF',
  },
  scroll: { paddingHorizontal: 24, paddingBottom: 60 },
  hero: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    lineHeight: 38,
    marginTop: 20,
  },
  heroAccent: {
    color: PURPLE,
  },
  intro: {
    fontSize: 15,
    lineHeight: 23,
    color: '#B3B3B3',
    marginTop: 20,
    marginBottom: 32,
  },
  stepsWrap: {
    gap: 14,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    backgroundColor: '#181818',
    borderRadius: 14,
    padding: 18,
  },
  cardBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBadgeText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
    marginBottom: 6,
  },
  stepBody: {
    fontSize: 14,
    lineHeight: 21,
    color: '#D9D9D9',
  },
  link: {
    color: PURPLE,
    textDecorationLine: 'underline',
    fontWeight: '700',
  },
  ctaWrap: {
    marginTop: 40,
    marginBottom: 20,
    alignItems: 'center',
  },
  cta: {
    fontSize: 30,
    fontWeight: '900',
    color: PURPLE,
    letterSpacing: 4,
  },
});
