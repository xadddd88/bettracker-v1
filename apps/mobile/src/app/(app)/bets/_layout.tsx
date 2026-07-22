import { Stack } from 'expo-router';

import { semanticColors } from '@/ui/theme';

export default function BetsLayout() {
  return (
    <Stack
      screenOptions={{
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: semanticColors.night },
        gestureEnabled: true,
        headerBackTitle: 'Tracker',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: semanticColors.night },
        headerTintColor: semanticColors.textPrimary,
        headerTitleStyle: { fontSize: 11, fontWeight: '900' },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Tracker' }} />
      <Stack.Screen name="[id]" options={{ headerShown: true, title: 'Bet details' }} />
      <Stack.Screen name="new" options={{ headerShown: true, title: 'Add bet' }} />
    </Stack>
  );
}
