import { Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { type ColorValue, Text } from 'react-native';

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
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.accent,
        tabBarHideOnKeyboard: true,
        tabBarInactiveTintColor: colors.muted,
        tabBarItemStyle: { minHeight: 52, paddingVertical: 4 },
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          minHeight: 58,
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
          tabBarAccessibilityLabel: 'AI Analyzer',
          tabBarIcon: ({ color }) => (
            <TabIcon
              color={color}
              fallback="AI"
              name={{ android: 'auto_awesome', ios: 'sparkles', web: 'auto_awesome' }}
            />
          ),
          title: 'AI',
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
        options={{
          tabBarAccessibilityLabel: 'Stats',
          tabBarIcon: ({ color }) => (
            <TabIcon
              color={color}
              fallback="S"
              name={{ android: 'bar_chart', ios: 'chart.bar.fill', web: 'bar_chart' }}
            />
          ),
          title: 'Stats',
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          tabBarAccessibilityLabel: 'More',
          tabBarIcon: ({ color }) => (
            <TabIcon
              color={color}
              fallback="•••"
              name={{ android: 'more_horiz', ios: 'ellipsis', web: 'more_horiz' }}
            />
          ),
          title: 'More',
        }}
      />
      <Tabs.Screen name="index" options={{ href: null }} />
    </Tabs>
  );
}
