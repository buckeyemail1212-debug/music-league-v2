import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { joinLeague } from '../../src/services/api';

export default function JoinScreen() {
  const router = useRouter();
  const [leagueCode, setLeagueCode] = useState('');
  const [joining, setJoining] = useState(false);

  const handleJoinLeague = async () => {
    if (!leagueCode.trim()) {
      Alert.alert('Error', 'Please enter a league code');
      return;
    }

    setJoining(true);
    try {
      const response = await joinLeague(leagueCode.trim().toUpperCase());
      Alert.alert('Success', `You've joined ${response.data.name}!`);
      setLeagueCode('');
      router.push(`/league/${response.data.id}`);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to join league');
    } finally {
      setJoining(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Join a League</Text>
          <Text style={styles.subtitle}>Enter the code shared by your friend</Text>
        </View>

        <View style={styles.inputSection}>
          <View style={styles.iconContainer}>
            <Ionicons name="enter" size={60} color="#B8C5B0" />
          </View>
          
          <TextInput
            style={styles.codeInput}
            placeholder="Enter League Code"
            placeholderTextColor="rgba(141, 161, 155, 0.5)"
            value={leagueCode}
            onChangeText={setLeagueCode}
            autoCapitalize="characters"
            maxLength={6}
            autoCorrect={false}
            autoComplete="off"
            textContentType="none"
          />

          <TouchableOpacity
            style={[styles.joinButton, joining && styles.buttonDisabled]}
            onPress={handleJoinLeague}
            disabled={joining}
          >
            {joining ? (
              <ActivityIndicator color="#212F36" />
            ) : (
              <Text style={styles.joinButtonText}>Join League</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.infoSection}>
          <Ionicons name="information-circle" size={20} color="rgba(141, 161, 155, 0.8)" />
          <Text style={styles.infoText}>
            League codes are 6 characters. Ask the league creator to share the code with you.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#212F36',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  header: {
    paddingTop: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#F9FCF2',
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(141, 161, 155, 0.8)',
    marginTop: 4,
  },
  inputSection: {
    alignItems: 'center',
    gap: 24,
  },
  iconContainer: {
    marginBottom: 16,
  },
  codeInput: {
    width: '100%',
    backgroundColor: 'rgba(74, 96, 112, 0.5)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#F9FCF2',
    textAlign: 'center',
    letterSpacing: 8,
  },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#B8C5B0',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  joinButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212F36',
  },
  infoSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 40,
    padding: 16,
    backgroundColor: 'rgba(74, 96, 112, 0.3)',
    borderRadius: 12,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(141, 161, 155, 0.8)',
    lineHeight: 20,
  },
});
