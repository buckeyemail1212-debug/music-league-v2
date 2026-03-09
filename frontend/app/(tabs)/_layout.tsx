import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';

// Color Palette - Light Theme
const COLORS = {
  background: '#F5F0E8',       // Beige/Cream main background
  navBar: '#212F36',           // Deep Navy for navigation bar
  card: '#FFFFFF',             // White cards
  cardBorder: '#E0D8CC',       // Soft border for cards
  primary: '#212F36',          // Deep Navy for primary elements
  accent: '#5A7A6B',           // Muted green accent
  textPrimary: '#212F36',      // Deep Navy text
  textSecondary: '#6B7A82',    // Muted grey text
  cream: '#F5F0E8',            // Cream color for nav icons
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.navBar,
          borderTopColor: '#1A252B',
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 85 : 60,
          paddingBottom: Platform.OS === 'ios' ? 25 : 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: COLORS.cream,
        tabBarInactiveTintColor: 'rgba(245, 240, 232, 0.5)',
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="join"
        options={{
          title: 'Join',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="enter" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="discovery"
        options={{
          title: 'Music',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="musical-notes" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
