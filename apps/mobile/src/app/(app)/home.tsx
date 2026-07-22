import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { fetchBankroll, fetchBets } from '@/bets/data';
import { readErrorMessage } from '@/bets/errors';
import { couponPresentation, formatMoney, type BetDto, type BetStatus } from '@/bets/models';
import { STATUS_PRESENTATION } from '@/bets/presentation';
import { summarizeBets } from '@/bets/summary';
import { resolveHomeAction } from '@/home/adaptive-action';
import { BroadcastButton, BroadcastDataValue, BroadcastStatus } from '@/ui/broadcast-noir-primitives';
import { MotionPressable } from '@/ui/motion';
import { semanticColors } from '@/ui/theme';

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

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const summary = useMemo(() => summarizeBets(bets), [bets]);
  const action = useMemo(
    () => resolveHomeAction({ draftAvailable: false, pendingCount: summary.openCount }),
    [summary.openCount],
  );
  const recent = bets.slice(0, 3);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.masthead}>
          <View style={styles.brandMark} />
          <View style={styles.brandCopy}>
            <Text style={styles.wordmark}>BETTRACKER</Text>
            <Text style={styles.mastheadMeta}>FOUNDER / HOME</Text>
          </View>
          <Pressable
            accessibilityLabel="Account and settings"
            accessibilityRole="button"
            onPress={() => router.push('/(app)/more')}
            style={({ pressed }) => [styles.account, pressed ? styles.pressed : null]}
          >
            <Text style={styles.accountText}>ACCOUNT</Text>
          </Pressable>
        </View>

        <View accessibilityLabel="Adaptive action" style={styles.actionStage}>
          <View style={styles.actionTopline}>
            <Text style={styles.kicker}>ADAPTIVE ACTION</Text>
            <Text style={styles.actionState}>{loading ? 'SYNCING' : error ? 'UNAVAILABLE' : 'READY'}</Text>
          </View>

          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={semanticColors.signal} size="large" />
              <Text style={styles.stateTitle}>SYNCING ACCOUNT</Text>
              <Text style={styles.stateBody}>No action is suggested until saved records are available.</Text>
            </View>
          ) : error ? (
            <View style={styles.centerState}>
              <BroadcastStatus label="Sync interrupted" status="review" />
              <Text accessibilityLiveRegion="polite" style={styles.stateTitle}>HOME DATA UNAVAILABLE</Text>
              <Text style={styles.stateBody}>Your records were not changed. Retry when the connection is available.</Text>
              <BroadcastButton label="Retry account sync" onPress={() => void load()} style={styles.actionButton} tone="secondary" />
            </View>
          ) : (
            <View style={styles.actionBody}>
              <View style={styles.actionGlyph}><Text style={styles.actionGlyphText}>{action.kind === 'review_pending' ? '!' : action.kind === 'continue_draft' ? 'D' : '+'}</Text></View>
              <Text style={styles.actionMeta}>{action.meta.toUpperCase()}</Text>
              <Text style={styles.actionTitle}>{action.label.toUpperCase()}</Text>
              <Text style={styles.actionDetail}>{action.detail}</Text>
              <BroadcastButton label={action.kind === 'review_pending' ? 'OPEN TRACKER' : action.kind === 'continue_draft' ? 'OPEN DRAFT' : 'OPEN SCANNER'} onPress={() => router.push(action.href)} style={styles.actionButton} />
              <Text style={styles.safetyNote}>NO AUTOMATIC SAVE OR SETTLEMENT</Text>
            </View>
          )}
        </View>

        <View accessibilityLabel="Portfolio summary" style={styles.metrics}>
          <Metric label="BANKROLL" value={loading || error || balance === null ? '—' : formatMoney(balance, currency)} />
          <Metric label="NET P&L" value={loading || error || summary.settledCount === 0 ? '—' : formatSignedMoney(summary.netPnl, currency)} />
          <Metric label="OPEN BETS" value={loading || error ? '—' : String(summary.openCount)} />
          <Metric label="SETTLED" value={loading || error ? '—' : String(summary.settledCount)} />
        </View>

        <View style={styles.recentSection}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.kicker}>RECENT RECORDS</Text>
              <Text style={styles.sectionTitle}>SINGLE & EXPRESS</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => router.push('/(app)/bets')} style={({ pressed }) => [styles.viewAll, pressed ? styles.pressed : null]}>
              <Text style={styles.viewAllText}>VIEW TRACKER</Text>
            </Pressable>
          </View>

          {!loading && !error && recent.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>NO TRACKED RECORDS</Text>
              <Text style={styles.emptyText}>The scanner prepares an editable draft. You decide whether to save it.</Text>
            </View>
          ) : null}

          {!loading && !error ? recent.map((bet) => (
            <HomeRecord
              bet={bet}
              currency={currency}
              key={bet.id}
              onPress={() => router.push({ pathname: '/(app)/bets/[id]', params: { id: bet.id } })}
            />
          )) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function HomeRecord({ bet, currency, onPress }: { bet: BetDto; currency: string; onPress: () => void }) {
  const coupon = couponPresentation(bet);
  const totalOdds = bet.totalOdds ?? (coupon.isExpress ? null : coupon.legs[0]?.odds ?? null);
  const status = statusTone(bet.status);
  const pnl = supportedPnl(bet, currency);

  return (
    <MotionPressable accessibilityHint="Opens bet details" accessibilityRole="button" glow="none" onPress={onPress} style={styles.record}>
      <View style={styles.recordTopline}>
        <Text style={styles.recordType}>{coupon.label.toUpperCase()}</Text>
        <BroadcastStatus label={STATUS_PRESENTATION[bet.status].label} status={status} />
      </View>

      <View style={styles.legs}>
        {coupon.legs.map((leg, index) => (
          <View key={leg.id} style={styles.leg}>
            <Text style={styles.legIndex}>{String(index + 1).padStart(2, '0')}</Text>
            <View style={styles.legCopy}>
              <Text style={styles.event}>{leg.eventName || 'Event not recorded'}</Text>
              <Text style={styles.selection}>{[leg.marketType, leg.selection].filter(Boolean).join(' · ') || 'Selection not recorded'}</Text>
            </View>
            <BroadcastDataValue>{leg.odds === null ? '—' : leg.odds.toFixed(2)}</BroadcastDataValue>
          </View>
        ))}
      </View>

      <View style={styles.recordMetrics}>
        <RecordMetric label="TOTAL ODDS" value={totalOdds === null ? '—' : totalOdds.toFixed(2)} />
        <RecordMetric label="STAKE" value={formatMoney(bet.stake, currency)} />
        <RecordMetric label={pnl.label} value={pnl.value} />
        <Text style={styles.arrow}>→</Text>
      </View>
    </MotionPressable>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text adjustsFontSizeToFit numberOfLines={1} style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function RecordMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.recordMetric}>
      <Text style={styles.recordMetricLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.recordMetricValue}>{value}</Text>
    </View>
  );
}

function statusTone(status: BetStatus): 'success' | 'review' | 'negative' | 'neutral' {
  if (status === 'won') return 'success';
  if (status === 'lost') return 'negative';
  if (status === 'pending') return 'review';
  return 'neutral';
}

function supportedPnl(bet: BetDto, currency: string): { label: string; value: string } {
  if ((bet.status === 'won' || bet.status === 'lost' || bet.status === 'void') && bet.pnl !== null) {
    return { label: 'P&L', value: formatSignedMoney(bet.pnl, currency) };
  }
  if (bet.status === 'pending' && bet.potentialPayout !== null) {
    return { label: 'PAYOUT', value: formatMoney(bet.potentialPayout, currency) };
  }
  return { label: 'P&L', value: '—' };
}

function formatSignedMoney(value: number, currency: string): string {
  const formatted = formatMoney(Math.abs(value), currency);
  return `${value >= 0 ? '+' : '-'}${formatted}`;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.night, flex: 1 },
  content: { backgroundColor: semanticColors.night, paddingBottom: 32, paddingHorizontal: 16 },
  masthead: { alignItems: 'center', borderBottomColor: semanticColors.borderStrong, borderBottomWidth: 1, flexDirection: 'row', minHeight: 64 },
  brandMark: { backgroundColor: semanticColors.signal, height: 10, marginRight: 10, width: 10 },
  brandCopy: { flex: 1 },
  wordmark: { color: semanticColors.textPrimary, fontSize: 18, fontWeight: '900' },
  mastheadMeta: { color: semanticColors.textQuiet, fontSize: 11, fontWeight: '700', marginTop: 2 },
  account: { alignItems: 'center', justifyContent: 'center', minHeight: 48, paddingHorizontal: 8 },
  accountText: { color: semanticColors.textMuted, fontSize: 11, fontWeight: '800' },
  pressed: { opacity: 0.76 },
  actionStage: { backgroundColor: semanticColors.field, borderColor: semanticColors.borderStrong, borderWidth: 1, marginTop: 18, minHeight: 390, padding: 20 },
  actionTopline: { flexDirection: 'row', justifyContent: 'space-between' },
  kicker: { color: semanticColors.textQuiet, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  actionState: { color: semanticColors.textMuted, fontSize: 11, fontWeight: '800' },
  actionBody: { flex: 1, justifyContent: 'center', paddingVertical: 26 },
  actionGlyph: { alignItems: 'center', backgroundColor: semanticColors.fieldRaised, borderColor: semanticColors.borderStrong, borderWidth: 1, height: 48, justifyContent: 'center', marginBottom: 22, width: 48 },
  actionGlyphText: { color: semanticColors.signal, fontSize: 22, fontWeight: '900' },
  actionMeta: { color: semanticColors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  actionTitle: { color: semanticColors.textPrimary, fontSize: 34, fontWeight: '900', lineHeight: 38, marginTop: 8 },
  actionDetail: { color: semanticColors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 16 },
  actionButton: { marginTop: 24, width: '100%' },
  safetyNote: { color: semanticColors.textQuiet, fontSize: 11, fontWeight: '700', letterSpacing: 0.7, marginTop: 12, textAlign: 'center' },
  centerState: { alignItems: 'flex-start', flex: 1, justifyContent: 'center', paddingVertical: 28 },
  stateTitle: { color: semanticColors.textPrimary, fontSize: 26, fontWeight: '900', lineHeight: 31, marginTop: 20 },
  stateBody: { color: semanticColors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 12 },
  metrics: { borderColor: semanticColors.borderStrong, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', marginTop: 18 },
  metric: { borderBottomColor: semanticColors.borderSubtle, borderBottomWidth: 1, borderRightColor: semanticColors.borderSubtle, borderRightWidth: 1, minHeight: 92, padding: 14, width: '50%' },
  metricLabel: { color: semanticColors.textQuiet, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  metricValue: { color: semanticColors.dataValue, fontSize: 22, fontVariant: ['tabular-nums'], fontWeight: '900', marginTop: 12 },
  recentSection: { marginTop: 28 },
  sectionHeader: { alignItems: 'center', borderBottomColor: semanticColors.borderStrong, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 72 },
  sectionTitle: { color: semanticColors.textPrimary, fontSize: 22, fontWeight: '900', marginTop: 4 },
  viewAll: { alignItems: 'center', borderColor: semanticColors.borderStrong, borderWidth: 1, justifyContent: 'center', minHeight: 48, paddingHorizontal: 12 },
  viewAllText: { color: semanticColors.textPrimary, fontSize: 11, fontWeight: '900' },
  empty: { minHeight: 180, paddingVertical: 44 },
  emptyTitle: { color: semanticColors.textPrimary, fontSize: 25, fontWeight: '900' },
  emptyText: { color: semanticColors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 10 },
  record: { borderBottomColor: semanticColors.borderSubtle, borderBottomWidth: 1, minHeight: 144, paddingVertical: 18 },
  recordTopline: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  recordType: { color: semanticColors.textMuted, flex: 1, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  legs: { gap: 12, marginTop: 16 },
  leg: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  legIndex: { color: semanticColors.textQuiet, fontSize: 11, fontVariant: ['tabular-nums'], marginTop: 1, width: 22 },
  legCopy: { flex: 1, minWidth: 0 },
  event: { color: semanticColors.textPrimary, fontSize: 13, fontWeight: '800', lineHeight: 18 },
  selection: { color: semanticColors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  recordMetrics: { alignItems: 'flex-end', flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 18 },
  recordMetric: { gap: 4, minWidth: 58 },
  recordMetricLabel: { color: semanticColors.textQuiet, fontSize: 11, fontWeight: '700' },
  recordMetricValue: { color: semanticColors.dataValue, fontSize: 12, fontVariant: ['tabular-nums'], fontWeight: '800' },
  arrow: { color: semanticColors.signal, fontSize: 22, marginLeft: 'auto' },
});
