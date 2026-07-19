import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { fetchBankroll, fetchBets } from '@/bets/data';
import { readErrorMessage } from '@/bets/errors';
import { formatMoney, type BetDto } from '@/bets/models';
import { summarizeBets } from '@/bets/summary';
import { BetTicket } from '@/ui/bet-ticket';
import { colors } from '@/ui/theme';
import { TimeWarpBackdrop, WarpRail } from '@/ui/time-warp';

export default function HomeScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [bets, setBets] = useState<BetDto[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [nextBets, bankroll] = await Promise.all([fetchBets(userId), fetchBankroll(userId)]);
      setBets(nextBets);
      setBalance(bankroll.balance);
      setCurrency(bankroll.currency);
    } catch (nextError) {
      setError(readErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const summary = useMemo(() => summarizeBets(bets), [bets]);
  const recent = bets.slice(0, 3);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <TimeWarpBackdrop />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <WarpRail />
            <Text style={styles.brand}>XADDD</Text>
            <Text style={styles.title}>Overview</Text>
          </View>
          <Pressable
            accessibilityLabel="Account and settings"
            accessibilityRole="button"
            onPress={() => router.push('/(app)/more')}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <SymbolView
              fallback={<Text style={styles.iconFallback}>ME</Text>}
              name={{ android: 'person', ios: 'person.fill', web: 'person' }}
              size={21}
              tintColor={colors.secondaryText}
            />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.muted}>Updating your dashboard…</Text>
          </View>
        ) : (
          <View style={styles.bankrollCard}>
            <WarpRail />
            <View style={styles.balanceRow}>
              <View>
                <Text style={styles.metricLabel}>BANKROLL</Text>
                <Text style={styles.balance}>{balance === null ? '—' : formatMoney(balance, currency)}</Text>
              </View>
              <View style={styles.openBadge}>
                <Text style={styles.openBadgeValue}>{summary.openCount}</Text>
                <Text style={styles.openBadgeLabel}>OPEN</Text>
              </View>
            </View>
            <View style={styles.summaryRow}>
              <SummaryMetric
                label="NET P&L"
                tone={summary.netPnl > 0 ? 'positive' : summary.netPnl < 0 ? 'negative' : 'neutral'}
                value={summary.settledCount === 0 ? '—' : formatMoney(summary.netPnl, currency)}
              />
              <SummaryMetric label="TRACKED" value={String(bets.length)} />
              <SummaryMetric label="SETTLED" value={String(summary.settledCount)} />
            </View>
          </View>
        )}

        {error ? (
          <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.errorCard}>
            <Text accessibilityLiveRegion="polite" style={styles.errorText}>{error}</Text>
            <Text style={styles.retry}>Tap to retry</Text>
          </Pressable>
        ) : null}

        <View style={styles.quickGrid}>
          <QuickAction
            icon={{ android: 'document_scanner', ios: 'viewfinder', web: 'document_scanner' }}
            label="Scan coupon"
            onPress={() => router.push('/(app)/ai')}
            primary
          />
          <QuickAction
            icon={{ android: 'add', ios: 'plus', web: 'add' }}
            label="Add bet"
            onPress={() => router.push('/(app)/bets/new')}
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent bets</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/(app)/bets')} style={styles.textButton}>
            <Text style={styles.textButtonLabel}>View all</Text>
          </Pressable>
        </View>

        <View style={styles.recentCard}>
          {recent.length === 0 && !loading ? (
            <View style={styles.emptyRecent}>
              <Text style={styles.emptyTitle}>No bets yet</Text>
              <Text style={styles.muted}>Scan a coupon or prepare your first bet.</Text>
            </View>
          ) : recent.map((bet, index) => (
            <BetTicket
              bet={bet}
              compact
              currency={currency}
              key={bet.id}
              onPress={() => router.push({ pathname: '/(app)/bets/[id]', params: { id: bet.id } })}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryMetric({ label, tone = 'neutral', value }: {
  label: string;
  tone?: 'negative' | 'neutral' | 'positive';
  value: string;
}) {
  return (
    <View style={styles.summaryMetric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.summaryValue, tone === 'positive' && styles.positive, tone === 'negative' && styles.negative]}>
        {value}
      </Text>
    </View>
  );
}

function QuickAction({ icon, label, onPress, primary = false }: {
  icon: SymbolViewProps['name'];
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.quickAction, primary && styles.quickActionPrimary, pressed && styles.pressed]}
    >
      <View style={[styles.quickIcon, primary && styles.quickIconPrimary]}>
        <SymbolView fallback={<Text>+</Text>} name={icon} size={20} tintColor={colors.accent} />
      </View>
      <Text style={[styles.quickLabel, primary && styles.quickLabelPrimary]}>{label}</Text>
      <Text style={[styles.chevron, primary && styles.quickLabelPrimary]}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { gap: 14, paddingBottom: 24, paddingHorizontal: 14, paddingTop: 6 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  headerCopy: { gap: 4 },
  brand: { color: colors.accent, fontFamily: 'monospace', fontSize: 9, fontWeight: '800', letterSpacing: 2.2 },
  title: { color: colors.text, fontSize: 25, fontWeight: '800', letterSpacing: -0.3 },
  iconButton: { alignItems: 'center', borderColor: colors.border, borderRadius: 21, borderWidth: StyleSheet.hairlineWidth, height: 42, justifyContent: 'center', width: 42 },
  iconFallback: { color: colors.secondaryText, fontSize: 10, fontWeight: '900' },
  loadingRow: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, flexDirection: 'row', gap: 12, minHeight: 102, padding: 16 },
  bankrollCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, gap: 16, padding: 16 },
  balanceRow: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  metricLabel: { color: colors.placeholder, fontFamily: 'monospace', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  balance: { color: colors.text, fontSize: 29, fontVariant: ['tabular-nums'], fontWeight: '800', letterSpacing: -0.8, marginTop: 3 },
  openBadge: { alignItems: 'baseline', backgroundColor: colors.accentMuted, borderRadius: 6, flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingVertical: 5 },
  openBadgeValue: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  openBadgeLabel: { color: colors.accent, fontSize: 8, fontWeight: '700', letterSpacing: 0.7 },
  summaryRow: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', paddingTop: 14 },
  summaryMetric: { flex: 1, gap: 4 },
  summaryValue: { color: colors.secondaryText, fontSize: 13, fontVariant: ['tabular-nums'], fontWeight: '700' },
  positive: { color: colors.success },
  negative: { color: colors.danger },
  errorCard: { backgroundColor: colors.surface, borderLeftColor: colors.danger, borderLeftWidth: 3, borderRadius: 10, gap: 4, padding: 12 },
  errorText: { color: colors.secondaryText, fontSize: 12 },
  retry: { color: colors.accent, fontSize: 11, fontWeight: '800' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickAction: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, flex: 1, flexBasis: 138, flexDirection: 'row', gap: 9, minHeight: 58, paddingHorizontal: 10 },
  quickActionPrimary: { borderColor: colors.accent },
  quickIcon: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 8, height: 36, justifyContent: 'center', width: 36 },
  quickIconPrimary: { backgroundColor: colors.accentMuted },
  quickLabel: { color: colors.text, flex: 1, fontSize: 13, fontWeight: '700' },
  quickLabelPrimary: { color: colors.text },
  chevron: { color: colors.muted, fontSize: 24 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  textButton: { justifyContent: 'center', minHeight: 44, paddingHorizontal: 4 },
  textButtonLabel: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  recentCard: { gap: 8 },
  emptyRecent: { alignItems: 'center', gap: 6, padding: 28 },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  pressed: { opacity: 0.72 },
});
