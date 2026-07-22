import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { fetchBet, fetchCurrency } from '@/bets/data';
import { readErrorMessage } from '@/bets/errors';
import { betFinancialSummary, couponPresentation, type BetDto, formatMoney } from '@/bets/models';
import { STATUS_PRESENTATION } from '@/bets/presentation';
import { BroadcastButton, BroadcastPanel, BroadcastStatus } from '@/ui/broadcast-noir-primitives';
import { semanticColors, typography } from '@/ui/theme';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function BetDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { session } = useAuth();
  const userId = session?.user.id;
  const [bet, setBet] = useState<BetDto | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId || !id || !UUID_PATTERN.test(id)) {
      setError('This bet was not found.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextBet, nextCurrency] = await Promise.all([fetchBet(userId, id), fetchCurrency(userId)]);
      setBet(nextBet);
      setCurrency(nextCurrency);
    } catch (nextError) {
      setError(readErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, [id, userId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (loading) {
    return <DetailState label="Loading saved bet" loading />;
  }
  if (!bet || error) {
    return <DetailState actionLabel="Try again" label={error ?? 'This bet was not found.'} onAction={() => void load()} tone="negative" />;
  }

  const status = STATUS_PRESENTATION[bet.status];
  const coupon = couponPresentation(bet);
  const financialSummary = betFinancialSummary(bet, currency);
  const totalOdds = bet.totalOdds?.toFixed(2) ?? bet.legs[0]?.odds.toFixed(2) ?? '—';

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <BroadcastPanel style={styles.hero}>
          <Text style={styles.eyebrow}>SAVED RECORD · {coupon.isExpress ? 'EXPRESS' : 'SINGLE'}</Text>
          <Text maxFontSizeMultiplier={1.6} style={styles.title}>{coupon.label}</Text>
          <BroadcastStatus label={status.label} status={status.tone} />
          <View style={styles.summary}>
            <SummaryMetric label="STAKE" value={formatMoney(bet.stake, currency)} />
            <View style={styles.summaryDivider} />
            <SummaryMetric label="TOTAL ODDS" value={totalOdds} />
            <View style={styles.summaryDivider} />
            <SummaryMetric label={financialSummary.label.toUpperCase()} value={financialSummary.value} />
          </View>
        </BroadcastPanel>

        <BroadcastPanel accessibilityLabel={`${coupon.legs.length} ordered coupon legs`} style={styles.panel}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>{coupon.isExpress ? 'COUPON LEGS' : 'SELECTION'}</Text>
            <Text style={styles.sectionCount}>{coupon.legs.length}</Text>
          </View>
          {coupon.legs.map((leg, index) => (
            <View key={leg.id} style={[styles.leg, index > 0 && styles.legBorder]}>
              <Text style={styles.legIndex}>{String(index + 1).padStart(2, '0')}</Text>
              <View style={styles.legCopy}>
                <Text style={styles.legEvent}>{leg.eventName}</Text>
                <Text style={styles.legSelection}>
                  {[leg.marketType, leg.selection].filter(Boolean).join(' · ') || 'Selection not recorded'}
                </Text>
              </View>
              <Text style={styles.legOdds}>{leg.odds === null ? '—' : leg.odds.toFixed(2)}</Text>
            </View>
          ))}
          {coupon.isLegacy ? (
            <View style={styles.notice}>
              <BroadcastStatus label="Legacy · individual leg odds were not saved" status="neutral" />
            </View>
          ) : null}
        </BroadcastPanel>

        <BroadcastPanel style={styles.panel}>
          <Text style={styles.sectionTitle}>RECORD DETAILS</Text>
          {bet.bookmaker ? <DetailRow label="Bookmaker" value={bet.bookmaker} /> : null}
          <DetailRow label="Placed" value={new Date(bet.placedAt).toLocaleString()} />
          {bet.settledAt ? <DetailRow label="Settled" value={new Date(bet.settledAt).toLocaleString()} /> : null}
          <DetailRow label="Source" value={bet.source ?? '—'} />
        </BroadcastPanel>

        {bet.notes ? (
          <BroadcastPanel style={styles.panel}>
            <Text style={styles.sectionTitle}>NOTES</Text>
            <Text selectable style={styles.notes}>{bet.notes}</Text>
          </BroadcastPanel>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailState({
  actionLabel,
  label,
  loading = false,
  onAction,
  tone = 'neutral',
}: {
  actionLabel?: string;
  label: string;
  loading?: boolean;
  onAction?: () => void;
  tone?: 'negative' | 'neutral';
}) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.centered}>
        {loading ? <ActivityIndicator color={semanticColors.signal} size="large" /> : null}
        <BroadcastStatus label={tone === 'negative' ? 'Error' : 'Loading'} status={tone} />
        <Text accessibilityLiveRegion="polite" role={tone === 'negative' ? 'alert' : undefined} style={styles.stateText}>{label}</Text>
        {actionLabel && onAction ? <BroadcastButton label={actionLabel} onPress={onAction} /> : null}
      </View>
    </SafeAreaView>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryMetric}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text selectable style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.night, flex: 1 },
  content: { gap: 12, padding: 14, paddingBottom: 32 },
  centered: { alignItems: 'center', flex: 1, gap: 16, justifyContent: 'center', padding: 28 },
  stateText: { color: semanticColors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  hero: { gap: 14, padding: 18 },
  eyebrow: { color: semanticColors.textQuietRaised, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  title: { color: semanticColors.textPrimary, fontSize: 38, fontWeight: '900', letterSpacing: -1.8, lineHeight: 42 },
  summary: { alignItems: 'stretch', borderTopColor: semanticColors.borderStrong, borderTopWidth: 1, flexDirection: 'row', marginTop: 6, paddingTop: 16 },
  summaryMetric: { alignItems: 'center', flex: 1, gap: 5, justifyContent: 'center', minWidth: 0 },
  summaryLabel: { color: semanticColors.textQuietRaised, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  summaryValue: { color: semanticColors.dataValue, fontSize: 15, fontVariant: ['tabular-nums'], fontWeight: '900', maxWidth: '100%' },
  summaryDivider: { alignSelf: 'stretch', backgroundColor: semanticColors.borderSubtle, width: 1 },
  panel: { gap: 12, padding: 16 },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { color: semanticColors.textMuted, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  sectionCount: { color: semanticColors.dataValue, fontSize: 12, fontVariant: ['tabular-nums'], fontWeight: '800' },
  leg: { alignItems: 'flex-start', flexDirection: 'row', gap: 10, paddingVertical: 11 },
  legBorder: { borderTopColor: semanticColors.borderSubtle, borderTopWidth: 1 },
  legIndex: { color: semanticColors.textQuietRaised, fontSize: 11, fontVariant: ['tabular-nums'], fontWeight: '800', lineHeight: 19, width: 22 },
  legCopy: { flex: 1, gap: 5, minWidth: 0 },
  legEvent: { color: semanticColors.textPrimary, fontSize: typography.bodyMobile.fontSize, fontWeight: '800', lineHeight: 20 },
  legSelection: { color: semanticColors.textMuted, fontSize: 12, lineHeight: 18 },
  legOdds: { color: semanticColors.dataValue, fontSize: 13, fontVariant: ['tabular-nums'], fontWeight: '900', lineHeight: 19 },
  notice: { borderTopColor: semanticColors.borderSubtle, borderTopWidth: 1, paddingTop: 12 },
  row: { alignItems: 'flex-start', borderTopColor: semanticColors.borderSubtle, borderTopWidth: 1, flexDirection: 'row', gap: 16, justifyContent: 'space-between', paddingTop: 12 },
  rowLabel: { color: semanticColors.textMuted, fontSize: 13 },
  rowValue: { color: semanticColors.dataValue, flex: 1, fontSize: 13, fontWeight: '700', textAlign: 'right' },
  notes: { color: semanticColors.textMuted, fontSize: 14, lineHeight: 21 },
});
