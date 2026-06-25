import React, { useState } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { useInboxData } from '../../src/context/InboxDataContext';
import { colors } from '../../src/theme/colors';

export const FLOATING_NAV_CLEARANCE = 150;

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  home: 'home-outline',
  discovery: 'headset-outline',
  leaderboard: 'trophy-outline',
  inbox: 'chatbubble-outline',
  profile: 'person-outline',
};

const TAB_LABELS: Record<string, string> = {
  home: 'Home',
  discovery: 'Discover',
  leaderboard: 'Leaderboard',
  profile: 'Profile',
};

// inbox is intentionally excluded from the bottom pill — the chat icon now
// lives in the home header. The route still exists (see <Tabs.Screen
// name="inbox" /> below) so navigation to /inbox keeps working.
const VISIBLE_TABS = new Set(Object.keys(TAB_ICONS).filter((k) => k !== 'inbox'));

// Liquid-glass nav geometry.
const ICON = 22;
const GAP = 7;            // space between icon and label in the expanded pill
const HPAD = 14;          // horizontal padding inside the expanded pill
const COLLAPSED = 44;     // diameter of an inactive glass circle
const ANIM = { duration: 200, easing: Easing.out(Easing.ease) };

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function TabButton({
  active,
  label,
  iconName,
  onPress,
  showBadge,
  badgeCount,
}: {
  active: boolean;
  label: string;
  iconName: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  showBadge: boolean;
  badgeCount: number;
}) {
  // Measured natural width of the label so the expanded pill fits it exactly
  // ("Leaderboard" included) without truncation.
  const [labelW, setLabelW] = useState(0);
  const expandedW = HPAD * 2 + ICON + GAP + labelW;
  const scale = useSharedValue(1);

  const onMeasure = (e: LayoutChangeEvent) => {
    const w = Math.ceil(e.nativeEvent.layout.width);
    if (w && w !== labelW) setLabelW(w);
  };

  // The whole tab animates its width (circle ↔ pill); a solid layer fades in
  // over the glass when active; the label reveals (width + opacity).
  const containerStyle = useAnimatedStyle(() => ({
    width: withTiming(active ? expandedW : COLLAPSED, ANIM),
    transform: [{ scale: scale.value }],
  }));
  const solidStyle = useAnimatedStyle(() => ({
    opacity: withTiming(active ? 1 : 0, ANIM),
  }));
  const labelStyle = useAnimatedStyle(() => ({
    width: withTiming(active ? GAP + labelW : 0, ANIM),
    opacity: withTiming(active ? 1 : 0, ANIM),
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => { scale.value = withTiming(0.94, { duration: 80 }); }}
      onPressOut={() => { scale.value = withTiming(1, ANIM); }}
      style={[styles.tab, containerStyle]}
    >
      {/* Clipped layer holds the rounded glass + solid active fill. overflow
          hidden lives HERE (not on the parent) so the tab's own drop shadow
          — cast by the overflow-visible parent — isn't clipped away. */}
      <View style={styles.tabClip}>
        <BlurView intensity={28} tint="light" style={styles.tabGlass} />
        <Animated.View style={[styles.tabSolid, solidStyle]} />
      </View>

      <Ionicons
        name={iconName}
        size={ICON}
        color={active ? colors.textPrimary : colors.textTertiary}
      />
      <Animated.View style={[styles.tabLabelWrap, labelStyle]}>
        <Text style={[styles.tabLabel, { width: labelW }]} numberOfLines={1}>{label}</Text>
      </Animated.View>

      {/* Off-screen measurer (natural label width) */}
      <Text style={styles.tabLabelMeasure} onLayout={onMeasure}>{label}</Text>

      {showBadge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badgeCount > 99 ? '99+' : badgeCount}</Text>
        </View>
      )}
    </AnimatedPressable>
  );
}

function FloatingTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { totalUnread, loading } = useInboxData();

  return (
    <View style={[styles.barWrap, { bottom: insets.bottom + 12 }]}>
      <View style={styles.row}>
        {state.routes.map((route: any, index: number) => {
          if (!VISIBLE_TABS.has(route.name)) return null;
          const active = state.index === index;
          return (
            <TabButton
              key={route.key}
              active={active}
              label={TAB_LABELS[route.name] ?? ''}
              iconName={TAB_ICONS[route.name]}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!event.defaultPrevented && !active) {
                  navigation.navigate(route.name);
                }
              }}
              showBadge={route.name === 'inbox' && !loading && totalUnread > 0}
              badgeCount={totalUnread}
            />
          );
        })}
      </View>
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
  // Transparent positioner — just a centered row holder. No background,
  // border, or shadow: each tab floats independently now.
  barWrap: {
    position: 'absolute',
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  // Each tab is its own floating element. Animated width (circle ↔ pill).
  // overflow VISIBLE so the per-tab drop shadow renders; the glass/solid
  // layers are clipped by the inner tabClip instead.
  tab: {
    height: COLLAPSED,
    borderRadius: COLLAPSED / 2,
    borderWidth: 1,
    borderColor: colors.borderFaint,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  // Inner clip: rounds + clips the glass/solid fill to the pill shape.
  tabClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: COLLAPSED / 2,
    overflow: 'hidden',
  },
  tabGlass: {
    ...StyleSheet.absoluteFillObject,
  },
  tabSolid: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
  },
  tabLabelWrap: {
    height: COLLAPSED,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tabLabel: {
    marginLeft: GAP,
    color: colors.textPrimary,
    fontSize: 13.5,
    fontWeight: '700',
  },
  tabLabelMeasure: {
    position: 'absolute',
    opacity: 0,
    left: 0,
    top: 0,
    fontSize: 13.5,
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: colors.onAccent,
    fontSize: 10,
    fontWeight: '800',
  },
});
