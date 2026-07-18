import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { fetchBets, fetchCurrency } from '@/bets/data';
import { readErrorMessage } from '@/bets/errors';
import { betTitle, type BetDto, formatMoney } from '@/bets/models';
import { STATUS_PRESENTATION } from '@/bets/presentation';
import { colors } from '@/ui/theme';

export default function BetsScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
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
      const [nextBets, nextCurrency] = await Promise.all([
        fetchBets(userId),
        fetchCurrency(userId),
      ]);
      setBets(nextBets);
      setCurrency(nextCurrency);
    } catch (nextError) {
      setError(readErrorMessage(nextError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>FOUNDER TRACKER</Text>
          <Text style={styles.title}>Your bets</Text>
          <Text style={styles.subtitle}>Read-only · {bets.length} tracked</Text>
        </View>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => void signOut()} style={styles.signOut}>
          <Text style={styles.signOutText}>Log out</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.muted}>Loading your bets…</Text>
        </View>
      ) : error && bets.length === 0 ? (
        <View style={styles.centered}>
          <Text accessibilityLiveRegion="polite" role="alert" style={styles.error}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.retryButton}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={[styles.list, bets.length === 0 && styles.emptyList]}
          data={bets}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyTitle}>No tracked bets yet</Text>
              <Text style={styles.muted}>Bets created on the web will appear here.</Text>
            </View>
          }
          ListHeaderComponent={error ? <Text style={styles.inlineError}>{error}</Text> : null}
          refreshControl={
            <RefreshControl
              colors={[colors.accent]}
              onRefresh={() => void load(true)}
              refreshing={refreshing}
              tintColor={colors.accent}
            />
          }
          renderItem={({ item }) => {
            const status = STATUS_PRESENTATION[item.status];
            const firstLeg = item.legs[0];
            return (
              <Pressable
                accessibilityHint="Opens bet details"
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/(app)/bets/[id]', params: { id: item.id } })}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              >
                <View style={styles.cardHeader}>
                  <Text numberOfLines={2} style={styles.cardTitle}>{betTitle(item)}</Text>
                  <View style={[styles.badge, { borderColor: status.color }]}>
                    <Text style={[styles.badgeText, { color: status.color }]}>{status.label}</Text>
                  </View>
                </View>
                {item.legs.length > 1 ? (
                  <Text numberOfLines={2} style={styles.eventPreview}>
                    {item.legs.map((leg) => leg.eventName).join(' · ')}
                  </Text>
                ) : firstLeg?.selection ? (
                  <Text numberOfLines={1} style={styles.eventPreview}>{firstLeg.selection}</Text>
                ) : null}
                <View style={styles.metrics}>
                  <Metric label="Stake" value={formatMoney(item.stake, currency)} />
                  <Metric label="Odds" value={item.totalOdds?.toFixed(2) ?? firstLeg?.odds.toFixed(2) ?? '—'} />
                  {item.pnl !== null ? <Metric label="P&L" value={formatMoney(item.pnl, currency)} /> : null}
                </View>
                <Text style={styles.date}>{new Date(item.placedAt).toLocaleDateString()}</Text>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  header: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, paddingHorizontal: 18, paddingVertical: 16 },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.8 },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', marginTop: 4 },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 3 },
  signOut: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 8 },
  signOutText: { color: colors.secondaryText, fontSize: 14, fontWeight: '600' },
  list: { gap: 12, paddingBottom: 28, paddingHorizontal: 16 },
  emptyList: { flexGrow: 1 },
  centered: { alignItems: 'center', flex: 1, gap: 14, justifyContent: 'center', padding: 28 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  error: { color: colors.danger, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  inlineError: { color: colors.danger, fontSize: 13, lineHeight: 19, paddingVertical: 8 },
  emptyTitle: { color: colors.text, fontSize: 19, fontWeight: '700' },
  retryButton: { backgroundColor: colors.accent, borderRadius: 10, justifyContent: 'center', minHeight: 44, paddingHorizontal: 20 },
  retryText: { color: colors.background, fontWeight: '800' },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, gap: 12, padding: 16 },
  cardPressed: { backgroundColor: colors.surfaceRaised, opacity: 0.9 },
  cardHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  cardTitle: { color: colors.text, flex: 1, fontSize: 16, fontWeight: '700', lineHeight: 22, minWidth: 0 },
  badge: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  eventPreview: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  metric: { gap: 2, minWidth: 62 },
  metricLabel: { color: colors.placeholder, fontSize: 10, textTransform: 'uppercase' },
  metricValue: { color: colors.secondaryText, fontSize: 14, fontWeight: '700' },
  date: { color: colors.placeholder, fontSize: 11 },
});
