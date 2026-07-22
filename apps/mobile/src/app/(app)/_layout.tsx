import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';

import { semanticColors } from '@/ui/theme';

function TabMarker({ focused }: { focused: boolean }) {
  return <View style={[styles.marker, focused ? styles.markerFocused : null]} />;
}

export default function AppLayout() {
  const screen = (title: string) => ({
    tabBarAccessibilityLabel: title,
    tabBarIcon: ({ focused }: { focused: boolean }) => <TabMarker focused={focused} />,
    title,
  });

  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        animation: 'shift',
        headerShown: false,
        sceneStyle: { backgroundColor: semanticColors.night },
        tabBarActiveBackgroundColor: semanticColors.signal,
        tabBarActiveTintColor: semanticColors.onSignal,
        tabBarHideOnKeyboard: true,
        tabBarInactiveBackgroundColor: semanticColors.field,
        tabBarInactiveTintColor: semanticColors.textQuiet,
        tabBarItemStyle: {
          borderRadius: 8,
          margin: 4,
          minHeight: Platform.OS === 'android' ? 48 : 44,
          paddingTop: 4,
        },
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
        tabBarStyle: {
          backgroundColor: semanticColors.night,
          borderTopColor: semanticColors.borderStrong,
          paddingTop: 2,
        },
      }}
    >
      <Tabs.Screen name="home" options={screen('HOME')} />
      <Tabs.Screen name="ai" options={screen('SCAN')} />
      <Tabs.Screen name="bets" options={screen('TRACKER')} />
      <Tabs.Screen name="stats" options={{ href: null }} />
      <Tabs.Screen name="more" options={{ href: null }} />
      <Tabs.Screen name="index" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  marker: {
    backgroundColor: semanticColors.borderStrong,
    borderRadius: 3,
    height: 5,
    width: 18,
  },
  markerFocused: { backgroundColor: semanticColors.onSignal },
});
