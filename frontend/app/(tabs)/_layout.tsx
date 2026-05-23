import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet } from 'react-native';
import { useAuth } from '../../src/context/AuthContext';

export default function TabLayout() {
  const { user } = useAuth();
  return (
    <Tabs
      key={user?.id ?? 'no-user'}
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
        // Icon-only bar — labels hidden globally. Active state is
        // signalled by the active/inactive tint colors applied to
        // the icon itself.
        tabBarShowLabel: false,
        tabBarItemStyle: {
          paddingVertical: 2,
          paddingHorizontal: 2,
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
          tabBarIcon: ({ color }) => <Ionicons name="headset-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: 'LEADERBOARD',
          tabBarIcon: ({ color }) => <Ionicons name="trophy-outline" size={22} color={color} />,
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
          title: 'Profile',
          tabBarIcon: ({ color }) => <Ionicons name="person-outline" size={22} color={color} />,
        }}
      />
      {/* add.tsx and join.tsx exist in this directory but must not appear in the tab bar */}
      <Tabs.Screen name="add" options={{ href: null }} />
      <Tabs.Screen name="join" options={{ href: null }} />
    </Tabs>
  );
}
