import React, { useState } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Platform,
  Pressable,
  View,
  Modal,
  TouchableOpacity,
  Text,
  StyleSheet,
  TouchableWithoutFeedback,
} from 'react-native';

function NewTabButton(props: any) {
  const { onPress } = props;
  return (
    <Pressable
      {...props}
      onPress={onPress}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: '#7C3AED',
          alignItems: 'center',
          justifyContent: 'center',
          // Lift the button above the bar's top edge so it visually
          // overlaps the divider and floats over the dark nav.
          marginTop: -18,
          // Purple glow (shadow on iOS / elevation on Android).
          shadowColor: '#7C3AED',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.5,
          shadowRadius: 14,
          elevation: 10,
        }}
      >
        <Ionicons name="add" size={30} color="#FFFFFF" />
      </View>
    </Pressable>
  );
}

export default function TabLayout() {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);

  const goCreate = () => {
    setSheetOpen(false);
    router.push('/create-league' as any);
  };
  const goJoin = () => {
    setSheetOpen(false);
    router.push('/join-league' as any);
  };

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#121212',
            // Subtle top divider line — a hairline that reads as a
            // separator against the dark background without looking like
            // a hard border.
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: 'rgba(255,255,255,0.08)',
            height: Platform.OS === 'ios' ? 84 : 64,
            paddingBottom: Platform.OS === 'ios' ? 26 : 10,
            paddingTop: 10,
            elevation: 0,
            shadowOpacity: 0,
          },
          tabBarActiveTintColor: '#7C3AED',
          tabBarInactiveTintColor: '#B3B3B3',
          tabBarItemStyle: {
            // Equal horizontal space per slot. Tight internal padding so
            // long labels like "MY GAME" don't clip.
            paddingVertical: 2,
            paddingHorizontal: 2,
          },
          tabBarLabelStyle: {
            // Slightly smaller + tighter spacing so "MY GAME" and
            // "DISCOVER" fit comfortably at ~390pt viewport widths.
            fontSize: 9.5,
            fontWeight: '700',
            marginTop: 4,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
            includeFontPadding: false,
          },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: 'HOME',
            tabBarIcon: ({ color }) => <Ionicons name="home-outline" size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="discovery"
          options={{
            title: 'DISCOVER',
            tabBarIcon: ({ color }) => <Ionicons name="search-outline" size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="add"
          options={{
            title: '',
            tabBarButton: (props) => (
              <NewTabButton {...props} onPress={() => setSheetOpen(true)} />
            ),
            tabBarLabel: () => null,
            tabBarIcon: () => null,
          }}
        />
        <Tabs.Screen
          name="inbox"
          options={{
            title: 'INBOX',
            tabBarIcon: ({ color }) => <Ionicons name="chatbubble-outline" size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'MY GAME',
            tabBarIcon: ({ color }) => (
              <Ionicons name="musical-note-outline" size={22} color={color} />
            ),
          }}
        />
        {/* join.tsx exists in this directory but must not appear in the tab bar */}
        <Tabs.Screen name="join" options={{ href: null }} />
      </Tabs>

      <Modal
        visible={sheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSheetOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setSheetOpen(false)}>
          <View style={styles.sheetOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.sheet}>
                <View style={styles.grabber} />
                <Text style={styles.sheetTitle}>What do you want to do?</Text>
                <TouchableOpacity
                  style={styles.sheetOption}
                  activeOpacity={0.8}
                  onPress={goCreate}
                >
                  <View style={styles.sheetIconBox}>
                    <Ionicons name="add-circle" size={22} color="#7C3AED" />
                  </View>
                  <Text style={styles.sheetOptionTitle}>Create League</Text>
                  <Ionicons name="chevron-forward" size={18} color="#6A6A6A" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.sheetOption}
                  activeOpacity={0.8}
                  onPress={goJoin}
                >
                  <View style={styles.sheetIconBox}>
                    <Ionicons name="enter" size={22} color="#7C3AED" />
                  </View>
                  <Text style={styles.sheetOptionTitle}>Join League</Text>
                  <Ionicons name="chevron-forward" size={18} color="#6A6A6A" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.sheetCancel}
                  onPress={() => setSheetOpen(false)}
                >
                  <Text style={styles.sheetCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: '#181818',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    paddingHorizontal: 20,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B3B3B3',
    letterSpacing: 1,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#282828',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
    gap: 12,
  },
  sheetIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(124,58,237,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetOptionTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sheetCancel: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  sheetCancelText: {
    fontSize: 14,
    color: '#B3B3B3',
    fontWeight: '600',
  },
});
