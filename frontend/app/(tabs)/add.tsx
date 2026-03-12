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
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { joinLeague, createLeague } from '../../src/services/api';
import * as ImagePicker from 'expo-image-picker';

export default function AddScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<'menu' | 'join' | 'create'>('menu');
  
  // Join state
  const [leagueCode, setLeagueCode] = useState('');
  const [joining, setJoining] = useState(false);
  
  // Create state
  const [leagueName, setLeagueName] = useState('');
  const [totalRounds, setTotalRounds] = useState('5');
  const [leagueImage, setLeagueImage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const handleJoin = async () => {
    if (!leagueCode.trim()) {
      Alert.alert('Error', 'Please enter a league code');
      return;
    }
    setJoining(true);
    try {
      const response = await joinLeague(leagueCode.trim().toUpperCase());
      Alert.alert('Success', `You've joined ${response.data.name}!`);
      setLeagueCode('');
      setMode('menu');
      router.push(`/league/${response.data.id}`);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to join league');
    } finally {
      setJoining(false);
    }
  };

  const handleCreate = async () => {
    if (!leagueName.trim()) {
      Alert.alert('Error', 'Please enter a league name');
      return;
    }
    setCreating(true);
    try {
      const response = await createLeague({
        name: leagueName.trim(),
        total_rounds: parseInt(totalRounds) || 5,
        league_image: leagueImage,
      });
      Alert.alert('Success', `League "${response.data.name}" created!\nCode: ${response.data.league_code}`);
      setLeagueName('');
      setLeagueImage(null);
      setMode('menu');
      router.push(`/league/${response.data.id}`);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create league');
    } finally {
      setCreating(false);
    }
  };

  const pickImage = async () => {
    Alert.alert('Choose Image Source', 'Select where to get your league image from', [
      {
        text: 'Camera',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission needed', 'Camera access is required');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true,
          });
          if (!result.canceled && result.assets[0].base64) {
            setLeagueImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
          }
        },
      },
      {
        text: 'Photo Library',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true,
          });
          if (!result.canceled && result.assets[0].base64) {
            setLeagueImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (mode === 'menu') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Add</Text>
        </View>
        <View style={styles.menuContainer}>
          <TouchableOpacity style={styles.menuCard} onPress={() => setMode('create')} activeOpacity={0.7}>
            <View style={styles.menuIconCircle}>
              <Ionicons name="add-circle" size={32} color="#5A7A6B" />
            </View>
            <Text style={styles.menuCardTitle}>Create League</Text>
            <Text style={styles.menuCardSubtitle}>Start a new music competition</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuCard} onPress={() => setMode('join')} activeOpacity={0.7}>
            <View style={styles.menuIconCircle}>
              <Ionicons name="enter" size={32} color="#5A7A6B" />
            </View>
            <Text style={styles.menuCardTitle}>Join League</Text>
            <Text style={styles.menuCardSubtitle}>Enter a code to join friends</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (mode === 'join') {
    return (
      <SafeAreaView style={styles.container}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => setMode('menu')}>
                <Ionicons name="arrow-back" size={24} color="#212F36" />
              </TouchableOpacity>
              <Text style={[styles.title, { marginLeft: 12 }]}>Join League</Text>
            </View>
            <View style={styles.formContainer}>
              <Text style={styles.inputLabel}>League Code</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter 6-digit code"
                placeholderTextColor="#8B9A94"
                value={leagueCode}
                onChangeText={setLeagueCode}
                autoCapitalize="characters"
                maxLength={6}
                autoComplete="off"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.button, (!leagueCode.trim() || joining) && styles.buttonDisabled]}
                onPress={handleJoin}
                disabled={!leagueCode.trim() || joining}
              >
                {joining ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Join League</Text>
                )}
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
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setMode('menu')}>
              <Ionicons name="arrow-back" size={24} color="#212F36" />
            </TouchableOpacity>
            <Text style={[styles.title, { marginLeft: 12 }]}>Create League</Text>
          </View>
          <View style={styles.formContainer}>
            <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
              {leagueImage ? (
                <View>
                  <View style={styles.imagePreviewContainer}>
                    <View style={styles.imagePreview}>
                      <Text style={{ color: '#5A7A6B', fontSize: 12 }}>Image Selected</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.removeImage} onPress={() => setLeagueImage(null)}>
                    <Ionicons name="close-circle" size={20} color="#E57373" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.imagePickerInner}>
                  <Ionicons name="camera-outline" size={28} color="#5A7A6B" />
                  <Text style={styles.imagePickerText}>Add Photo</Text>
                </View>
              )}
            </TouchableOpacity>

            <Text style={styles.inputLabel}>League Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Friday Night Vibes"
              placeholderTextColor="#8B9A94"
              value={leagueName}
              onChangeText={setLeagueName}
              autoComplete="off"
              autoCorrect={false}
            />

            <Text style={styles.inputLabel}>Number of Rounds</Text>
            <TextInput
              style={styles.input}
              placeholder="5"
              placeholderTextColor="#8B9A94"
              value={totalRounds}
              onChangeText={setTotalRounds}
              keyboardType="number-pad"
              maxLength={2}
            />

            <TouchableOpacity
              style={[styles.button, (!leagueName.trim() || creating) && styles.buttonDisabled]}
              onPress={handleCreate}
              disabled={!leagueName.trim() || creating}
            >
              {creating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Create League</Text>
              )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#212F36',
  },
  menuContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 16,
    marginTop: -40,
  },
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0D8CC',
  },
  menuIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(90, 122, 107, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  menuCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212F36',
    marginBottom: 4,
  },
  menuCardSubtitle: {
    fontSize: 14,
    color: '#6B7A82',
  },
  formContainer: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212F36',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#212F36',
    borderWidth: 1,
    borderColor: '#E0D8CC',
  },
  button: {
    backgroundColor: '#5A7A6B',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  imagePicker: {
    alignSelf: 'center',
    marginBottom: 8,
  },
  imagePickerInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(90, 122, 107, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#5A7A6B',
    borderStyle: 'dashed',
  },
  imagePickerText: {
    fontSize: 11,
    color: '#5A7A6B',
    marginTop: 2,
  },
  imagePreviewContainer: {
    alignItems: 'center',
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(90, 122, 107, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#5A7A6B',
  },
  removeImage: {
    position: 'absolute',
    top: -4,
    right: -4,
  },
});
