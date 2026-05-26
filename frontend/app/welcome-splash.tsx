import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../src/context/AuthContext';
import { getSplashStats, SplashStats } from '../src/services/api';

const BANDS = [
  { lo: 5, hi: 12, key: 'morning', salutation: 'Good morning,', tagline: 'Press play on the day.' },
  { lo: 12, hi: 17, key: 'afternoon', salutation: 'Good afternoon,', tagline: "What's on rotation?" },
  { lo: 17, hi: 22, key: 'evening', salutation: 'Good evening,', tagline: "Tonight's setlist is loaded." },
] as const;

const LATE_BAND = { key: 'late', salutation: 'Up late,', tagline: 'After-hours frequencies.' } as const;

const RETURN_TAGLINES = [
  'Picking up where you left off.',
  "Anything new since last time?",
  'Still warm.',
];

function getBand(hour: number) {
  for (const b of BANDS) {
    if (hour >= b.lo && hour < b.hi) return b;
  }
  return LATE_BAND;
}

function getFirstName(user: { display_name?: string; username: string } | null): string {
  if (!user) return '';
  const dn = (user.display_name || '').trim();
  if (dn) return dn.split(/\s+/)[0];
  return user.username;
}

export default function WelcomeSplashScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [stats, setStats] = useState<SplashStats>({ active_leagues: 0, submissions_due: 0, voting_now: 0 });
  const [ctaEnabled, setCTAEnabled] = useState(false);

  const band = getBand(new Date().getHours());
  const firstName = getFirstName(user);

  const [greeting, setGreeting] = useState({ line1: band.salutation, tagline: band.tagline });
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    (async () => {
      try {
        const lastBand = await AsyncStorage.getItem('lastBand');
        if (lastBand && lastBand === band.key) {
          const tag = RETURN_TAGLINES[Math.floor(Math.random() * RETURN_TAGLINES.length)];
          setGreeting({ line1: 'Welcome back,', tagline: tag });
        }
      } catch {}
    })();

    (async () => {
      try {
        const res = await getSplashStats();
        setStats(res.data.data);
      } catch {}
    })();

    const t = setTimeout(() => setCTAEnabled(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const handleCTA = async () => {
    try { await AsyncStorage.setItem('lastBand', band.key); } catch {}
    router.replace('/(tabs)/home' as any);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Wordmark */}
      <Text style={styles.wordmark}>music <Text style={{ fontStyle: 'italic' }}>comp</Text></Text>

      {/* Hero disc placeholder */}
      <View style={styles.heroWrap}>
        <View style={styles.discAura}>
          <View style={styles.disc}>
            <View style={styles.discGroove1} />
            <View style={styles.discGroove2} />
            <View style={styles.discGroove3} />
            <View style={styles.labelPuck}>
              <View style={styles.labelInner}>
                <Text style={styles.labelText}>music <Text style={{ fontStyle: 'italic' }}>comp</Text></Text>
              </View>
            </View>
            <View style={styles.spindle} />
          </View>
        </View>
      </View>

      {/* Greeting */}
      <Text style={styles.greetLine1}>{greeting.line1}</Text>
      <Text style={styles.greetName}>{firstName}.</Text>
      <Text style={styles.greetTagline}>{greeting.tagline}</Text>

      {/* Stat cards */}
      <View style={styles.statStrip}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.active_leagues}</Text>
          <Text style={styles.statLabel}>active leagues</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.submissions_due}</Text>
          <Text style={styles.statLabel}>submissions due</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.voting_now}</Text>
          <Text style={styles.statLabel}>voting now</Text>
        </View>
      </View>

      {/* CTA */}
      <TouchableOpacity
        style={[styles.cta, !ctaEnabled && styles.ctaDisabled]}
        onPress={handleCTA}
        disabled={!ctaEnabled}
        activeOpacity={0.85}
      >
        <Text style={styles.ctaText}>Tune in</Text>
        <View style={styles.ctaKnob}>
          <Ionicons name="chevron-forward" size={20} color="#7C3AED" />
        </View>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const DISC_SIZE = 220;
const LABEL_SIZE = 96;
const INNER_SIZE = 74;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  wordmark: {
    fontSize: 22,
    fontWeight: '800',
    color: '#7C3AED',
    marginTop: 8,
  },

  heroWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discAura: {
    width: DISC_SIZE + 40,
    height: DISC_SIZE + 40,
    borderRadius: (DISC_SIZE + 40) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.25,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 0 },
  },
  disc: {
    width: DISC_SIZE,
    height: DISC_SIZE,
    borderRadius: DISC_SIZE / 2,
    backgroundColor: '#0d0d0d',
    borderWidth: 1,
    borderColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  discGroove1: {
    position: 'absolute',
    width: DISC_SIZE - 20,
    height: DISC_SIZE - 20,
    borderRadius: (DISC_SIZE - 20) / 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  discGroove2: {
    position: 'absolute',
    width: DISC_SIZE - 44,
    height: DISC_SIZE - 44,
    borderRadius: (DISC_SIZE - 44) / 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  discGroove3: {
    position: 'absolute',
    width: DISC_SIZE - 68,
    height: DISC_SIZE - 68,
    borderRadius: (DISC_SIZE - 68) / 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  labelPuck: {
    width: LABEL_SIZE,
    height: LABEL_SIZE,
    borderRadius: LABEL_SIZE / 2,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelInner: {
    width: INNER_SIZE,
    height: INNER_SIZE,
    borderRadius: INNER_SIZE / 2,
    backgroundColor: '#0d0d0d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  spindle: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#000',
  },

  greetLine1: {
    fontSize: 17,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginTop: 24,
  },
  greetName: {
    fontSize: 40,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 2,
  },
  greetTagline: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginTop: 6,
  },

  statStrip: {
    flexDirection: 'row',
    marginTop: 28,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 26,
    fontWeight: '800',
    color: '#7C3AED',
  },
  statLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },

  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7C3AED',
    borderRadius: 28,
    height: 56,
    paddingLeft: 20,
    paddingRight: 6,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  ctaDisabled: {
    opacity: 0.4,
  },
  ctaText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  ctaKnob: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0d0d0d',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
