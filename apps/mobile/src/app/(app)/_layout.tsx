import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { BottomNavigation } from '@/ui/bottom-navigation';
import { colors } from '@/ui/theme';

export default function AppLayout() {
  return (
    <View style={styles.root}>
      <View style={styles.stack}>
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
          <Stack.Screen name="ai/index" options={{ headerShown: false, title: 'AI' }} />
        </Stack>
      </View>
      <BottomNavigation />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.background,
    flex: 1,
  },
  stack: {
    flex: 1,
  },
});
