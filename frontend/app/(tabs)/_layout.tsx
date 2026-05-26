import React, { useRef, useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, TouchableOpacity, Animated, Easing, StyleSheet } from 'react-native';
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

function TabButton({
  route,
  active,
  iconName,
  onPress,
  showBadge,
  badgeCount,
}: {
  route: any;
  active: boolean;
  iconName: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  showBadge: boolean;
  badgeCount: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const fillOpacity = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(fillOpacity, {
      toValue: active ? 1 : 0,
      duration: 160,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [active]);

  return (
    <TouchableOpacity
      style={styles.tab}
      activeOpacity={0.7}
      onPress={onPress}
      onPressIn={() => {
        Animated.timing(scale, { toValue: 0.94, duration: 80, useNativeDriver: true }).start();
      }}
      onPressOut={() => {
        Animated.timing(scale, { toValue: 1, duration: 160, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
      }}
    >
      <Animated.View style={[styles.tabInner, { transform: [{ scale }] }]}>
        <Animated.View style={[styles.tabFill, { opacity: fillOpacity }]} />
        <Ionicons name={iconName} size={22} color={active ? '#FFFFFF' : '#6A6A6A'} />
        {showBadge && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badgeCount > 99 ? '99+' : badgeCount}</Text>
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

function FloatingTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { totalUnread } = useInboxData();

  return (
    <View style={[styles.pill, { bottom: insets.bottom + 12 }]}>
      {state.routes.map((route: any, index: number) => {
        if (!VISIBLE_TABS.has(route.name)) return null;
        const active = state.index === index;
        return (
          <TabButton
            key={route.key}
            route={route}
            active={active}
            iconName={TAB_ICONS[route.name]}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!event.defaultPrevented && !active) {
                navigation.navigate(route.name);
              }
            }}
            showBadge={route.name === 'inbox' && totalUnread > 0}
            badgeCount={totalUnread}
          />
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
  },
  tabInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
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
