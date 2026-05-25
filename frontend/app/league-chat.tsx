import React from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SharedChat } from '../src/components/SharedChat';

export default function LeagueChatScreen() {
  const router = useRouter();
  const { leagueId, leagueName } = useLocalSearchParams<{
    leagueId: string;
    leagueName: string;
  }>();

  if (!leagueId) {
    router.back();
    return null;
  }

  return (
    <SafeAreaView style={styles.container}>
      <SharedChat
        leagueId={leagueId}
        leagueName={leagueName || ''}
        onClose={() => router.back()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
});
