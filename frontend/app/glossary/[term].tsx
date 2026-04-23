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
import { useLocalSearchParams, useRouter } from 'expo-router';

type Term = {
  slug: string;
  display: string;
  tagline: string;
  paragraphs: string[];
};

const TERMS: Record<string, Term> = {
  submission: {
    slug: 'submission',
    display: 'Submission',
    tagline: "Everyone's gotta submit.",
    paragraphs: [
      'A submission is your entry for a round — one song, chosen by you, dropped into the league for everyone else to hear and react to. This is where taste gets tested: you pick the song, you make the case.',
      'Every round has a prompt or theme (or none at all), a deadline, and a slot reserved just for you. Miss the deadline, and your slot stays empty — the game moves on. Lock your submission early, or wait until the last minute while you second-guess yourself. Up to you.',
      'The perfect submission is the one that sticks — the one other players remember when they rank. It doesn\'t have to be popular. It just has to be right.',
    ],
  },
  voting: {
    slug: 'voting',
    display: 'Voting',
    tagline: "Someone's gotta be last.",
    paragraphs: [
      'Voting opens once submissions close. You\'ll see every song your league submitted — except your own — and you rank them from favorite to least favorite.',
      'Points are distributed based on how you rank each song: the top spot gets the most, the bottom spot gets the least. Miss the vote and the game auto-splits your points across the other songs so nobody gets left out.',
      'Voting is anonymous — rank based on what you actually heard, not who you think submitted what. The songs you put first are the ones you\'re saying stood out. Listen closely. Taste is what this game is actually about.',
    ],
  },
};

const NEXT_TERM: Record<string, string> = {
  submission: 'voting',
};

export default function GlossaryPage() {
  const router = useRouter();
  const { term } = useLocalSearchParams<{ term: string }>();
  const slug = (term || '').toLowerCase();
  const data = TERMS[slug];

  if (!data) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={10}
            style={styles.headerBtn}
          >
            <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={{ width: 26 }} />
        </View>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Term not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const nextSlug = NEXT_TERM[data.slug];
  const next = nextSlug ? TERMS[nextSlug] : null;

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
        <Text style={styles.headerTitle}>GLOSSARY</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.display}>{data.display}</Text>
        <Text style={styles.tagline}>{data.tagline}</Text>

        <View style={styles.divider} />

        {data.paragraphs.map((p, i) => (
          <Text key={i} style={styles.paragraph}>
            {p}
          </Text>
        ))}

        {next && (
          <TouchableOpacity
            style={styles.nextCard}
            activeOpacity={0.85}
            onPress={() => router.replace(`/glossary/${next.slug}` as any)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.nextLabel}>NEXT UP</Text>
              <Text style={styles.nextDisplay}>{next.display}</Text>
              <Text style={styles.nextTagline}>{next.tagline}</Text>
            </View>
            <Ionicons name="arrow-forward" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
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
  display: {
    fontSize: 44,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginTop: 24,
  },
  tagline: {
    fontSize: 16,
    fontStyle: 'italic',
    color: '#7C3AED',
    marginTop: 8,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 22,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 24,
    color: '#D9D9D9',
    marginBottom: 16,
  },
  nextCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181818',
    borderRadius: 14,
    padding: 18,
    gap: 12,
    marginTop: 24,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.3)',
  },
  nextLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#7C3AED',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  nextDisplay: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  nextTagline: {
    fontSize: 13,
    fontStyle: 'italic',
    color: '#B3B3B3',
    marginTop: 2,
  },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#B3B3B3', fontSize: 14 },
});
