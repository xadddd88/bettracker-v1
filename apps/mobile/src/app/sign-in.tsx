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
        <View style={styles.hero}>
          <View style={styles.heroTop}><Text style={styles.heroBrand}>XADDD</Text><Text style={styles.heroIndex}>ACCESS / 00</Text></View>
          <Text style={styles.title}>FOUNDER{`\n`}ACCESS</Text>
          <Text style={styles.heroFoot}>ANALYZE / VERIFY / TRACK</Text>
        </View>
        <View style={styles.card}>
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
              placeholderTextColor={colors.placeholder}
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
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>SIGN IN →</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  keyboard: { flex: 1 },
  hero: { backgroundColor: '#050505', flex: 0.85, justifyContent: 'center', minHeight: 280, padding: 18 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', left: 18, position: 'absolute', right: 18, top: 18 },
  heroBrand: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  heroIndex: { color: '#BEBEB8', fontSize: 8, fontWeight: '700', letterSpacing: 1 },
  heroFoot: { bottom: 18, color: '#BEBEB8', fontSize: 8, fontWeight: '700', letterSpacing: 1.3, position: 'absolute', right: 18 },
  card: { alignSelf: 'center', gap: 18, maxWidth: 440, padding: 18, width: '100%' },
  eyebrow: { color: colors.text, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: '#FFFFFF', fontSize: 50, fontWeight: '900', letterSpacing: -3, lineHeight: 45 },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: -9 },
  field: { gap: 7 },
  label: { color: colors.muted, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderBottomWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 0,
  },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  button: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    justifyContent: 'center',
    minHeight: 56,
  },
  buttonMuted: { opacity: 0.65 },
  buttonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
});
