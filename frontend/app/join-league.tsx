import React, { useRef, useState } from 'react';
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
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { joinLeague } from '../src/services/api';
import { leagueEvents } from '../src/utils/leagueEvents';
import { colors } from '../src/theme/colors';

const CODE_LENGTH = 6;

export default function JoinLeaguePage() {
  const router = useRouter();
  const [chars, setChars] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const joinedCode = chars.join('');
  const canSubmit = joinedCode.length === CODE_LENGTH && !submitting;

  const setCharAt = (i: number, raw: string) => {
    // iOS/Android may deliver a multi-char value for paste — distribute it
    // across the remaining boxes instead of discarding overflow.
    const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!cleaned) {
      const next = [...chars];
      next[i] = '';
      setChars(next);
      return;
    }
    if (cleaned.length > 1) {
      const next = [...chars];
      for (let k = 0; k < cleaned.length && i + k < CODE_LENGTH; k++) {
        next[i + k] = cleaned[k];
      }
      setChars(next);
      const focusIdx = Math.min(i + cleaned.length, CODE_LENGTH - 1);
      inputRefs.current[focusIdx]?.focus();
      if (i + cleaned.length >= CODE_LENGTH) Keyboard.dismiss();
      return;
    }
    const next = [...chars];
    next[i] = cleaned;
    setChars(next);
    if (i < CODE_LENGTH - 1) inputRefs.current[i + 1]?.focus();
    else Keyboard.dismiss();
  };

  const onKeyPress = (i: number, key: string) => {
    if (key === 'Backspace' && !chars[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
      const next = [...chars];
      next[i - 1] = '';
      setChars(next);
    }
  };

  const handleJoin = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setErrorText(null);
    try {
      const res = await joinLeague(joinedCode);
      leagueEvents.emit();
      router.replace(`/league/${res.data.id}`);
    } catch (e: any) {
      const status = e?.response?.status;
      const detail = e?.response?.data?.detail || '';
      if (status === 404) {
        setErrorText("That code doesn't match any league. Double-check and try again.");
      } else if (status === 403 && /block/i.test(detail)) {
        // Block message is intentionally generic — don't reveal which
        // member triggered it.
        setErrorText("You can't join this league because of a block.");
      } else if (status === 400 && /already a member/i.test(detail)) {
        setErrorText("You're already in this league.");
      } else if (status === 400) {
        setErrorText(detail || 'Unable to join this league.');
      } else if (!e?.response) {
        setErrorText("Couldn't reach the server. Check your connection and try again.");
      } else {
        setErrorText(detail || 'Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.headerBtn}
        >
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.headline}>JOIN A LEAGUE</Text>
          <Text style={styles.sub}>Enter the 6-character invite code.</Text>

          <View style={styles.boxesRow}>
            {chars.map((c, i) => (
              <TextInput
                key={i}
                ref={(r) => {
                  inputRefs.current[i] = r;
                }}
                value={c}
                onChangeText={(v) => setCharAt(i, v)}
                onKeyPress={(e) => onKeyPress(i, e.nativeEvent.key)}
                style={[styles.box, c && styles.boxFilled]}
                maxLength={CODE_LENGTH}
                autoCapitalize="characters"
                autoCorrect={false}
                keyboardType={Platform.OS === 'ios' ? 'default' : 'visible-password'}
                selectTextOnFocus
                autoFocus={i === 0}
                textContentType="oneTimeCode"
              />
            ))}
          </View>

          {errorText && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.errorText}>{errorText}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.cta, !canSubmit && styles.ctaDisabled]}
            onPress={handleJoin}
            disabled={!canSubmit}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.ctaText}>JOIN LEAGUE</Text>
            )}
          </TouchableOpacity>

          <View style={styles.tipRow}>
            <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.tipText}>
              Ask the league creator to share their 6-character code.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerBtn: { padding: 6 },
  scroll: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40 },
  headline: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 16,
  },
  sub: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  boxesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
  },
  box: {
    width: 46,
    height: 58,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface3,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  boxFilled: {
    borderColor: colors.accent,
    backgroundColor: colors.accentFaint,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  ctaDisabled: {
    opacity: 0.35,
  },
  ctaText: {
    color: colors.onAccent,
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 1,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 24,
    padding: 14,
    borderRadius: 10,
    backgroundColor: colors.borderFaint,
  },
  tipText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
});
