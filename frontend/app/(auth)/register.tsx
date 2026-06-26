import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '../../src/theme/colors';

// Sign in and Create account were merged into the single login screen.
// This route now just redirects there so any existing /register links work.
export default function RegisterScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/(auth)/login');
  }, []);

  return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
}
