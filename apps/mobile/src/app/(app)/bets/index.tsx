import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { useAuth } from '@/auth/auth-context';
import { fetchBets, fetchCurrency } from '@/bets/data';
import { readErrorMessage } from '@/bets/errors';
import { type BetDto } from '@/bets/models';
import { BetTicket } from '@/ui/bet-ticket';
import { MotionPressable } from '@/ui/motion';
import { colors } from '@/ui/theme';
import { EditorialBackdrop, EditorialRule } from '@/ui/time-warp';

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
      <EditorialBackdrop />
      <Animated.View entering={FadeInDown.duration(380).reduceMotion(ReduceMotion.System)} style={styles.header}>
        <View style={styles.masthead}><Text style={styles.wordmark}>BETTRACKER</Text><Text style={styles.mastheadSection}>TRACKER / ARCHIVE</Text></View>
        <View style={styles.headingRow}>
          <Text style={styles.title}>MY{`\n`}BETS</Text>
          <Text style={styles.count}>{String(bets.length).padStart(2, '0')}</Text>
        </View>
        <EditorialRule label="MOST RECENT FIRST" />
        <View style={styles.actions}>
          <HeaderAction label="SCAN" onPress={() => router.push('/(app)/ai')} />
          <HeaderAction inverted label="+ ADD BET" onPress={() => router.push('/(app)/bets/new')} />
        </View>
      </Animated.View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={colors.text} size="large" /><Text style={styles.muted}>LOADING ARCHIVE</Text></View>
      ) : error && bets.length === 0 ? (
        <View style={styles.centered}><Text accessibilityLiveRegion="polite" role="alert" style={styles.error}>{error}</Text><Pressable accessibilityRole="button" onPress={() => void load()} style={styles.retryButton}><Text style={styles.retryText}>TRY AGAIN</Text></Pressable></View>
      ) : (
        <FlatList
          contentContainerStyle={[styles.list, bets.length === 0 && styles.emptyList]}
          data={bets}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<View style={styles.centered}><Text style={styles.emptyTitle}>NO RECORDS</Text><Text style={styles.muted}>PREPARE THE FIRST BETTING DECISION.</Text><Pressable accessibilityRole="button" onPress={() => router.push('/(app)/bets/new')} style={styles.retryButton}><Text style={styles.retryText}>PREPARE A BET</Text></Pressable></View>}
          ListHeaderComponent={error ? <Text style={styles.inlineError}>{error}</Text> : null}
          refreshControl={<RefreshControl colors={[colors.text]} onRefresh={() => void load(true)} refreshing={refreshing} tintColor={colors.text} />}
          renderItem={({ index, item }) => <BetTicket animationDelay={Math.min(index, 7) * 55} bet={item} currency={currency} onPress={() => router.push({ pathname: '/(app)/bets/[id]', params: { id: item.id } })} />}
        />
      )}
    </SafeAreaView>
  );
}

function HeaderAction({ inverted = false, label, onPress }: { inverted?: boolean; label: string; onPress: () => void }) {
  return <MotionPressable accessibilityRole="button" onPress={onPress} style={[styles.action, inverted && styles.actionInverted]}><Text style={[styles.actionText, inverted && styles.actionTextInverted]}>{label}</Text><Text style={[styles.actionArrow, inverted && styles.actionTextInverted]}>↗</Text></MotionPressable>;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  header: { paddingHorizontal: 14 },
  masthead: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', minHeight: 42 },
  wordmark: { color: colors.text, fontSize: 15, fontWeight: '900' },
  mastheadSection: { color: colors.muted, fontSize: 8, fontWeight: '700', letterSpacing: 1, marginLeft: 'auto' },
  headingRow: { alignItems: 'flex-end', flexDirection: 'row', minHeight: 148, paddingVertical: 20 },
  title: { color: colors.text, flex: 1, fontSize: 54, fontWeight: '900', letterSpacing: -3, lineHeight: 48 },
  count: { color: colors.text, fontSize: 29, fontVariant: ['tabular-nums'], fontWeight: '300' },
  actions: { flexDirection: 'row', marginHorizontal: -14, marginTop: 12 },
  action: { backgroundColor: '#FFFFFF', borderBottomColor: colors.border, borderBottomWidth: 1, borderTopColor: colors.border, borderTopWidth: 1, flex: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 58, padding: 14 },
  actionInverted: { backgroundColor: '#050505' },
  actionText: { color: colors.text, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  actionTextInverted: { color: '#FFFFFF' },
  actionArrow: { color: colors.text, fontSize: 17 },
  list: { paddingBottom: 30, paddingHorizontal: 14 },
  emptyList: { flexGrow: 1 },
  centered: { alignItems: 'center', flex: 1, gap: 14, justifyContent: 'center', padding: 28 },
  muted: { color: colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, lineHeight: 16, textAlign: 'center' },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  inlineError: { backgroundColor: colors.danger, color: '#FFFFFF', fontSize: 11, fontWeight: '700', padding: 12 },
  emptyTitle: { color: colors.text, fontSize: 34, fontWeight: '900', letterSpacing: -1.5 },
  retryButton: { alignItems: 'center', backgroundColor: '#050505', justifyContent: 'center', minHeight: 48, paddingHorizontal: 22 },
  retryText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
});
