import { Stack } from 'expo-router';

import { colors } from '@/ui/theme';

export default function BetsLayout() {
  return (
    <Stack
      screenOptions={{
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.background },
        gestureEnabled: true,
        headerBackTitle: 'Tracker',
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Tracker' }} />
      <Stack.Screen name="[id]" options={{ headerShown: true, title: 'Bet details' }} />
      <Stack.Screen name="new" options={{ headerShown: true, title: 'Add bet' }} />
    </Stack>
  );
}
