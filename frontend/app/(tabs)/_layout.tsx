import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { useInboxData } from '../../src/context/InboxDataContext';

export const FLOATING_NAV_CLEARANCE = 150;

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  home: 'home-outline',
  discovery: 'headset-outline',
  leaderboard: 'trophy-outline',
  inbox: 'chatbubble-outline',
  profile: 'person-outline',
};

const VISIBLE_TABS = new Set(Object.keys(TAB_ICONS));

function FloatingTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { totalUnread } = useInboxData();

  return (
    <View style={[styles.pill, { bottom: insets.bottom + 12 }]}>
      {state.routes.map((route: any, index: number) => {
        if (!VISIBLE_TABS.has(route.name)) return null;
        const active = state.index === index;
        const iconName = TAB_ICONS[route.name];

        return (
          <TouchableOpacity
            key={route.key}
            style={[styles.tab, active && styles.tabActive]}
            activeOpacity={0.7}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!event.defaultPrevented && !active) {
                navigation.navigate(route.name);
              }
            }}
          >
            <Ionicons name={iconName} size={22} color={active ? '#FFFFFF' : '#6A6A6A'} />
            {route.name === 'inbox' && totalUnread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{totalUnread > 99 ? '99+' : totalUnread}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function TabLayout() {
  const { user } = useAuth();
  return (
    <Tabs
      key={user?.id ?? 'no-user'}
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="discovery" />
      <Tabs.Screen name="leaderboard" />
      <Tabs.Screen name="inbox" />
      <Tabs.Screen name="profile" />
      <Tabs.Screen name="add" options={{ href: null }} />
      <Tabs.Screen name="join" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    left: 24,
    right: 24,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  tab: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: '#2A2A2A',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
});
