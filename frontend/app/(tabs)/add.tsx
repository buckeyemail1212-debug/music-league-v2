import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Modal,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { joinLeague, createLeague } from '../../src/services/api';
import * as ImagePicker from 'expo-image-picker';

export default function AddScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  
  const [leagueCode, setLeagueCode] = useState('');
  const [joining, setJoining] = useState(false);
  
  const [leagueName, setLeagueName] = useState('');
  const [totalRounds, setTotalRounds] = useState(5);
  const [leagueImage, setLeagueImage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const resetAll = () => {
    setMode('choose');
    setLeagueCode('');
    setLeagueName('');
    setTotalRounds(5);
    setLeagueImage(null);
  };

  const handleJoin = async () => {
    if (!leagueCode.trim()) return;
    setJoining(true);
    try {
      const response = await joinLeague(leagueCode.trim().toUpperCase());
      Alert.alert('Success', `Joined ${response.data.name}!`);
      resetAll();
      router.push(`/league/${response.data.id}`);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to join league');
    } finally {
      setJoining(false);
    }
  };

  const handleCreate = async () => {
    if (!leagueName.trim()) return;
    setCreating(true);
    try {
      const response = await createLeague({
        name: leagueName.trim(),
        total_rounds: totalRounds,
        league_image: leagueImage,
      });
      Alert.alert('League Created!', `Code: ${response.data.league_code}`);
      resetAll();
      router.push(`/league/${response.data.id}`);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create league');
    } finally {
      setCreating(false);
    }
  };

  const pickImage = () => {
    Alert.alert('League Photo', '', [
      {
        text: 'Take Photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Permission needed'); return; }
          const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true });
          if (!result.canceled && result.assets[0].base64) {
            setLeagueImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
          }
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true });
          if (!result.canceled && result.assets[0].base64) {
            setLeagueImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const roundNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  // Choose mode - main popup
  if (mode === 'choose') {
    return (
      <SafeAreaView style={styles.container}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.popupCenter}>
            <View style={styles.popup}>
              <Text style={styles.popupTitle}>What would you like to do?</Text>
              <TouchableOpacity style={styles.optionButton} onPress={() => setMode('create')}>
                <Ionicons name="add-circle-outline" size={24} color="#5A7A6B" />
                <Text style={styles.optionText}>Create League</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.optionButton} onPress={() => setMode('join')}>
                <Ionicons name="enter-outline" size={24} color="#5A7A6B" />
                <Text style={styles.optionText}>Join League</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </SafeAreaView>
    );
  }

  // Join mode
  if (mode === 'join') {
    return (
      <SafeAreaView style={styles.container}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.popupCenter}>
            <View style={styles.popup}>
              <View style={styles.popupHeader}>
                <TouchableOpacity onPress={() => setMode('choose')}>
                  <Ionicons name="arrow-back" size={22} color="#212F36" />
                </TouchableOpacity>
                <Text style={styles.popupTitle}>Join League</Text>
                <View style={{ width: 22 }} />
              </View>
              <TextInput
                style={styles.codeInput}
                placeholder="Enter league code"
                placeholderTextColor="#8B9A94"
                value={leagueCode}
                onChangeText={setLeagueCode}
                autoCapitalize="characters"
                maxLength={6}
                autoFocus
              />
              <TouchableOpacity
                style={[styles.actionButton, !leagueCode.trim() && styles.actionButtonDisabled]}
                onPress={handleJoin}
                disabled={!leagueCode.trim() || joining}
              >
                {joining ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionButtonText}>Join League</Text>}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </SafeAreaView>
    );
  }

  // Create mode
  return (
    <SafeAreaView style={styles.container}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.popupCenter}>
          <View style={[styles.popup, { maxHeight: '85%' }]}>
            <View style={styles.popupHeader}>
              <TouchableOpacity onPress={() => setMode('choose')}>
                <Ionicons name="arrow-back" size={22} color="#212F36" />
              </TouchableOpacity>
              <Text style={styles.popupTitle}>Create League</Text>
              <View style={{ width: 22 }} />
            </View>

            <TouchableOpacity style={styles.imagePickerCircle} onPress={pickImage}>
              {leagueImage ? (
                <Image source={{ uri: leagueImage }} style={styles.imagePreview} />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={24} color="#5A7A6B" />
                  <Text style={styles.imagePickerLabel}>Add Photo</Text>
                </>
              )}
            </TouchableOpacity>
            {leagueImage && (
              <TouchableOpacity onPress={() => setLeagueImage(null)}>
                <Text style={styles.removeImageText}>Remove</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.inputLabel}>League Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Friday Night Vibes"
              placeholderTextColor="#8B9A94"
              value={leagueName}
              onChangeText={setLeagueName}
            />

            <Text style={styles.inputLabel}>Number of Rounds</Text>
            <View style={styles.roundsGrid}>
              {roundNumbers.map((num) => (
                <TouchableOpacity
                  key={num}
                  style={[styles.roundCircle, totalRounds === num && styles.roundCircleSelected]}
                  onPress={() => setTotalRounds(num)}
                >
                  <Text style={[styles.roundCircleText, totalRounds === num && styles.roundCircleTextSelected]}>
                    {num}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.actionButton, !leagueName.trim() && styles.actionButtonDisabled]}
              onPress={handleCreate}
              disabled={!leagueName.trim() || creating}
            >
              {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionButtonText}>Create League</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F0E8',
  },
  popupCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  popup: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    borderWidth: 1,
    borderColor: '#E0D8CC',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  popupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  popupTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212F36',
    textAlign: 'center',
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F5F0E8',
    marginTop: 12,
    gap: 12,
  },
  optionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212F36',
  },
  codeInput: {
    backgroundColor: '#F5F0E8',
    borderRadius: 12,
    padding: 16,
    fontSize: 20,
    fontWeight: '700',
    color: '#212F36',
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: 16,
  },
  actionButton: {
    backgroundColor: '#5A7A6B',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  actionButtonDisabled: {
    opacity: 0.4,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  imagePickerCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F5F0E8',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    borderWidth: 2,
    borderColor: '#5A7A6B',
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  imagePickerLabel: {
    fontSize: 10,
    color: '#5A7A6B',
    marginTop: 2,
  },
  removeImageText: {
    fontSize: 13,
    color: '#E57373',
    textAlign: 'center',
    marginTop: 6,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212F36',
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F5F0E8',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#212F36',
  },
  roundsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  roundCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5F0E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundCircleSelected: {
    backgroundColor: '#5A7A6B',
  },
  roundCircleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212F36',
  },
  roundCircleTextSelected: {
    color: '#FFFFFF',
  },
});
