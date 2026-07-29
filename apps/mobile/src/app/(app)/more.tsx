import { SymbolView } from 'expo-symbols';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { fetchBankroll, type BankrollDto } from '@/bets/data';
import { readErrorMessage } from '@/bets/errors';
import { formatMoney } from '@/bets/models';
import { ActionCard, ScreenHeader, SectionTitle } from '@/ui/product-shell';
import { BroadcastPanel, BroadcastStatus } from '@/ui/broadcast-noir-primitives';
import { semanticColors } from '@/ui/theme';

export default function MoreScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const userId = session?.user.id;
  const email = session?.user.email ?? 'Founder account';
  const [notice, setNotice] = useState<string | null>(null);
  const [bankroll, setBankroll] = useState<BankrollDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      setBankroll(await fetchBankroll(userId));
    } catch (nextError) {
      setError(readErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="RISK"
          subtitle="Default bankroll and secure control surface."
          title="Risk"
        />

        <BroadcastPanel style={styles.profileCard}>
          <View style={styles.avatar}>
            <SymbolView
              fallback={<Text style={styles.avatarFallback}>F</Text>}
              name={{ android: 'person', ios: 'person.fill', web: 'person' }}
              size={25}
              tintColor={semanticColors.textPrimary}
            />
          </View>
          <View style={styles.profileCopy}>
            <Text style={styles.profileTitle}>Signed in</Text>
            <Text numberOfLines={1} style={styles.profileEmail}>{email}</Text>
          </View>
          <BroadcastStatus label="Active session" status="success" />
        </BroadcastPanel>

        <SectionTitle title="Bankroll" />
        <BroadcastPanel style={styles.riskCard}>
          {loading ? (
            <>
              <ActivityIndicator color={semanticColors.signal} size="small" />
              <BroadcastStatus label="Loading bankroll" status="neutral" />
            </>
          ) : error ? (
            <>
              <BroadcastStatus label="Could not load bankroll" status="negative" />
              <Text accessibilityLiveRegion="polite" role="alert" style={styles.error}>{error}</Text>
            </>
          ) : (
            <>
              <View style={styles.riskMetric}>
                <Text style={styles.riskLabel}>Default balance</Text>
                <Text style={styles.riskValue}>
                  {bankroll?.balance === null || bankroll?.balance === undefined
                    ? '—'
                    : formatMoney(bankroll.balance, bankroll.currency)}
                </Text>
              </View>
              <BroadcastStatus label="Risk checks use user-entered exposure only" status="review" />
            </>
          )}
        </BroadcastPanel>

        <SectionTitle title="Insights" />
        <View style={styles.actions}>
          <ActionCard
            description="Open exact metrics calculated from saved Journal records."
            icon={{ android: 'bar_chart', ios: 'chart.bar.fill', web: 'bar_chart' }}
            label="Insights"
            onPress={() => router.push('/(app)/stats')}
          />
        </View>

        <SectionTitle title="Preferences" />
        <View style={styles.rows}>
          <SettingRow label="Currency" value="From bankroll" />
          <SettingRow label="Theme" value="Dark" />
          <SettingRow label="Notifications" value="Off" />
        </View>

        <SectionTitle title="Account" />
        <View style={styles.actions}>
          <ActionCard
            description="Open the existing secure web account settings."
            icon={{ android: 'settings', ios: 'gearshape.fill', web: 'settings' }}
            label="Account settings"
            onPress={() => setNotice('Use the web app for detailed account settings.')}
          />
          <ActionCard
            description="Remove the mobile session from this device."
            icon={{ android: 'logout', ios: 'rectangle.portrait.and.arrow.right', web: 'logout' }}
            label="Log out"
            onPress={() => void signOut()}
          />
        </View>

        {notice ? (
          <BroadcastStatus label={notice} status="review" />
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
  safeArea: { backgroundColor: semanticColors.night, flex: 1 },
  content: { gap: 18, padding: 14, paddingBottom: 32 },
  profileCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: semanticColors.fieldRaised,
    borderColor: semanticColors.borderStrong,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  avatarFallback: { color: semanticColors.textPrimary, fontSize: 18, fontWeight: '900' },
  profileCopy: { flex: 1, gap: 3, minWidth: 0 },
  profileTitle: { color: semanticColors.textPrimary, fontSize: 16, fontWeight: '800' },
  profileEmail: { color: semanticColors.textMuted, fontSize: 12 },
  rows: { backgroundColor: semanticColors.field, borderColor: semanticColors.borderStrong, borderWidth: 1 },
  riskCard: { gap: 12, padding: 14 },
  riskMetric: { gap: 4 },
  riskLabel: { color: semanticColors.textMuted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  riskValue: { color: semanticColors.textPrimary, fontSize: 26, fontWeight: '900' },
  error: { color: semanticColors.negative, fontSize: 12, lineHeight: 18 },
  settingRow: {
    alignItems: 'center',
    borderBottomColor: semanticColors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 14,
  },
  settingLabel: { color: semanticColors.textPrimary, fontSize: 14, fontWeight: '700' },
  settingValue: { color: semanticColors.textMuted, fontSize: 12, textAlign: 'right' },
  actions: { gap: 10 },
  version: { color: semanticColors.textQuiet, fontSize: 11, textAlign: 'center' },
});
