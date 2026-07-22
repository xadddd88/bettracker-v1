import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { useAuth } from '@/auth/auth-context';
import { fetchBets, fetchCurrency } from '@/bets/data';
import { readErrorMessage } from '@/bets/errors';
import { type BetDto } from '@/bets/models';
import { BetTicket } from '@/ui/bet-ticket';
import { BroadcastButton } from '@/ui/broadcast-noir-primitives';
import { semanticColors } from '@/ui/theme';

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

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <Animated.View entering={FadeInDown.duration(300).reduceMotion(ReduceMotion.System)} style={styles.header}>
        <View style={styles.masthead}><Text style={styles.wordmark}>BETTRACKER</Text><Text style={styles.mastheadSection}>TRACKER / ARCHIVE</Text></View>
        <View style={styles.headingRow}>
          <View style={styles.headingCopy}>
            <Text style={styles.kicker}>NEWEST FIRST</Text>
            <Text style={styles.title}>TRACKER</Text>
          </View>
          <Text style={styles.count}>{String(bets.length).padStart(2, '0')}</Text>
        </View>
        <View style={styles.actions}>
          <BroadcastButton label="SCAN COUPON" onPress={() => router.push('/(app)/ai')} style={styles.action} tone="secondary" />
          <BroadcastButton label="ADD BET" onPress={() => router.push('/(app)/bets/new')} style={styles.action} />
        </View>
      </Animated.View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={semanticColors.signal} size="large" /><Text style={styles.muted}>LOADING TRACKER</Text></View>
      ) : error && bets.length === 0 ? (
        <View style={styles.centered}>
          <Text accessibilityLiveRegion="polite" role="alert" style={styles.error}>{error}</Text>
          <BroadcastButton label="TRY AGAIN" onPress={() => void load()} tone="secondary" />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={[styles.list, bets.length === 0 && styles.emptyList]}
          data={bets}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyTitle}>NO TRACKED RECORDS</Text>
              <Text style={styles.muted}>Scan a coupon into an editable draft or enter a bet manually.</Text>
              <BroadcastButton label="ADD BET" onPress={() => router.push('/(app)/bets/new')} />
            </View>
          }
          ListHeaderComponent={error ? <Text accessibilityLiveRegion="polite" style={styles.inlineError}>{error}</Text> : null}
          refreshControl={<RefreshControl colors={[semanticColors.signal]} onRefresh={() => void load(true)} refreshing={refreshing} tintColor={semanticColors.signal} />}
          renderItem={({ index, item }) => <BetTicket animationDelay={Math.min(index, 7) * 45} bet={item} currency={currency} onPress={() => router.push({ pathname: '/(app)/bets/[id]', params: { id: item.id } })} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.night, flex: 1 },
  header: { paddingHorizontal: 16 },
  masthead: { alignItems: 'center', borderBottomColor: semanticColors.borderStrong, borderBottomWidth: 1, flexDirection: 'row', minHeight: 64 },
  wordmark: { color: semanticColors.textPrimary, fontSize: 17, fontWeight: '900' },
  mastheadSection: { color: semanticColors.textQuiet, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginLeft: 'auto' },
  headingRow: { alignItems: 'flex-end', flexDirection: 'row', minHeight: 132, paddingVertical: 22 },
  headingCopy: { flex: 1, minWidth: 0 },
  kicker: { color: semanticColors.textQuiet, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  title: { color: semanticColors.textPrimary, fontSize: 44, fontWeight: '900', lineHeight: 48, marginTop: 8 },
  count: { color: semanticColors.dataValue, fontSize: 28, fontVariant: ['tabular-nums'], fontWeight: '400' },
  actions: { flexDirection: 'row', gap: 8, paddingBottom: 16 },
  action: { flex: 1 },
  list: { paddingBottom: 30, paddingHorizontal: 16 },
  emptyList: { flexGrow: 1 },
  centered: { alignItems: 'center', flex: 1, gap: 16, justifyContent: 'center', padding: 28 },
  muted: { color: semanticColors.textMuted, fontSize: 12, fontWeight: '700', lineHeight: 18, textAlign: 'center' },
  error: { color: semanticColors.negative, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  inlineError: { borderColor: semanticColors.negative, borderWidth: 1, color: semanticColors.negative, fontSize: 12, fontWeight: '700', marginTop: 12, padding: 12 },
  emptyTitle: { color: semanticColors.textPrimary, fontSize: 30, fontWeight: '900', lineHeight: 34, textAlign: 'center' },
});
