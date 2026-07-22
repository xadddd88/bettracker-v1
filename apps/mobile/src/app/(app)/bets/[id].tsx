import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { fetchBet, fetchCurrency } from '@/bets/data';
import { readErrorMessage } from '@/bets/errors';
import { betFinancialSummary, couponPresentation, type BetDto, type BetStatus, formatMoney } from '@/bets/models';
import { STATUS_PRESENTATION } from '@/bets/presentation';
import { BroadcastButton, BroadcastStatus } from '@/ui/broadcast-noir-primitives';
import { semanticColors } from '@/ui/theme';

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
    return <SafeAreaView style={styles.safeArea}><View style={styles.centered}><ActivityIndicator color={semanticColors.signal} size="large" /></View></SafeAreaView>;
  }

  if (!bet || error) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text accessibilityLiveRegion="polite" role="alert" style={styles.error}>{error}</Text>
          <BroadcastButton label="TRY AGAIN" onPress={() => void load()} tone="secondary" />
        </View>
      </SafeAreaView>
    );
  }

  const status = STATUS_PRESENTATION[bet.status];
  const firstLeg = bet.legs[0];
  const coupon = couponPresentation(bet);
  const financialSummary = betFinancialSummary(bet, currency);
  const totalOdds = bet.totalOdds?.toFixed(2) ?? (coupon.isExpress ? '—' : firstLeg?.odds.toFixed(2) ?? '—');

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headingRow}>
          <View style={styles.headingCopy}>
            <Text style={styles.eyebrow}>TRACKED RECORD / {coupon.isExpress ? 'EXPRESS' : 'SINGLE'}</Text>
            <Text style={styles.title}>{coupon.label.toUpperCase()}</Text>
          </View>
          <BroadcastStatus label={status.label} status={statusTone(bet.status)} />
        </View>

        <View style={styles.summaryCard}>
          <SummaryMetric label="STAKE" value={formatMoney(bet.stake, currency)} />
          <View style={styles.summaryDivider} />
          <SummaryMetric label="TOTAL ODDS" value={totalOdds} />
          <View style={styles.summaryDivider} />
          <SummaryMetric label={financialSummary.label.toUpperCase()} value={financialSummary.value} />
        </View>

        <View style={styles.couponSection}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>{coupon.isExpress ? 'ORDERED COUPON LEGS' : 'SELECTION'}</Text>
            <Text style={styles.sectionCount}>{String(coupon.legs.length).padStart(2, '0')}</Text>
          </View>
          {coupon.legs.map((leg, index) => (
            <View key={leg.id} style={[styles.leg, index > 0 && styles.legBorder]}>
              <Text style={styles.legIndex}>{String(leg.index).padStart(2, '0')}</Text>
              <View style={styles.legCopy}>
                <Text style={styles.legEvent}>{leg.eventName || 'Event not recorded'}</Text>
                {leg.selection ? <Text style={styles.legSelection}>{leg.selection}</Text> : null}
                {leg.marketType ? <Text style={styles.legMeta}>{leg.marketType}</Text> : null}
              </View>
              <Text style={styles.legOdds}>{leg.odds === null ? '—' : leg.odds.toFixed(2)}</Text>
            </View>
          ))}
          {coupon.isLegacy ? (
            <View style={styles.legacyNotice}>
              <Text style={styles.legacyText}>LEGACY EXPRESS / INDIVIDUAL LEG ODDS UNRESOLVED</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.detailsSection}>
          {bet.bookmaker ? <DetailRow label="BOOKMAKER" value={bet.bookmaker} /> : null}
          <DetailRow label="PLACED" value={new Date(bet.placedAt).toLocaleString()} />
          {bet.settledAt ? <DetailRow label="SETTLED" value={new Date(bet.settledAt).toLocaleString()} /> : null}
        </View>

        {bet.notes ? (
          <View style={styles.notesSection}>
            <Text style={styles.sectionTitle}>NOTES</Text>
            <Text style={styles.notes}>{bet.notes}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryMetric}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text adjustsFontSizeToFit numberOfLines={1} style={styles.summaryValue}>{value}</Text>
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

function statusTone(status: BetStatus): 'negative' | 'neutral' | 'review' | 'success' {
  if (status === 'won') return 'success';
  if (status === 'lost') return 'negative';
  if (status === 'pending') return 'review';
  return 'neutral';
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.night, flex: 1 },
  content: { paddingBottom: 28, paddingHorizontal: 16 },
  centered: { alignItems: 'center', flex: 1, gap: 16, justifyContent: 'center', padding: 28 },
  error: { color: semanticColors.negative, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  headingRow: { alignItems: 'flex-start', borderBottomColor: semanticColors.borderStrong, borderBottomWidth: 1, flexDirection: 'row', gap: 12, minHeight: 154, paddingVertical: 24 },
  headingCopy: { flex: 1, gap: 10, minWidth: 0 },
  eyebrow: { color: semanticColors.textQuiet, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  title: { color: semanticColors.textPrimary, fontSize: 35, fontWeight: '900', lineHeight: 38 },
  summaryCard: { alignItems: 'stretch', borderBottomColor: semanticColors.borderStrong, borderBottomWidth: 1, flexDirection: 'row', paddingVertical: 18 },
  summaryMetric: { alignItems: 'center', flex: 1, gap: 7, justifyContent: 'center', minWidth: 0 },
  summaryLabel: { color: semanticColors.textQuiet, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  summaryValue: { color: semanticColors.dataValue, fontSize: 16, fontVariant: ['tabular-nums'], fontWeight: '900', maxWidth: '100%' },
  summaryDivider: { alignSelf: 'stretch', backgroundColor: semanticColors.borderSubtle, width: 1 },
  couponSection: { borderBottomColor: semanticColors.borderStrong, borderBottomWidth: 1, paddingBottom: 12 },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 58 },
  sectionTitle: { color: semanticColors.textMuted, fontSize: 11, fontWeight: '900', letterSpacing: 0.9 },
  sectionCount: { color: semanticColors.dataValue, fontSize: 12, fontWeight: '800' },
  leg: { alignItems: 'flex-start', flexDirection: 'row', gap: 11, paddingVertical: 13 },
  legBorder: { borderTopColor: semanticColors.borderSubtle, borderTopWidth: 1 },
  legIndex: { color: semanticColors.textQuiet, fontSize: 11, fontVariant: ['tabular-nums'], marginTop: 2, width: 23 },
  legCopy: { flex: 1, gap: 4, minWidth: 0 },
  legEvent: { color: semanticColors.textPrimary, fontSize: 14, fontWeight: '800', lineHeight: 20 },
  legSelection: { color: semanticColors.textPrimary, fontSize: 13, fontWeight: '900', lineHeight: 18 },
  legMeta: { color: semanticColors.textMuted, fontSize: 12, lineHeight: 17 },
  legOdds: { color: semanticColors.dataValue, fontSize: 15, fontVariant: ['tabular-nums'], fontWeight: '900', minWidth: 42, textAlign: 'right' },
  legacyNotice: { borderColor: semanticColors.review, borderWidth: 1, marginTop: 8, padding: 10 },
  legacyText: { color: semanticColors.review, fontSize: 11, fontWeight: '800', lineHeight: 16, textAlign: 'center' },
  detailsSection: { borderBottomColor: semanticColors.borderStrong, borderBottomWidth: 1, gap: 14, paddingVertical: 18 },
  notesSection: { borderBottomColor: semanticColors.borderStrong, borderBottomWidth: 1, paddingVertical: 18 },
  row: { alignItems: 'flex-start', flexDirection: 'row', gap: 16, justifyContent: 'space-between' },
  rowLabel: { color: semanticColors.textQuiet, fontSize: 11, fontWeight: '800' },
  rowValue: { color: semanticColors.textPrimary, flex: 1, fontSize: 13, fontWeight: '600', textAlign: 'right' },
  notes: { color: semanticColors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 12 },
});
