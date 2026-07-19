import { Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { type ColorValue, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/ui/theme';

type TabIconProps = {
  color: ColorValue;
  fallback: string;
  name: SymbolViewProps['name'];
};

function TabIcon({ color, fallback, name }: TabIconProps) {
  return (
    <SymbolView
      fallback={<Text style={{ color, fontSize: 13, fontWeight: '900' }}>{fallback}</Text>}
      name={name}
      size={21}
      tintColor={color}
    />
  );
}

export default function AppLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.accent,
        tabBarHideOnKeyboard: true,
        tabBarInactiveTintColor: colors.muted,
        tabBarItemStyle: { minHeight: 50, paddingTop: 6 },
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
        tabBarStyle: {
          backgroundColor: colors.surface,
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
          tabBarIcon: ({ color }) => (
            <TabIcon
              color={color}
              fallback="H"
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
          tabBarIcon: ({ color }) => (
            <TabIcon
              color={color}
              fallback="AI"
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
          tabBarIcon: ({ color }) => (
            <TabIcon
              color={color}
              fallback="T"
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
