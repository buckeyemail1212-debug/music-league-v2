import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../src/context/AuthContext';
import { InboxDataProvider } from '../src/context/InboxDataContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <AuthProvider>
        <InboxDataProvider>
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
          <Stack.Screen name="join-league" options={{ headerShown: false, animation: 'slide_from_right' }} />
          <Stack.Screen name="past-league/[id]" options={{ headerShown: false, animation: 'slide_from_right' }} />
          <Stack.Screen name="past-leagues" options={{ headerShown: false, animation: 'slide_from_right' }} />
          <Stack.Screen name="public-leagues" options={{ headerShown: false, animation: 'slide_from_right' }} />
          <Stack.Screen
            name="story-viewer"
            options={{ headerShown: false, animation: 'fade', animationDuration: 150 }}
          />
          <Stack.Screen name="archived-vibes" options={{ headerShown: false, animation: 'slide_from_right' }} />
          <Stack.Screen name="home-search" options={{ headerShown: false, animation: 'slide_from_right' }} />
          <Stack.Screen name="inbox-category" options={{ headerShown: false, animation: 'slide_from_right' }} />
          <Stack.Screen name="follow-requests" options={{ headerShown: false, animation: 'slide_from_right' }} />
          <Stack.Screen name="league-chat" options={{ headerShown: false, animation: 'slide_from_right' }} />
          <Stack.Screen name="dm/[id]" options={{ headerShown: false, animation: 'slide_from_right' }} />
          <Stack.Screen name="new-message" options={{ headerShown: false, animation: 'slide_from_right' }} />
        </Stack>
        </InboxDataProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
