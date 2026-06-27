import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '../../src/theme/colors';
import NotifPrefsList from '../../src/components/NotifPrefsList';
import { registerForPushNotifications } from '../../src/services/push';

export default function NotificationsSetupScreen() {
  const router = useRouter();

  const onContinue = async () => {
    // Prefs are already persisted on every toggle (inside NotifPrefsList).
    await registerForPushNotifications(); // fires the OS permission prompt
    router.push('/(auth)/onboarding-tour' as any);
  };

  const onMaybeLater = () => {
    router.push('/(auth)/onboarding-tour' as any);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Stay in the loop</Text>
        <Text style={styles.subtitle}>
          Pick what Riff pings you about. You can change these anytime in Settings.
        </Text>
      </View>

      {/* Body */}
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <NotifPrefsList />
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.primaryBtn}
          activeOpacity={0.85}
          onPress={onContinue}
        >
          <Text style={styles.primaryBtnText}>Continue</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.ghostBtn}
          activeOpacity={0.7}
          onPress={onMaybeLater}
        >
          <Text style={styles.ghostBtnText}>Maybe later</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 14.5,
    color: colors.textSecondary,
    marginTop: 6,
    lineHeight: 20,
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
  },
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 29,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: '700',
  },
  ghostBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  ghostBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
});
