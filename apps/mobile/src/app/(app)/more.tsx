import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { ActionCard, ScreenHeader, SectionTitle } from '@/ui/product-shell';
import { colors } from '@/ui/theme';

export default function MoreScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const email = session?.user.email ?? 'Founder account';
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="BETTRACKER"
          subtitle="Profile, preferences and secure access."
          title="Account"
        />

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <SymbolView
              fallback={<Text style={styles.avatarFallback}>F</Text>}
              name={{ android: 'person', ios: 'person.fill', web: 'person' }}
              size={25}
              tintColor="#FFFFFF"
            />
          </View>
          <View style={styles.profileCopy}>
            <Text style={styles.profileTitle}>Signed in</Text>
            <Text numberOfLines={1} style={styles.profileEmail}>{email}</Text>
          </View>
          <View style={styles.secureBadge}>
            <Text style={styles.secureBadgeText}>ACTIVE</Text>
          </View>
        </View>

        <SectionTitle title="Performance" />
        <View style={styles.actions}>
          <ActionCard
            description="Open exact metrics calculated from saved Tracker records."
            icon={{ android: 'bar_chart', ios: 'chart.bar.fill', web: 'bar_chart' }}
            label="Stats"
            onPress={() => router.push('/(app)/stats')}
          />
        </View>

        <SectionTitle title="Preferences" />
        <View style={styles.rows}>
          <SettingRow label="Currency" value="From bankroll" />
          <SettingRow label="Theme" value="Dark" />
          <SettingRow label="Notifications" value="Coming later" />
        </View>

        <SectionTitle title="Account" />
        <View style={styles.actions}>
          <ActionCard
            description="Open the existing secure web account settings."
            icon={{ android: 'settings', ios: 'gearshape.fill', web: 'settings' }}
            label="Account settings"
            onPress={() => setNotice('Mobile account settings are being prepared. Use the web app for now.')}
          />
          <ActionCard
            description="Remove the mobile session from this device."
            icon={{ android: 'logout', ios: 'rectangle.portrait.and.arrow.right', web: 'logout' }}
            label="Log out"
            onPress={() => void signOut()}
          />
        </View>

        {notice ? (
          <View accessibilityLiveRegion="polite" style={styles.notice}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        <Text style={styles.version}>BetTracker mobile</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Text style={styles.settingValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { gap: 18, padding: 14, paddingBottom: 32 },
  profileCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  avatarFallback: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  profileCopy: { flex: 1, gap: 3, minWidth: 0 },
  profileTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  profileEmail: { color: colors.muted, fontSize: 12 },
  secureBadge: { backgroundColor: colors.accentMuted, paddingHorizontal: 8, paddingVertical: 5 },
  secureBadgeText: { color: colors.success, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  rows: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  settingRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 14,
  },
  settingLabel: { color: colors.secondaryText, fontSize: 14, fontWeight: '700' },
  settingValue: { color: colors.muted, fontSize: 12, textAlign: 'right' },
  actions: { gap: 10 },
  notice: { backgroundColor: colors.accentMuted, borderColor: colors.border, borderWidth: 1, padding: 12 },
  noticeText: { color: colors.text, fontSize: 12, lineHeight: 18 },
  version: { color: colors.placeholder, fontSize: 11, textAlign: 'center' },
});
