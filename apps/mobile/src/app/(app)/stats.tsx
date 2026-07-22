import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { fetchBets, fetchCurrency } from '@/bets/data';
import { readErrorMessage } from '@/bets/errors';
import { formatMoney, type BetDto } from '@/bets/models';
import { calculateMobilePerformance } from '@/bets/performance';
import { BroadcastButton, BroadcastPanel, BroadcastStatus } from '@/ui/broadcast-noir-primitives';
import { semanticColors, typography } from '@/ui/theme';

const SPORT_LABELS: Record<string, string> = {
  basketball: 'Basketball',
  cs2: 'CS2',
  ice_hockey: 'Ice Hockey',
  mma: 'MMA',
  other: 'Other',
  soccer: 'Soccer',
  tennis: 'Tennis',
};

export default function StatsScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [bets, setBets] = useState<BetDto[]>([]);
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [nextBets, nextCurrency] = await Promise.all([fetchBets(userId), fetchCurrency(userId)]);
      setBets(nextBets);
      setCurrency(nextCurrency);
    } catch (nextError) {
      setError(readErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const metrics = useMemo(() => calculateMobilePerformance(bets), [bets]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <BroadcastPanel style={styles.hero}>
          <Text style={styles.eyebrow}>STATS · RECORDED OUTCOMES</Text>
          <Text maxFontSizeMultiplier={1.6} style={styles.title}>Performance</Text>
          <Text style={styles.subtitle}>Only persisted Tracker records enter these calculations.</Text>
        </BroadcastPanel>

        {loading ? (
          <BroadcastPanel style={styles.statePanel}>
            <ActivityIndicator color={semanticColors.signal} size="large" />
            <BroadcastStatus label="Loading recorded outcomes" status="neutral" />
          </BroadcastPanel>
        ) : error ? (
          <BroadcastPanel style={styles.statePanel}>
            <BroadcastStatus label="Could not load Stats" status="negative" />
            <Text accessibilityLiveRegion="polite" role="alert" style={styles.error}>{error}</Text>
            <BroadcastButton label="Try again" onPress={() => void load()} />
          </BroadcastPanel>
        ) : bets.length === 0 ? (
          <BroadcastPanel style={styles.statePanel}>
            <BroadcastStatus label="Empty · no recorded outcomes" status="neutral" />
            <Text style={styles.emptyText}>Stats appear after bets are saved in Tracker. No sample chart or estimated result is shown.</Text>
          </BroadcastPanel>
        ) : (
          <>
            <View style={styles.metricGrid}>
              <Metric label="NET P&L" value={metrics.settled ? formatSignedMoney(metrics.netPnl, currency) : '—'} />
              <Metric label="ROI" value={metrics.roi === null ? '—' : formatPercent(metrics.roi)} />
              <Metric label="WIN RATE" value={metrics.winRate === null ? '—' : `${metrics.winRate.toFixed(1)}%`} />
              <Metric label="AVG ODDS" value={metrics.avgOdds === null ? '—' : metrics.avgOdds.toFixed(2)} />
            </View>

            <BroadcastPanel style={styles.panel}>
              <Text style={styles.sectionTitle}>OUTCOMES</Text>
              <View style={styles.outcomeGrid}>
                <Outcome label="Won" status="success" value={metrics.won} />
                <Outcome label="Lost" status="negative" value={metrics.lost} />
                <Outcome label="Void" status="neutral" value={metrics.void} />
                <Outcome label="Pending" status="review" value={metrics.pending} />
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Pending stake</Text>
                <Text style={styles.detailValue}>{metrics.pending ? formatMoney(metrics.pendingStake, currency) : '—'}</Text>
              </View>
              {metrics.unsupported ? (
                <View style={styles.notice}>
                  <BroadcastStatus label={`${metrics.unsupported} unsupported or unknown status${metrics.unsupported === 1 ? '' : 'es'} excluded`} status="review" />
                </View>
              ) : null}
            </BroadcastPanel>

            <BroadcastPanel style={styles.panel}>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>BY SPORT</Text>
                <Text style={styles.sectionMeta}>EXACT VALUES</Text>
              </View>
              {metrics.bySport.map((row) => (
                <View accessibilityLabel={`${SPORT_LABELS[row.label] ?? row.label}: ${row.total} bets, ${row.won} won, ${row.lost} lost`} key={row.label} style={styles.sportRow}>
                  <View style={styles.sportCopy}>
                    <Text style={styles.sportName}>{SPORT_LABELS[row.label] ?? row.label}</Text>
                    <Text style={styles.sportMeta}>{row.total} bets · {row.won}W / {row.lost}L / {row.void}V · {row.pending} open</Text>
                  </View>
                  <View style={styles.sportNumbers}>
                    <Text style={styles.sportValue}>{row.roi === null ? '—' : formatPercent(row.roi)}</Text>
                    <Text style={styles.sportMeta}>{row.winRate === null ? '—' : `${row.winRate.toFixed(0)}% WR`}</Text>
                  </View>
                </View>
              ))}
            </BroadcastPanel>

            <BroadcastPanel style={styles.noticePanel}>
              <BroadcastStatus label="Recorded data only" status="neutral" />
              <Text style={styles.noticeText}>Void is excluded from ROI and win rate. Unsupported statuses do not enter financial metrics.</Text>
            </BroadcastPanel>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <BroadcastPanel style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text adjustsFontSizeToFit numberOfLines={1} style={styles.metricValue}>{value}</Text>
    </BroadcastPanel>
  );
}

function Outcome({ label, status, value }: { label: string; status: 'negative' | 'neutral' | 'review' | 'success'; value: number }) {
  return (
    <View style={styles.outcome}>
      <BroadcastStatus label={label} status={status} />
      <Text style={styles.outcomeValue}>{value}</Text>
    </View>
  );
}

function formatPercent(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function formatSignedMoney(value: number, currency: string) {
  const formatted = formatMoney(value, currency);
  return value > 0 ? `+${formatted}` : formatted;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.night, flex: 1 },
  content: { gap: 12, padding: 14, paddingBottom: 32 },
  hero: { padding: 18 },
  eyebrow: { color: semanticColors.textQuietRaised, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  title: { color: semanticColors.textPrimary, fontSize: 43, fontWeight: '900', letterSpacing: -2.1, lineHeight: 48, marginTop: 8 },
  subtitle: { color: semanticColors.textMuted, fontSize: typography.bodyMobile.fontSize, lineHeight: typography.bodyMobile.lineHeight, marginTop: 8 },
  statePanel: { alignItems: 'center', gap: 16, justifyContent: 'center', minHeight: 260, padding: 24 },
  error: { color: semanticColors.negative, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  emptyText: { color: semanticColors.textMuted, fontSize: 14, lineHeight: 21, maxWidth: 300, textAlign: 'center' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: { flexBasis: 145, flexGrow: 1, gap: 8, minHeight: 104, padding: 15 },
  metricLabel: { color: semanticColors.textQuietRaised, fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  metricValue: { color: semanticColors.dataValue, fontSize: 25, fontVariant: ['tabular-nums'], fontWeight: '900', maxWidth: '100%' },
  panel: { gap: 14, padding: 16 },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { color: semanticColors.textPrimary, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  sectionMeta: { color: semanticColors.textQuietRaised, fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  outcomeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  outcome: { alignItems: 'flex-start', borderColor: semanticColors.borderSubtle, borderRadius: 8, borderWidth: 1, flexBasis: 125, flexGrow: 1, gap: 12, padding: 12 },
  outcomeValue: { color: semanticColors.dataValue, fontSize: 23, fontVariant: ['tabular-nums'], fontWeight: '900' },
  detailRow: { alignItems: 'center', borderTopColor: semanticColors.borderSubtle, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingTop: 13 },
  detailLabel: { color: semanticColors.textMuted, fontSize: 13 },
  detailValue: { color: semanticColors.dataValue, fontSize: 14, fontVariant: ['tabular-nums'], fontWeight: '900' },
  notice: { borderTopColor: semanticColors.borderSubtle, borderTopWidth: 1, paddingTop: 13 },
  sportRow: { alignItems: 'center', borderTopColor: semanticColors.borderSubtle, borderTopWidth: 1, flexDirection: 'row', gap: 12, paddingTop: 13 },
  sportCopy: { flex: 1, gap: 4, minWidth: 0 },
  sportName: { color: semanticColors.textPrimary, fontSize: 14, fontWeight: '800' },
  sportMeta: { color: semanticColors.textMuted, fontSize: 11, lineHeight: 17 },
  sportNumbers: { alignItems: 'flex-end', gap: 4 },
  sportValue: { color: semanticColors.dataValue, fontSize: 14, fontVariant: ['tabular-nums'], fontWeight: '900' },
  noticePanel: { gap: 10, padding: 16 },
  noticeText: { color: semanticColors.textMuted, fontSize: 12, lineHeight: 18 },
});
