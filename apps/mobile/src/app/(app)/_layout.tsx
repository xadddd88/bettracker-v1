import { Stack } from 'expo-router';

import { colors } from '@/ui/theme';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.background },
        headerBackTitle: 'Bets',
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
      }}
    >
      <Stack.Screen name="bets/index" options={{ headerShown: false, title: 'Bets' }} />
      <Stack.Screen name="bets/[id]" options={{ headerShown: true, title: 'Bet details' }} />
    </Stack>
  );
}
