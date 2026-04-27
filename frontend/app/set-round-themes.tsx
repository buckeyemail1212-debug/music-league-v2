import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { createLeague, League } from '../src/services/api';
import { leagueEvents } from '../src/utils/leagueEvents';
import { leagueDraft, LeagueDraft } from '../src/utils/leagueDraft';
import LeagueCreatedSuccess from '../src/components/LeagueCreatedSuccess';

export default function SetRoundThemesPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<LeagueDraft | null>(null);
  const [themes, setThemes] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [createdLeague, setCreatedLeague] = useState<League | null>(null);

  // Pull the draft from the in-memory store once on mount. If it's missing
  // the user hit this screen directly — bounce them back to start.
  useEffect(() => {
    const d = leagueDraft.get();
    if (!d) {
      router.replace('/create-league' as any);
      return;
    }
    setDraft(d);
    setThemes(Array(d.totalRounds).fill(''));
  }, [router]);

  const allFilled =
    themes.length > 0 && themes.every((t) => t.trim().length > 0);
  const canSubmit = allFilled && !submitting && draft != null;

  const handleCreate = async () => {
    if (!canSubmit || !draft) return;
    setSubmitting(true);
    try {
      const payload: Parameters<typeof createLeague>[0] = {
        name: draft.name,
        total_rounds: draft.totalRounds,
        submission_hours: draft.submissionHours,
        voting_hours: draft.votingHours,
        themes: themes.map((t) => t.trim()),
      };
      if (draft.photo) payload.league_image = draft.photo;
      if (draft.genre && draft.genre.trim()) payload.genre = draft.genre.trim();
      if (draft.isPublic && draft.startsInHours) {
        payload.is_public = true;
        payload.starts_at = new Date(
          Date.now() + draft.startsInHours * 3600 * 1000,
        ).toISOString();
        if (draft.memberCap) payload.member_cap = draft.memberCap;
      }
      const res = await createLeague(payload);
      leagueEvents.emit();
      leagueDraft.clear();
      setCreatedLeague(res.data);
    } catch (e: any) {
      Alert.alert(
        'Error',
        e?.response?.data?.detail || 'Failed to create league',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (createdLeague) {
    return (
      <LeagueCreatedSuccess
        league={createdLeague}
        onGo={() => router.replace(`/league/${createdLeague.id}`)}
        onClose={() => router.replace('/(tabs)/home' as any)}
      />
    );
  }

  if (!draft) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator color="#7C3AED" />
        </View>
      </SafeAreaView>
    );
  }

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
        <Text style={styles.headerTitle}>SET ROUND THEMES</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.intro}>
            Give each round a prompt. Players will pick songs that match.
          </Text>

          {themes.map((theme, i) => (
            <View key={i} style={styles.themeRow}>
              <View style={styles.themePill}>
                <Text style={styles.themePillText}>R{i + 1}</Text>
              </View>
              <TextInput
                style={styles.themeInput}
                value={theme}
                onChangeText={(txt) => {
                  setThemes((prev) => {
                    const next = [...prev];
                    next[i] = txt;
                    return next;
                  });
                }}
                maxLength={80}
                returnKeyType={i === themes.length - 1 ? 'done' : 'next'}
              />
            </View>
          ))}

          <TouchableOpacity
            style={[styles.cta, !canSubmit && styles.ctaDisabled]}
            onPress={handleCreate}
            disabled={!canSubmit}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.ctaText}>CREATE LEAGUE</Text>
            )}
          </TouchableOpacity>

          {!allFilled && (
            <Text style={styles.hint}>
              All {themes.length} round themes are required.
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  scroll: { paddingHorizontal: 20, paddingBottom: 60 },
  intro: {
    fontSize: 14,
    color: '#B3B3B3',
    marginTop: 18,
    marginBottom: 22,
    lineHeight: 20,
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  themePill: {
    width: 44,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
  },
  themePillText: {
    color: '#FFFFFF',
    fontWeight: '800',
    letterSpacing: 0.5,
    fontSize: 13,
  },
  themeInput: {
    flex: 1,
    backgroundColor: '#181818',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 14,
  },
  cta: {
    backgroundColor: '#7C3AED',
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  ctaDisabled: { opacity: 0.35 },
  ctaText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 1,
  },
  hint: {
    fontSize: 12,
    color: '#6A6A6A',
    textAlign: 'center',
    marginTop: 10,
  },
});
