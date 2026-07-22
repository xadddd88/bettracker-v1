import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { fetchBets, fetchCurrency } from '@/bets/data';
import { readErrorMessage } from '@/bets/errors';
import { formatMoney, type BetDto } from '@/bets/models';
import { summarizeBets } from '@/bets/summary';
import { BetTicket } from '@/ui/bet-ticket';
import { BroadcastButton, BroadcastPanel, BroadcastStatus } from '@/ui/broadcast-noir-primitives';
import { semanticColors, typography } from '@/ui/theme';

export default function BetsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [bets, setBets] = useState<BetDto[]>([]);
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (!userId) return;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [nextBets, nextCurrency] = await Promise.all([fetchBets(userId), fetchCurrency(userId)]);
      setBets(nextBets);
      setCurrency(nextCurrency);
    } catch (nextError) {
      setError(readErrorMessage(nextError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const summary = summarizeBets(bets);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <FlatList
        contentContainerStyle={[styles.list, bets.length === 0 && styles.grow]}
        data={loading ? [] : bets}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={(
          <View style={styles.headerStack}>
            <BroadcastPanel style={styles.header}>
              <Text style={styles.eyebrow}>TRACKER · PERSISTED RECORDS</Text>
              <Text maxFontSizeMultiplier={1.6} style={styles.title}>Bets</Text>
              <Text style={styles.subtitle}>
                {bets.length} saved · {summary.openCount} open · {summary.settledCount} settled
              </Text>
              <View style={styles.actions}>
                <BroadcastButton
                  label="Scan coupon"
                  onPress={() => router.push('/(app)/ai')}
                  style={styles.action}
                  tone="secondary"
                />
                <BroadcastButton
                  label="Add bet"
                  onPress={() => router.push('/(app)/bets/new')}
                  style={styles.action}
                />
              </View>
            </BroadcastPanel>

            {bets.length > 0 ? (
              <BroadcastPanel accessibilityLabel="Tracker summary" style={styles.summary}>
                <Metric label="OPEN" value={String(summary.openCount)} />
                <View style={styles.summaryDivider} />
                <Metric label="SETTLED" value={String(summary.settledCount)} />
                <View style={styles.summaryDivider} />
                <Metric label="NET P&L" value={summary.settledCount ? formatMoney(summary.netPnl, currency) : '—'} />
              </BroadcastPanel>
            ) : null}

            {error && bets.length > 0 ? (
              <View accessibilityLiveRegion="polite" role="alert" style={styles.inlineError}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
          </View>
        )}
        ListEmptyComponent={loading ? (
          <StatePanel label="Loading saved bets" loading />
        ) : error ? (
          <StatePanel actionLabel="Try again" label={error} onAction={() => void load()} tone="negative" />
        ) : (
          <StatePanel
            actionLabel="Add manually"
            label="No saved bets. Nothing appears here until you review a draft and press Save."
            onAction={() => router.push('/(app)/bets/new')}
          />
        )}
        refreshControl={(
          <RefreshControl
            colors={[semanticColors.signal]}
            onRefresh={() => void load(true)}
            refreshing={refreshing}
            tintColor={semanticColors.signal}
          />
        )}
        renderItem={({ item }) => (
          <BetTicket
            bet={item}
            currency={currency}
            onPress={() => router.push({ pathname: '/(app)/bets/[id]', params: { id: item.id } })}
          />
        )}
      />
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function StatePanel({
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
    <BroadcastPanel style={styles.statePanel}>
      {loading ? <ActivityIndicator color={semanticColors.signal} size="large" /> : null}
      <BroadcastStatus label={tone === 'negative' ? 'Error' : loading ? 'Loading' : 'Empty'} status={tone} />
      <Text accessibilityLiveRegion="polite" role={tone === 'negative' ? 'alert' : undefined} style={styles.stateText}>{label}</Text>
      {actionLabel && onAction ? <BroadcastButton label={actionLabel} onPress={onAction} /> : null}
    </BroadcastPanel>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.night, flex: 1 },
  list: { gap: 0, paddingBottom: 32, paddingHorizontal: 14 },
  grow: { flexGrow: 1 },
  headerStack: { gap: 12, paddingBottom: 4 },
  header: { gap: 0, marginTop: 4, padding: 18 },
  eyebrow: { color: semanticColors.textQuietRaised, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  title: { color: semanticColors.textPrimary, fontSize: 48, fontWeight: '900', letterSpacing: -2.4, lineHeight: 52, marginTop: 10 },
  subtitle: { color: semanticColors.textMuted, fontSize: typography.bodyMobile.fontSize, lineHeight: typography.bodyMobile.lineHeight, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 18 },
  action: { flex: 1 },
  summary: { alignItems: 'stretch', flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 15 },
  metric: { alignItems: 'center', flex: 1, gap: 5, justifyContent: 'center', minWidth: 0 },
  metricLabel: { color: semanticColors.textQuietRaised, fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  metricValue: { color: semanticColors.dataValue, fontSize: 15, fontVariant: ['tabular-nums'], fontWeight: '900', maxWidth: '100%' },
  summaryDivider: { alignSelf: 'stretch', backgroundColor: semanticColors.borderSubtle, width: 1 },
  inlineError: { borderColor: semanticColors.negative, borderRadius: 8, borderWidth: 1, padding: 12 },
  errorText: { color: semanticColors.negative, fontSize: 12, lineHeight: 18 },
  statePanel: { alignItems: 'center', gap: 16, justifyContent: 'center', marginTop: 12, minHeight: 260, padding: 24 },
  stateText: { color: semanticColors.textMuted, fontSize: 14, lineHeight: 21, maxWidth: 300, textAlign: 'center' },
});
