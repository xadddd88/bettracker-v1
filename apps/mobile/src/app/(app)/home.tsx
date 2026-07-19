import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { fetchBankroll, fetchBets } from '@/bets/data';
import { readErrorMessage } from '@/bets/errors';
import { betTitle, formatMoney, type BetDto } from '@/bets/models';
import { STATUS_PRESENTATION } from '@/bets/presentation';
import { summarizeBets } from '@/bets/summary';
import { colors } from '@/ui/theme';

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
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.brand}>XADDD</Text>
            <Text style={styles.title}>Dashboard</Text>
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
            <RecentBet
              bet={bet}
              currency={currency}
              key={bet.id}
              last={index === recent.length - 1}
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
        <SymbolView fallback={<Text>+</Text>} name={icon} size={22} tintColor={primary ? colors.background : colors.accent} />
      </View>
      <Text style={[styles.quickLabel, primary && styles.quickLabelPrimary]}>{label}</Text>
      <Text style={[styles.chevron, primary && styles.quickLabelPrimary]}>›</Text>
    </Pressable>
  );
}

function RecentBet({ bet, currency, last, onPress }: {
  bet: BetDto;
  currency: string;
  last: boolean;
  onPress: () => void;
}) {
  const status = STATUS_PRESENTATION[bet.status];
  const odds = bet.totalOdds ?? bet.legs[0]?.odds ?? null;
  return (
    <Pressable
      accessibilityHint="Opens bet details"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.recentRow, !last && styles.recentDivider, pressed && styles.recentPressed]}
    >
      <View style={styles.recentCopy}>
        <Text numberOfLines={1} style={styles.recentTitle}>{betTitle(bet)}</Text>
        <Text style={styles.recentMeta}>{formatMoney(bet.stake, currency)} · {odds?.toFixed(2) ?? '—'}</Text>
      </View>
      <View style={[styles.statusDot, { backgroundColor: status.color }]} />
      <Text style={[styles.statusLabel, { color: status.color }]}>{status.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { gap: 18, paddingBottom: 28, paddingHorizontal: 16, paddingTop: 8 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  headerCopy: { gap: 2 },
  brand: { color: colors.accent, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 27, fontWeight: '900' },
  iconButton: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 14, height: 46, justifyContent: 'center', width: 46 },
  iconFallback: { color: colors.secondaryText, fontSize: 10, fontWeight: '900' },
  loadingRow: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 18, flexDirection: 'row', gap: 12, minHeight: 108, padding: 18 },
  bankrollCard: { backgroundColor: colors.surface, borderRadius: 20, gap: 18, padding: 18 },
  balanceRow: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  metricLabel: { color: colors.placeholder, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  balance: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -0.8, marginTop: 4 },
  openBadge: { alignItems: 'center', backgroundColor: colors.accentMuted, borderRadius: 12, minWidth: 54, paddingHorizontal: 10, paddingVertical: 7 },
  openBadgeValue: { color: colors.accent, fontSize: 17, fontWeight: '900' },
  openBadgeLabel: { color: colors.accent, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  summaryRow: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', paddingTop: 14 },
  summaryMetric: { flex: 1, gap: 4 },
  summaryValue: { color: colors.secondaryText, fontSize: 14, fontWeight: '800' },
  positive: { color: colors.success },
  negative: { color: colors.danger },
  errorCard: { backgroundColor: colors.surface, borderLeftColor: colors.danger, borderLeftWidth: 3, borderRadius: 10, gap: 4, padding: 12 },
  errorText: { color: colors.secondaryText, fontSize: 12 },
  retry: { color: colors.accent, fontSize: 11, fontWeight: '800' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickAction: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, flex: 1, flexBasis: 138, flexDirection: 'row', gap: 10, minHeight: 66, paddingHorizontal: 12 },
  quickActionPrimary: { backgroundColor: colors.accent },
  quickIcon: { alignItems: 'center', backgroundColor: colors.accentMuted, borderRadius: 10, height: 40, justifyContent: 'center', width: 40 },
  quickIconPrimary: { backgroundColor: 'rgba(7,17,31,0.14)' },
  quickLabel: { color: colors.text, flex: 1, fontSize: 14, fontWeight: '800' },
  quickLabelPrimary: { color: colors.background },
  chevron: { color: colors.muted, fontSize: 24 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  textButton: { justifyContent: 'center', minHeight: 44, paddingHorizontal: 4 },
  textButtonLabel: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  recentCard: { backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden' },
  recentRow: { alignItems: 'center', flexDirection: 'row', minHeight: 68, paddingHorizontal: 14 },
  recentDivider: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  recentPressed: { backgroundColor: colors.surfaceRaised },
  recentCopy: { flex: 1, gap: 4, minWidth: 0 },
  recentTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  recentMeta: { color: colors.muted, fontSize: 11 },
  statusDot: { borderRadius: 99, height: 7, marginRight: 6, width: 7 },
  statusLabel: { fontSize: 11, fontWeight: '800' },
  emptyRecent: { alignItems: 'center', gap: 6, padding: 28 },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  pressed: { opacity: 0.72 },
});
