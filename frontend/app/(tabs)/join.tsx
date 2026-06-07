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
      const status = error?.response?.status;
      const detail = error?.response?.data?.detail || '';
      if (status === 403 && /block/i.test(detail)) {
        // Block error is intentionally generic so we don't reveal
        // which member is responsible.
        Alert.alert('Error', "You can't join this league because of a block.");
      } else {
        Alert.alert('Error', detail || 'Failed to join league');
      }
    } finally {
      setJoining(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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
            <Ionicons name="enter" size={60} color="#212F36" />
          </View>
          
          <TextInput
            style={styles.codeInput}
            placeholder="Enter League Code"
            placeholderTextColor="rgba(107, 122, 130, 0.6)"
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
              <ActivityIndicator color="#F5F0E8" />
            ) : (
              <Text style={styles.joinButtonText}>Join League</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.infoSection}>
          <Ionicons name="information-circle" size={20} color="#5A7A6B" />
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
    backgroundColor: '#F5F0E8',
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
    color: '#212F36',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7A82',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#212F36',
    textAlign: 'center',
    letterSpacing: 8,
    borderWidth: 1,
    borderColor: '#E0D8CC',
  },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#212F36',
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
    color: '#F5F0E8',
  },
  infoSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 40,
    padding: 16,
    backgroundColor: 'rgba(90, 122, 107, 0.1)',
    borderRadius: 12,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#6B7A82',
    lineHeight: 20,
  },
});
