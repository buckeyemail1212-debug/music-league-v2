import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import type { League } from '../services/api';
import { colors } from '../theme/colors';

/**
 * Shared post-create confirmation screen used by both the simple Create
 * League flow and the Set Round Themes flow.
 */
export default function LeagueCreatedSuccess({
  league,
  onGo,
  onClose,
}: {
  league: League;
  onGo: () => void;
  onClose: () => void;
}) {
  const code = useMemo(() => league.league_code || '------', [league]);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      Alert.alert('Error', 'Could not copy code.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={{ width: 26 }} />
        <View style={{ width: 26 }} />
        <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.headerBtn}>
          <Ionicons name="close" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>
      <View style={styles.successWrap}>
        <View style={styles.successBadge}>
          <Ionicons name="checkmark-circle" size={48} color={colors.success} />
        </View>
        <Text style={styles.successTitle}>LEAGUE CREATED</Text>
        <Text style={styles.successName}>{league.name}</Text>
        {league.is_public ? (
          <Text style={styles.successPrompt}>
            Your league is now listed on Public Leagues. Round 1 will start automatically when the timer hits zero.
          </Text>
        ) : (
          <>
            <Text style={styles.successPrompt}>
              Share this code with friends to invite them:
            </Text>
            <View style={styles.codeBox}>
              <Text style={styles.codeText}>{code}</Text>
            </View>
            <TouchableOpacity style={styles.shareBtn} onPress={handleCopy} activeOpacity={0.85}>
              <Text style={styles.shareBtnText}>{copied ? 'COPIED!' : 'COPY CODE'}</Text>
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity style={styles.goBtn} onPress={onGo} activeOpacity={0.85}>
          <Text style={styles.goBtnText}>Go to my league</Text>
        </TouchableOpacity>
      </View>
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
  successWrap: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    alignItems: 'center',
  },
  successBadge: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(16,185,129,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 1,
  },
  successName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 8,
    marginBottom: 28,
    textAlign: 'center',
  },
  successPrompt: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 12,
    textAlign: 'center',
  },
  codeBox: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 20,
    marginBottom: 24,
    backgroundColor: colors.accentFaint,
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 36,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 8,
  },
  shareBtn: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 999,
    marginBottom: 12,
    minWidth: 180,
  },
  shareBtnText: {
    color: colors.onAccent,
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 1.4,
  },
  goBtn: { paddingVertical: 14, paddingHorizontal: 32 },
  goBtnText: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 14,
  },
});
