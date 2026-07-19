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
import { betFinancialSummary, couponPresentation, type BetDto, formatMoney } from '@/bets/models';
import { STATUS_PRESENTATION } from '@/bets/presentation';
import { colors } from '@/ui/theme';

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
          <Text style={styles.eyebrow}>TRACKER</Text>
          <Text style={styles.title}>My bets</Text>
          <Text style={styles.subtitle}>{bets.length} tracked</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="Scan coupon"
            accessibilityRole="button"
            onPress={() => router.push('/(app)/ai')}
            style={({ pressed }) => [styles.headerButton, pressed && styles.cardPressed]}
          >
            <Text style={styles.headerButtonText}>Scan</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Add bet"
            accessibilityRole="button"
            onPress={() => router.push('/(app)/bets/new')}
            style={({ pressed }) => [styles.headerButtonPrimary, pressed && styles.cardPressed]}
          >
            <Text style={styles.headerButtonPrimaryText}>+ Add</Text>
          </Pressable>
        </View>
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
              <Text style={styles.muted}>Prepare your first local draft or add a bet on the web.</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/(app)/bets/new')}
                style={({ pressed }) => [styles.emptyButton, pressed && styles.cardPressed]}
              >
                <Text style={styles.emptyButtonText}>Prepare a bet</Text>
              </Pressable>
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
            const coupon = couponPresentation(item);
            const financial = betFinancialSummary(item, currency);
            const totalOdds = item.totalOdds ?? firstLeg?.odds ?? null;
            return (
              <Pressable
                accessibilityHint="Opens bet details"
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/(app)/bets/[id]', params: { id: item.id } })}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeading}>
                    <Text style={styles.couponType}>{coupon.label.toUpperCase()}</Text>
                    <Text numberOfLines={2} style={styles.cardTitle}>
                      {firstLeg?.eventName ?? 'Tracked bet'}
                    </Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: `${status.color}18` }]}>
                    <Text style={[styles.badgeText, { color: status.color }]}>{status.label}</Text>
                  </View>
                </View>
                <Text numberOfLines={1} style={styles.selection}>
                  {coupon.isExpress
                    ? `${coupon.legs.length} selections · ${coupon.legs.slice(0, 2).map((leg) => leg.selection ?? leg.eventName).join(' + ')}`
                    : firstLeg?.selection ?? firstLeg?.marketType ?? 'Selection not recorded'}
                </Text>
                <View style={styles.metrics}>
                  <Metric label="Stake" value={formatMoney(item.stake, currency)} />
                  <Metric label="Odds" value={totalOdds?.toFixed(2) ?? '—'} />
                  <Metric label={financial.label} value={financial.value} />
                  <Text style={styles.date}>{new Date(item.placedAt).toLocaleDateString()}</Text>
                </View>
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
  header: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingBottom: 14, paddingTop: 8 },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: colors.accent, fontSize: 9, fontWeight: '900', letterSpacing: 1.6 },
  title: { color: colors.text, fontSize: 27, fontWeight: '900', marginTop: 2 },
  subtitle: { color: colors.muted, fontSize: 11, marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerButton: { alignItems: 'center', borderColor: colors.border, borderRadius: 9, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 12 },
  headerButtonText: { color: colors.secondaryText, fontSize: 12, fontWeight: '800' },
  headerButtonPrimary: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: 9, justifyContent: 'center', minHeight: 44, paddingHorizontal: 12 },
  headerButtonPrimaryText: { color: colors.background, fontSize: 12, fontWeight: '900' },
  list: { gap: 10, paddingBottom: 28, paddingHorizontal: 16 },
  emptyList: { flexGrow: 1 },
  centered: { alignItems: 'center', flex: 1, gap: 14, justifyContent: 'center', padding: 28 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  error: { color: colors.danger, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  inlineError: { color: colors.danger, fontSize: 13, lineHeight: 19, paddingVertical: 8 },
  emptyTitle: { color: colors.text, fontSize: 19, fontWeight: '700' },
  emptyButton: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: 10, justifyContent: 'center', minHeight: 44, paddingHorizontal: 18 },
  emptyButtonText: { color: colors.background, fontSize: 13, fontWeight: '900' },
  retryButton: { backgroundColor: colors.accent, borderRadius: 10, justifyContent: 'center', minHeight: 44, paddingHorizontal: 20 },
  retryText: { color: colors.background, fontWeight: '800' },
  card: { backgroundColor: colors.surface, borderRadius: 16, gap: 10, overflow: 'hidden', padding: 14 },
  cardPressed: { backgroundColor: colors.surfaceRaised, opacity: 0.9 },
  cardHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  cardHeading: { flex: 1, gap: 4, minWidth: 0 },
  couponType: { color: colors.accent, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '800', lineHeight: 20 },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  selection: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  metrics: { alignItems: 'flex-end', borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 16, paddingTop: 10 },
  metric: { gap: 2 },
  metricLabel: { color: colors.placeholder, fontSize: 8, fontWeight: '700', textTransform: 'uppercase' },
  metricValue: { color: colors.secondaryText, fontSize: 13, fontWeight: '800' },
  date: { color: colors.placeholder, fontSize: 9, marginLeft: 'auto' },
});
