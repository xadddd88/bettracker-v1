import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { fetchBet, fetchCurrency } from '@/bets/data';
import { readErrorMessage } from '@/bets/errors';
import { betTitle, type BetDto, formatMoney } from '@/bets/models';
import { STATUS_PRESENTATION } from '@/bets/presentation';
import { colors } from '@/ui/theme';

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
  const express = bet.legs.length > 1;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headingRow}>
          <Text style={styles.title}>{betTitle(bet)}</Text>
          <View style={[styles.badge, { borderColor: status.color }]}>
            <Text style={[styles.badgeText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>

        {!express && firstLeg ? (
          <View style={styles.card}>
            <DetailRow label="Event" value={firstLeg.eventName} />
            {firstLeg.marketType ? <DetailRow label="Market" value={firstLeg.marketType} /> : null}
            {firstLeg.selection ? <DetailRow label="Selection" value={firstLeg.selection} /> : null}
          </View>
        ) : null}

        <View style={styles.card}>
          <DetailRow label="Stake" value={formatMoney(bet.stake, currency)} />
          <DetailRow label="Odds" value={bet.totalOdds?.toFixed(2) ?? firstLeg?.odds.toFixed(2) ?? '—'} />
          {bet.potentialPayout !== null ? (
            <DetailRow label="Potential payout" value={formatMoney(bet.potentialPayout, currency)} />
          ) : null}
          {bet.pnl !== null ? <DetailRow label="P&L" value={formatMoney(bet.pnl, currency)} /> : null}
          {bet.bookmaker ? <DetailRow label="Bookmaker" value={bet.bookmaker} /> : null}
          <DetailRow label="Placed" value={new Date(bet.placedAt).toLocaleString()} />
        </View>

        {express ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Ordered legs</Text>
            {bet.legs.map((leg, index) => (
              <View key={leg.id} style={[styles.leg, index > 0 && styles.legBorder]}>
                <Text style={styles.legIndex}>{leg.legIndex ?? index + 1}</Text>
                <View style={styles.legCopy}>
                  <Text style={styles.legEvent}>{leg.eventName}</Text>
                  {leg.marketType ? <Text style={styles.legMeta}>{leg.marketType}</Text> : null}
                  {leg.selection ? <Text style={styles.legMeta}>Selection: {leg.selection}</Text> : null}
                </View>
                <Text style={styles.legOdds}>@{leg.odds.toFixed(2)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {bet.notes ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.notes}>{bet.notes}</Text>
          </View>
        ) : null}

        <Text style={styles.readOnly}>Read-only mobile view</Text>
      </ScrollView>
    </SafeAreaView>
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
  content: { gap: 14, padding: 16, paddingBottom: 32 },
  centered: { alignItems: 'center', flex: 1, gap: 14, justifyContent: 'center', padding: 28 },
  error: { color: colors.danger, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  retryButton: { backgroundColor: colors.accent, borderRadius: 10, justifyContent: 'center', minHeight: 44, paddingHorizontal: 20 },
  retryText: { color: colors.background, fontWeight: '800' },
  headingRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  title: { color: colors.text, flex: 1, fontSize: 23, fontWeight: '800', lineHeight: 30, minWidth: 0 },
  badge: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, gap: 13, padding: 16 },
  row: { alignItems: 'flex-start', flexDirection: 'row', gap: 16, justifyContent: 'space-between' },
  rowLabel: { color: colors.muted, fontSize: 13 },
  rowValue: { color: colors.text, flex: 1, fontSize: 14, fontWeight: '600', textAlign: 'right' },
  sectionTitle: { color: colors.secondaryText, fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  leg: { alignItems: 'flex-start', flexDirection: 'row', gap: 10, paddingVertical: 4 },
  legBorder: { borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 13 },
  legIndex: { color: colors.placeholder, fontSize: 12, width: 20 },
  legCopy: { flex: 1, gap: 3, minWidth: 0 },
  legEvent: { color: colors.text, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  legMeta: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  legOdds: { color: colors.secondaryText, fontSize: 13, fontWeight: '700' },
  notes: { color: colors.secondaryText, fontSize: 14, lineHeight: 21 },
  readOnly: { color: colors.placeholder, fontSize: 11, textAlign: 'center' },
});
