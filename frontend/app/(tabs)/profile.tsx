import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  ActionSheetIOS,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../src/context/AuthContext';
import { format } from 'date-fns';

export default function ProfileScreen() {
  const { user, logout, updateUser } = useAuth();
  const router = useRouter();
  const [uploading, setUploading] = useState(false);

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  const pickFromGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant photo library permissions.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        setUploading(true);
        const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
        await updateUser({ profile_photo: base64Image });
        setUploading(false);
      }
    } catch (error: any) {
      setUploading(false);
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant camera permissions.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        setUploading(true);
        const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
        await updateUser({ profile_photo: base64Image });
        setUploading(false);
      }
    } catch (error: any) {
      setUploading(false);
    }
  };

  const handleChangePhoto = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Library'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            takePhoto();
          } else if (buttonIndex === 2) {
            pickFromGallery();
          }
        }
      );
    } else {
      Alert.alert(
        'Change Profile Photo',
        'Choose an option',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Take Photo', onPress: takePhoto },
          { text: 'Choose from Library', onPress: pickFromGallery },
        ]
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.avatarContainer} onPress={handleChangePhoto} disabled={uploading}>
            {uploading ? (
              <ActivityIndicator size="large" color="#5A7A6B" />
            ) : user?.profile_photo ? (
              <Image source={{ uri: user.profile_photo }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person" size={50} color="#5A7A6B" />
            )}
          </TouchableOpacity>
          <Text style={styles.tapToChange}>Tap photo to change</Text>
          <Text style={styles.username}>{user?.display_name || user?.username}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Info</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={styles.infoLeft}>
                <Ionicons name="calendar-outline" size={20} color="#5A7A6B" />
                <Text style={styles.infoLabel}>Member Since</Text>
              </View>
              <Text style={styles.infoValue}>
                {user?.created_at ? format(new Date(user.created_at), 'MMM d, yyyy') : 'N/A'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How to Play</Text>
          <View style={styles.infoCard}>
            <View style={styles.helpItem}>
              <View style={styles.helpNumber}>
                <Text style={styles.helpNumberText}>1</Text>
              </View>
              <Text style={styles.helpText}>Create a league or join one with a code</Text>
            </View>
            <View style={styles.helpItem}>
              <View style={styles.helpNumber}>
                <Text style={styles.helpNumberText}>2</Text>
              </View>
              <Text style={styles.helpText}>Submit a song matching the round's theme</Text>
            </View>
            <View style={styles.helpItem}>
              <View style={styles.helpNumber}>
                <Text style={styles.helpNumberText}>3</Text>
              </View>
              <Text style={styles.helpText}>Vote on songs by ranking them best to worst</Text>
            </View>
            <View style={styles.helpItem}>
              <View style={styles.helpNumber}>
                <Text style={styles.helpNumberText}>4</Text>
              </View>
              <Text style={styles.helpText}>See who wins when voting ends!</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.infoCard}>
            <TouchableOpacity style={styles.actionRow} onPress={handleLogout}>
              <View style={styles.actionLeft}>
                <Ionicons name="log-out-outline" size={22} color="#ef4444" />
                <Text style={styles.actionText}>Logout</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#8DA19B" />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.version}>Music League v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F0E8',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 32,
    borderBottomWidth: 1,
    borderBottomColor: '#E0D8CC',
    position: 'relative',
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#E0D8CC',
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  tapToChange: {
    fontSize: 12,
    color: '#5A7A6B',
    marginTop: 8,
  },
  username: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212F36',
    marginTop: 8,
  },
  email: {
    fontSize: 14,
    color: '#6B7A82',
    marginTop: 4,
  },
  statsContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 4,
    fontWeight: '500',
  },
  section: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7A82',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E0D8CC',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: '#6B7A82',
  },
  infoValue: {
    fontSize: 14,
    color: '#212F36',
    fontWeight: '500',
  },
  helpItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  helpNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#5A7A6B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  helpNumberText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  helpText: {
    flex: 1,
    fontSize: 14,
    color: '#212F36',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionText: {
    fontSize: 16,
    color: '#ef4444',
    fontWeight: '500',
  },
  actionDivider: {
    height: 1,
    backgroundColor: '#E0D8CC',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ef4444',
  },
  version: {
    fontSize: 12,
    color: '#6B7A82',
    textAlign: 'center',
    marginTop: 32,
    marginBottom: 20,
  },
});
