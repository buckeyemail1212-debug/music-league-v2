import React, { useState } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Platform,
  View,
  StyleSheet,
  Modal,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { joinLeague, createLeague } from '../../src/services/api';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

const COLORS = {
  navBar: '#212F36',
  cream: '#F5F0E8',
  inactive: 'rgba(245, 240, 232, 0.45)',
  accent: '#5A7A6B',
};

export default function TabLayout() {
  const router = useRouter();
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState<'choose' | 'create' | 'join'>('choose');
  
  const [leagueCode, setLeagueCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [leagueName, setLeagueName] = useState('');
  const [totalRounds, setTotalRounds] = useState(5);
  const [leagueImage, setLeagueImage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const resetAndClose = () => {
    setShowAddModal(false);
    setAddMode('choose');
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
      resetAndClose();
      Alert.alert('League Joined!', `You joined ${response.data.name}`);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to join');
    } finally {
      setJoining(false);
    }
  };

  const handleCreate = async () => {
    if (!leagueName.trim()) return;
    setCreating(true);
    try {
      const payload: any = {
        name: leagueName.trim(),
        total_rounds: totalRounds,
      };
      if (leagueImage) {
        payload.league_image = leagueImage;
      }
      const response = await createLeague(payload);
      // Cache the image locally so it shows immediately on home page
      if (leagueImage && response.data?.id) {
        try {
          await AsyncStorage.setItem(`league_image_${response.data.id}`, leagueImage);
        } catch {}
      }
      resetAndClose();
      Alert.alert('League Created!', `Code: ${response.data.league_code}`);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create');
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
          const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.15, base64: true });
          if (!result.canceled && result.assets[0].base64) setLeagueImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.15, base64: true });
          if (!result.canceled && result.assets[0].base64) setLeagueImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const renderModalContent = () => {
    if (addMode === 'join') {
      return (
        <View style={ms.popup}>
          <View style={ms.popupHeader}>
            <TouchableOpacity onPress={() => setAddMode('choose')}><Ionicons name="arrow-back" size={22} color="#212F36" /></TouchableOpacity>
            <Text style={ms.popupTitle}>Join League</Text>
            <View style={{ width: 22 }} />
          </View>
          <TextInput
            style={ms.codeInput}
            placeholder="Enter code"
            placeholderTextColor="#8B9A94"
            value={leagueCode}
            onChangeText={setLeagueCode}
            autoCapitalize="characters"
            maxLength={6}
            autoFocus
          />
          <TouchableOpacity
            style={[ms.actionBtn, !leagueCode.trim() && ms.actionBtnOff]}
            onPress={handleJoin}
            disabled={!leagueCode.trim() || joining}
          >
            {joining ? <ActivityIndicator color="#fff" /> : <Text style={ms.actionBtnText}>Join League</Text>}
          </TouchableOpacity>
        </View>
      );
    }
    if (addMode === 'create') {
      return (
        <View style={ms.popup}>
          <View style={ms.popupHeader}>
            <TouchableOpacity onPress={() => setAddMode('choose')}><Ionicons name="arrow-back" size={22} color="#212F36" /></TouchableOpacity>
            <Text style={ms.popupTitle}>Create League</Text>
            <View style={{ width: 22 }} />
          </View>
          <TouchableOpacity style={ms.imgPicker} onPress={pickImage}>
            {leagueImage ? (
              <Image source={{ uri: leagueImage }} style={ms.imgPreview} />
            ) : (
              <>
                <Ionicons name="camera-outline" size={24} color={COLORS.accent} />
                <Text style={ms.imgLabel}>Add Photo</Text>
              </>
            )}
          </TouchableOpacity>
          {leagueImage && <TouchableOpacity onPress={() => setLeagueImage(null)}><Text style={ms.removeImg}>Remove</Text></TouchableOpacity>}
          <Text style={ms.label}>League Name</Text>
          <TextInput style={ms.input} placeholder="e.g., Friday Night Vibes" placeholderTextColor="#8B9A94" value={leagueName} onChangeText={setLeagueName} />
          <Text style={ms.label}>Rounds</Text>
          <View style={ms.roundsGrid}>
            {[1,2,3,4,5,6,7,8,9,10].map(n => (
              <TouchableOpacity key={n} style={[ms.roundCircle, totalRounds === n && ms.roundCircleSel]} onPress={() => setTotalRounds(n)}>
                <Text style={[ms.roundText, totalRounds === n && ms.roundTextSel]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[ms.actionBtn, !leagueName.trim() && ms.actionBtnOff]}
            onPress={handleCreate}
            disabled={!leagueName.trim() || creating}
          >
            {creating ? <ActivityIndicator color="#fff" /> : <Text style={ms.actionBtnText}>Create League</Text>}
          </TouchableOpacity>
        </View>
      );
    }
    // Choose mode
    return (
      <View style={ms.popup}>
        <Text style={[ms.popupTitle, { marginBottom: 8 }]}>What would you like to do?</Text>
        <TouchableOpacity style={ms.optionBtn} onPress={() => setAddMode('create')}>
          <Ionicons name="add-circle-outline" size={24} color={COLORS.accent} />
          <Text style={ms.optionText}>Create League</Text>
        </TouchableOpacity>
        <TouchableOpacity style={ms.optionBtn} onPress={() => setAddMode('join')}>
          <Ionicons name="enter-outline" size={24} color={COLORS.accent} />
          <Text style={ms.optionText}>Join League</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: COLORS.navBar,
            borderTopWidth: 0,
            height: Platform.OS === 'ios' ? 88 : 64,
            paddingBottom: Platform.OS === 'ios' ? 28 : 10,
            paddingTop: 10,
            elevation: 0,
            shadowOpacity: 0,
          },
          tabBarActiveTintColor: COLORS.cream,
          tabBarInactiveTintColor: COLORS.inactive,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '500', marginTop: 2 },
        }}
      >
        <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color }) => <Ionicons name="home-outline" size={24} color={color} /> }} />
        <Tabs.Screen name="discovery" options={{ title: 'Discover', tabBarIcon: ({ color }) => <Ionicons name="search-outline" size={24} color={color} /> }} />
        <Tabs.Screen
          name="add"
          options={{
            title: '',
            tabBarIcon: () => (
              <View style={styles.addBtnWrap}>
                <View style={styles.addBtnNotch} />
                <View style={styles.addBtn}>
                  <Ionicons name="add" size={30} color="#FFFFFF" />
                </View>
              </View>
            ),
            tabBarLabel: () => null,
          }}
          listeners={() => ({
            tabPress: (e) => {
              e.preventDefault();
              setShowAddModal(true);
            },
          })}
        />
        <Tabs.Screen name="inbox" options={{ title: 'Inbox', tabBarIcon: ({ color }) => <Ionicons name="chatbubble-outline" size={24} color={color} /> }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <Ionicons name="person-outline" size={24} color={color} /> }} />
        <Tabs.Screen name="join" options={{ href: null }} />
      </Tabs>

      <Modal visible={showAddModal} transparent animationType="fade" onRequestClose={resetAndClose}>
        <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); if (addMode === 'choose') resetAndClose(); }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={ms.overlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              {renderModalContent()}
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  addBtnWrap: {
    position: 'absolute',
    top: -30,
    alignItems: 'center',
    width: 70,
    height: 80,
  },
  addBtnNotch: {
    position: 'absolute',
    bottom: -8,
    width: 70,
    height: 46,
    backgroundColor: '#212F36',
    borderTopLeftRadius: 35,
    borderTopRightRadius: 35,
  },
  addBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#212F36',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
});

const ms = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 24 },
  popup: { backgroundColor: '#FFF', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#E0D8CC' },
  popupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  popupTitle: { fontSize: 20, fontWeight: '700', color: '#212F36', textAlign: 'center', flex: 1 },
  optionBtn: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, backgroundColor: '#F5F0E8', marginTop: 10, gap: 12 },
  optionText: { fontSize: 16, fontWeight: '600', color: '#212F36' },
  codeInput: { backgroundColor: '#F5F0E8', borderRadius: 12, padding: 16, fontSize: 20, fontWeight: '700', color: '#212F36', textAlign: 'center', letterSpacing: 4, marginBottom: 12 },
  actionBtn: { backgroundColor: '#5A7A6B', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 16 },
  actionBtnOff: { opacity: 0.4 },
  actionBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  imgPicker: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F5F0E8', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', borderWidth: 2, borderColor: '#5A7A6B', borderStyle: 'dashed', overflow: 'hidden' },
  imgPreview: { width: 80, height: 80, borderRadius: 40 },
  imgLabel: { fontSize: 10, color: '#5A7A6B', marginTop: 2 },
  removeImg: { fontSize: 13, color: '#E57373', textAlign: 'center', marginTop: 6 },
  label: { fontSize: 14, fontWeight: '600', color: '#212F36', marginTop: 16, marginBottom: 8 },
  input: { backgroundColor: '#F5F0E8', borderRadius: 12, padding: 14, fontSize: 16, color: '#212F36' },
  roundsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  roundCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F5F0E8', alignItems: 'center', justifyContent: 'center' },
  roundCircleSel: { backgroundColor: '#5A7A6B' },
  roundText: { fontSize: 16, fontWeight: '600', color: '#212F36' },
  roundTextSel: { color: '#FFF' },
});
