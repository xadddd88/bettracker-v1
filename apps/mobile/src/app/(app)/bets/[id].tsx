import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { fetchBet, fetchCurrency } from '@/bets/data';
import { readErrorMessage } from '@/bets/errors';
import { betFinancialSummary, couponPresentation, type BetDto, formatMoney } from '@/bets/models';
import { STATUS_PRESENTATION } from '@/bets/presentation';
import { colors } from '@/ui/theme';
import { TimeWarpBackdrop, WarpRail } from '@/ui/time-warp';

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
      const [nextBet, nextCurrency] = await Promise.all([
        fetchBet(userId, id),
        fetchCurrency(userId),
      ]);
      setBet(nextBet);
      setCurrency(nextCurrency);
    } catch (nextError) {
      setError(readErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, [id, userId]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!bet || error) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text accessibilityLiveRegion="polite" role="alert" style={styles.error}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.retryButton}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const status = STATUS_PRESENTATION[bet.status];
  const firstLeg = bet.legs[0];
  const coupon = couponPresentation(bet);
  const financialSummary = betFinancialSummary(bet, currency);
  const totalOdds = bet.totalOdds?.toFixed(2) ?? firstLeg?.odds.toFixed(2) ?? '—';

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.safeArea}>
      <TimeWarpBackdrop />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headingRow}>
          <View style={styles.headingCopy}>
            <WarpRail />
            <Text style={styles.eyebrow}>TRACKED BET</Text>
            <Text style={styles.title}>{coupon.label}</Text>
          </View>
          <View style={[styles.badge, { borderColor: status.color }]}>
            <Text style={[styles.badgeText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>

        <View style={[styles.card, styles.summaryCard]}>
          <SummaryMetric label="Stake" value={formatMoney(bet.stake, currency)} />
          <View style={styles.summaryDivider} />
          <SummaryMetric label="Total odds" value={totalOdds} />
          <View style={styles.summaryDivider} />
          <SummaryMetric
            label={financialSummary.label}
            value={financialSummary.value}
          />
        </View>

        <View style={[styles.card, styles.couponCard]}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>{coupon.isExpress ? 'Coupon legs' : 'Selection'}</Text>
            <Text style={styles.sectionCount}>{coupon.legs.length}</Text>
          </View>
          {coupon.legs.map((leg, index) => (
            <View key={leg.id} style={[styles.leg, index > 0 && styles.legBorder]}>
              <View style={styles.legIndexBadge}>
                <Text style={styles.legIndex}>{leg.index}</Text>
              </View>
              <View style={styles.legCopy}>
                <Text style={styles.legEvent}>{leg.eventName}</Text>
                {leg.selection ? <Text style={styles.legSelection}>{leg.selection}</Text> : null}
                {leg.marketType ? <Text style={styles.legMeta}>{leg.marketType}</Text> : null}
              </View>
              {leg.odds !== null ? <Text style={styles.legOdds}>{leg.odds.toFixed(2)}</Text> : null}
            </View>
          ))}
          {coupon.isLegacy ? (
            <View style={styles.legacyNotice}>
              <Text style={styles.legacyText}>
                Legacy record · individual leg odds were not saved
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          {bet.bookmaker ? <DetailRow label="Bookmaker" value={bet.bookmaker} /> : null}
          <DetailRow label="Placed" value={new Date(bet.placedAt).toLocaleString()} />
          {bet.settledAt ? <DetailRow label="Settled" value={new Date(bet.settledAt).toLocaleString()} /> : null}
        </View>

        {bet.notes ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Notes</Text>
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

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { gap: 0, paddingBottom: 28 },
  centered: { alignItems: 'center', flex: 1, gap: 14, justifyContent: 'center', padding: 28 },
  error: { color: colors.danger, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  retryButton: { backgroundColor: colors.accent, justifyContent: 'center', minHeight: 48, paddingHorizontal: 20 },
  retryText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  headingRow: { alignItems: 'flex-end', borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', gap: 12, minHeight: 190, padding: 14 },
  headingCopy: { flex: 1, gap: 8, minWidth: 0 },
  eyebrow: { color: colors.muted, fontSize: 8, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: colors.text, fontSize: 39, fontWeight: '900', letterSpacing: -1.8, lineHeight: 40 },
  badge: { borderColor: colors.border, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 7 },
  badgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  card: { backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, gap: 13, padding: 14 },
  summaryCard: { alignItems: 'stretch', flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 18 },
  summaryMetric: { alignItems: 'center', flex: 1, gap: 5, justifyContent: 'center', minWidth: 0 },
  summaryLabel: { color: colors.muted, fontSize: 8, fontWeight: '700', letterSpacing: 0.7 },
  summaryValue: { color: colors.text, fontSize: 17, fontVariant: ['tabular-nums'], fontWeight: '900', maxWidth: '100%' },
  summaryDivider: { alignSelf: 'stretch', backgroundColor: colors.border, width: 1 },
  couponCard: { gap: 0, paddingBottom: 12 },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  sectionTitle: { color: colors.secondaryText, fontSize: 9, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  sectionCount: { color: colors.placeholder, fontSize: 12, fontWeight: '700' },
  leg: { alignItems: 'flex-start', flexDirection: 'row', gap: 11, paddingVertical: 11 },
  legBorder: { borderTopColor: colors.border, borderTopWidth: 1 },
  legIndexBadge: { alignItems: 'center', backgroundColor: colors.accentMuted, borderColor: colors.border, borderWidth: 1, height: 28, justifyContent: 'center', width: 28 },
  legIndex: { color: colors.text, fontSize: 10, fontWeight: '900' },
  legCopy: { flex: 1, gap: 5, minWidth: 0 },
  legEvent: { color: colors.text, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  legSelection: { color: colors.text, fontSize: 13, fontWeight: '900', lineHeight: 18 },
  legMeta: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  legOdds: { borderBottomColor: colors.border, borderBottomWidth: 2, color: colors.text, fontSize: 17, fontWeight: '900', minWidth: 46, paddingHorizontal: 7, paddingVertical: 5, textAlign: 'center' },
  legacyNotice: { backgroundColor: colors.surfaceMuted, marginTop: 5, paddingHorizontal: 10, paddingVertical: 8 },
  legacyText: { color: colors.placeholder, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  row: { alignItems: 'flex-start', flexDirection: 'row', gap: 16, justifyContent: 'space-between' },
  rowLabel: { color: colors.muted, fontSize: 13 },
  rowValue: { color: colors.text, flex: 1, fontSize: 14, fontWeight: '600', textAlign: 'right' },
  notes: { color: colors.secondaryText, fontSize: 14, lineHeight: 21 },
});
