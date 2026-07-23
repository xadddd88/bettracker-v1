import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { BroadcastButton, BroadcastPanel, BroadcastStatus } from '@/ui/broadcast-noir-primitives';
import { geometry, semanticColors } from '@/ui/theme';

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
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}><Text style={styles.heroBrand}>BETTRACKER</Text><Text style={styles.heroIndex}>ACCESS / 00</Text></View>
          <Text style={styles.title}>FOUNDER{`\n`}ACCESS</Text>
          <Text style={styles.heroFoot}>ANALYZE / VERIFY / TRACK</Text>
        </View>
        <BroadcastPanel style={styles.card}>
          <Text style={styles.eyebrow}>SECURE SIGN IN</Text>
          <Text style={styles.subtitle}>Use the same account as the web tracker.</Text>

          <View style={styles.field}>
            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoComplete="email"
              editable={!busy}
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={semanticColors.textQuiet}
              returnKeyType="next"
              style={styles.input}
              value={email}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>PASSWORD</Text>
            <TextInput
              accessibilityLabel="Password"
              autoCapitalize="none"
              autoComplete="current-password"
              editable={!busy}
              onChangeText={setPassword}
              onSubmitEditing={handleSignIn}
              placeholder="Your password"
              placeholderTextColor={semanticColors.textQuiet}
              returnKeyType="go"
              secureTextEntry
              style={styles.input}
              value={password}
            />
          </View>

          {error ? (
            <BroadcastStatus label={error} status="negative" />
          ) : null}

          <BroadcastButton
            accessibilityLabel="Sign in"
            disabled={busy}
            label={busy ? 'Signing in…' : 'Sign in →'}
            onPress={handleSignIn}
            style={busy ? styles.buttonMuted : undefined}
          />
        </BroadcastPanel>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.night, flex: 1 },
  keyboard: { flex: 1 },
  hero: { backgroundColor: semanticColors.night, flex: 0.85, justifyContent: 'center', minHeight: 280, padding: 18 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', left: 18, position: 'absolute', right: 18, top: 18 },
  heroBrand: { color: semanticColors.textPrimary, fontSize: 15, fontWeight: '900' },
  heroIndex: { color: semanticColors.textMuted, fontSize: 8, fontWeight: '700', letterSpacing: 1 },
  heroFoot: { bottom: 18, color: semanticColors.textMuted, fontSize: 8, fontWeight: '700', letterSpacing: 1.3, position: 'absolute', right: 18 },
  card: { alignSelf: 'center', gap: 18, maxWidth: 440, padding: 18, width: '100%' },
  eyebrow: { color: semanticColors.textQuietRaised, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: semanticColors.textPrimary, fontSize: 50, fontWeight: '900', letterSpacing: -3, lineHeight: 45 },
  subtitle: { color: semanticColors.textMuted, fontSize: 12, lineHeight: 18, marginTop: -9 },
  field: { gap: 7 },
  label: { color: semanticColors.textMuted, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  input: {
    backgroundColor: semanticColors.field,
    borderColor: semanticColors.borderStrong,
    borderRadius: geometry.radiusControl,
    borderWidth: 1,
    color: semanticColors.textPrimary,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 12,
  },
  buttonMuted: { opacity: 0.65 },
});
