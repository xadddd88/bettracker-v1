import { Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect } from 'react';
import { type ColorValue, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { colors } from '@/ui/theme';

type TabIconProps = {
  color: ColorValue;
  fallback: string;
  focused: boolean;
  name: SymbolViewProps['name'];
};

function TabIcon({ color, fallback, focused, name }: TabIconProps) {
  const progress = useSharedValue(focused ? 1 : 0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    progress.value = reduceMotion
      ? (focused ? 1 : 0)
      : withSpring(focused ? 1 : 0, { damping: 14, stiffness: 210 });
  }, [focused, progress, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 + progress.value * 0.12 },
      { translateY: progress.value * -2 },
    ],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <SymbolView
        fallback={<Text style={{ color, fontSize: 13, fontWeight: '900' }}>{fallback}</Text>}
        name={name}
        size={21}
        tintColor={color}
      />
    </Animated.View>
  );
}

export default function AppLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        animation: 'fade',
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.accent,
        tabBarHideOnKeyboard: true,
        tabBarInactiveTintColor: colors.muted,
        tabBarItemStyle: { minHeight: 50, paddingTop: 6 },
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        tabBarStyle: {
          backgroundColor: colors.surfaceMuted,
          borderTopColor: colors.border,
          height: 58 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 6),
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarAccessibilityLabel: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              color={color}
              fallback="H"
              focused={focused}
              name={{ android: 'home', ios: 'house.fill', web: 'home' }}
            />
          ),
          title: 'Home',
        }}
      />
      <Tabs.Screen
        name="ai"
        options={{
          tabBarAccessibilityLabel: 'Scan',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              color={color}
              fallback="AI"
              focused={focused}
              name={{ android: 'auto_awesome', ios: 'sparkles', web: 'auto_awesome' }}
            />
          ),
          title: 'Scan',
        }}
      />
      <Tabs.Screen
        name="bets"
        options={{
          tabBarAccessibilityLabel: 'Tracker',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              color={color}
              fallback="T"
              focused={focused}
              name={{ android: 'confirmation_number', ios: 'ticket.fill', web: 'confirmation_number' }}
            />
          ),
          title: 'Tracker',
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="more"
        options={{ href: null }}
      />
      <Tabs.Screen name="index" options={{ href: null }} />
    </Tabs>
  );
}
