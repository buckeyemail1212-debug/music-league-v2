import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../src/context/AuthContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <AuthProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#0a0a0a' },
            animation: 'none',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="league/[id]" options={{ headerShown: false, animation: 'slide_from_right' }} />
          <Stack.Screen name="round/[id]"  options={{ headerShown: false, animation: 'slide_from_right' }} />
          <Stack.Screen name="settings" options={{ headerShown: false, animation: 'slide_from_right' }} />
          <Stack.Screen name="how-to-play" options={{ headerShown: false, animation: 'slide_from_right' }} />
          <Stack.Screen name="glossary/[term]" options={{ headerShown: false, animation: 'slide_from_right' }} />
          <Stack.Screen name="create-league" options={{ headerShown: false, animation: 'slide_from_right' }} />
          <Stack.Screen name="set-round-themes" options={{ headerShown: false, animation: 'slide_from_right' }} />
          <Stack.Screen name="join-league" options={{ headerShown: false, animation: 'slide_from_right' }} />
          <Stack.Screen name="past-league/[id]" options={{ headerShown: false, animation: 'slide_from_right' }} />
        </Stack>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
