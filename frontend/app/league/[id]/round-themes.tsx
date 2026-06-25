import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getRounds, updateRoundThemes, Round } from '../../../src/services/api';
import { colors } from '../../../src/theme/colors';

export default function RoundThemesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [rounds, setRounds] = useState<Round[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getRounds(id!);
        const data = [...res.data].sort((a, b) => a.round_number - b.round_number);
        if (cancelled) return;
        setRounds(data);
        const seed: Record<string, string> = {};
        for (const r of data) seed[r.id] = r.theme || '';
        setDrafts(seed);
      } catch (e: any) {
        if (!cancelled) {
          Alert.alert('Error', e?.response?.data?.detail || 'Failed to load rounds');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Only the rounds that can still be edited (not completed).
      const themes = rounds
        .filter((r) => r.status !== 'completed')
        .map((r) => ({ round_id: r.id, theme: (drafts[r.id] ?? '').trim() }));
      await updateRoundThemes(id!, themes);
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to save round themes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Round Themes</Text>
          <Text style={styles.subtitle}>Name your rounds</Text>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={colors.accent} />
            </View>
          ) : (
            <View style={styles.rows}>
              {rounds.map((r, i) => {
                const isLast = i === rounds.length - 1;
                const completed = r.status === 'completed';
                const value = drafts[r.id] ?? '';
                const filled = completed
                  ? !!(r.theme && r.theme.trim().length > 0)
                  : value.trim().length > 0;
                const prevFilled =
                  i > 0 && (drafts[rounds[i - 1].id] ?? '').trim().length > 0;

                return (
                  <View key={r.id} style={styles.themeRow}>
                    <View style={styles.themeStatusCol}>
                      {i > 0 && (
                        <View
                          style={[
                            styles.themeConnector,
                            { backgroundColor: prevFilled ? colors.accent : colors.surface3 },
                          ]}
                        />
                      )}
                      <View
                        style={[
                          styles.themeCircle,
                          filled
                            ? { backgroundColor: colors.accent }
                            : { backgroundColor: colors.surface3, borderWidth: 1, borderColor: colors.border },
                        ]}
                      >
                        {completed ? (
                          <Ionicons name="lock-closed" size={14} color={colors.textTertiary} />
                        ) : filled ? (
                          <Ionicons name="checkmark" size={16} color={colors.onAccent} />
                        ) : (
                          <Text style={styles.themeCircleNum}>{r.round_number}</Text>
                        )}
                      </View>
                      {!isLast && (
                        <View
                          style={[
                            styles.themeConnectorBelow,
                            { backgroundColor: filled ? colors.accent : colors.surface3 },
                          ]}
                        />
                      )}
                    </View>

                    {completed ? (
                      <View style={[styles.themeCard, styles.themeCardLocked]}>
                        <View style={styles.themeLockedHeader}>
                          <Text style={styles.themeCardLabel}>ROUND {r.round_number}</Text>
                          <Ionicons name="lock-closed" size={13} color={colors.textTertiary} />
                        </View>
                        <Text style={styles.themeLockedText} numberOfLines={2}>
                          {r.theme && r.theme.trim() ? r.theme : 'No theme'}
                        </Text>
                      </View>
                    ) : (
                      <View style={[styles.themeCard, filled && styles.themeCardFilled]}>
                        <Text style={styles.themeCardLabel}>ROUND {r.round_number}</Text>
                        <TextInput
                          style={styles.themeCardInput}
                          placeholder={`Round ${r.round_number} theme`}
                          placeholderTextColor={colors.textPlaceholder}
                          value={value}
                          onChangeText={(v) =>
                            setDrafts((prev) => ({ ...prev, [r.id]: v }))
                          }
                          maxLength={100}
                          returnKeyType={isLast ? 'done' : 'next'}
                        />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        {!loading && (
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={onSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.onAccent} />
              ) : (
                <Text style={styles.saveBtnText}>Save round themes</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: 24,
  },
  loadingWrap: { paddingTop: 60, alignItems: 'center' },
  rows: {},

  // Mirrors create-league.tsx step-2 theme rows.
  themeRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  themeStatusCol: {
    width: 30,
    alignItems: 'center',
  },
  themeCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeCircleNum: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  themeConnector: {
    width: 2,
    height: 10,
    borderRadius: 1,
  },
  themeConnectorBelow: {
    width: 2,
    flex: 1,
    borderRadius: 1,
  },
  themeCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginLeft: 12,
    marginBottom: 6,
  },
  themeCardFilled: {
    borderColor: colors.borderStrong,
  },
  themeCardLocked: {
    backgroundColor: colors.surface2,
  },
  themeLockedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  themeCardLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  themeLockedText: {
    color: colors.textTertiary,
    fontSize: 14,
    fontWeight: '600',
  },
  themeCardInput: {
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 14,
    padding: 0,
  },

  footer: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 12,
  },
  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: 28,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
    color: colors.onAccent,
    fontWeight: '800',
    fontSize: 16,
  },
});
