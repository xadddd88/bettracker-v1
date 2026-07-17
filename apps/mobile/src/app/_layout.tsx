import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AuthProvider, useAuth } from '@/auth/auth-context';
import { colors } from '@/ui/theme';

function RootNavigator() {
  const { booting, configurationError, session } = useAuth();

  if (booting) {
    return (
      <View accessibilityLabel="Restoring session" style={styles.centered}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.message}>Restoring your session…</Text>
      </View>
    );
  }

  if (configurationError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Configuration required</Text>
        <Text style={styles.message}>{configurationError}</Text>
      </View>
    );
  }

  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background }, headerShown: false }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
      <StatusBar style="light" />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    gap: 16,
    justifyContent: 'center',
    padding: 28,
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  message: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
});
