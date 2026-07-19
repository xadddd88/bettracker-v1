import { Tabs } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { colors } from '@/ui/theme';

function TabMarker({ focused }: { focused: boolean }) {
  const progress = useSharedValue(focused ? 1 : 0);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    progress.value = reduceMotion ? (focused ? 1 : 0) : withSpring(focused ? 1 : 0, { damping: 16, stiffness: 230 });
  }, [focused, progress, reduceMotion]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.25 + progress.value * 0.75,
    transform: [{ scaleX: 0.28 + progress.value * 0.72 }],
  }));
  return <Animated.View style={[styles.marker, style]} />;
}

export default function AppLayout() {
  const insets = useSafeAreaInsets();
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
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: '#FFFFFF',
        tabBarHideOnKeyboard: true,
        tabBarInactiveTintColor: '#91918B',
        tabBarItemStyle: { minHeight: 52, paddingTop: 6 },
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
        tabBarStyle: {
          backgroundColor: '#050505',
          borderTopColor: '#050505',
          height: 58 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 6),
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
  marker: { backgroundColor: '#FFFFFF', height: 2, width: 28 },
});
