import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, View } from 'react-native';
import { tabEvents } from '../../src/utils/tabEvents';

function NewTabButton(props: any) {
  const router = useRouter();
  return (
    <Pressable
      {...props}
      onPress={() => {
        tabEvents.openNewLeague();
        router.navigate('/(tabs)/home');
      }}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: '#7C3AED',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: -14,
          shadowColor: '#7C3AED',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 8,
          elevation: 8,
        }}
      >
        <Ionicons name="add" size={30} color="#FFFFFF" />
      </View>
    </Pressable>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#121212',
          borderTopWidth: 0,
          height: Platform.OS === 'ios' ? 80 : 60,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          paddingTop: 10,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarActiveTintColor: '#7C3AED',
        tabBarInactiveTintColor: '#B3B3B3',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', marginTop: 2, letterSpacing: 0.6 },
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
          tabBarButton: (props) => <NewTabButton {...props} />,
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
          title: 'PROFILE',
          tabBarIcon: ({ color }) => <Ionicons name="person-outline" size={22} color={color} />,
        }}
      />
      {/* join.tsx exists in this directory but must not appear in the tab bar */}
      <Tabs.Screen name="join" options={{ href: null }} />
    </Tabs>
  );
}
