import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { colors } from '@/ui/theme';

export default function SignInScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    if (busy) return;
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }

    setBusy(true);
    setError(null);
    const result = await signIn(email.trim(), password);
    if (!result.ok) setError(result.message);
    setBusy(false);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <View style={styles.card}>
          <Text style={styles.eyebrow}>BETTRACKER</Text>
          <Text style={styles.title}>Founder sign in</Text>
          <Text style={styles.subtitle}>Read-only access to your tracked bets.</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoComplete="email"
              editable={!busy}
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.placeholder}
              returnKeyType="next"
              style={styles.input}
              value={email}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              accessibilityLabel="Password"
              autoCapitalize="none"
              autoComplete="current-password"
              editable={!busy}
              onChangeText={setPassword}
              onSubmitEditing={handleSignIn}
              placeholder="Your password"
              placeholderTextColor={colors.placeholder}
              returnKeyType="go"
              secureTextEntry
              style={styles.input}
              value={password}
            />
          </View>

          {error ? (
            <Text accessibilityLiveRegion="polite" role="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}

          <Pressable
            accessibilityLabel="Sign in"
            accessibilityRole="button"
            disabled={busy}
            onPress={handleSignIn}
            style={({ pressed }) => [styles.button, (busy || pressed) && styles.buttonMuted]}
          >
            {busy ? <ActivityIndicator color={colors.background} /> : <Text style={styles.buttonText}>Sign in</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  keyboard: { flex: 1, justifyContent: 'center', padding: 20 },
  card: { alignSelf: 'center', gap: 18, maxWidth: 440, width: '100%' },
  eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 2.4 },
  title: { color: colors.text, fontSize: 30, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: -10 },
  field: { gap: 7 },
  label: { color: colors.secondaryText, fontSize: 13, fontWeight: '600' },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 15,
  },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  button: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonMuted: { opacity: 0.65 },
  buttonText: { color: colors.background, fontSize: 16, fontWeight: '800' },
});
