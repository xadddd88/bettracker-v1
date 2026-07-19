import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
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
import { type BetDto } from '@/bets/models';
import { BetTicket } from '@/ui/bet-ticket';
import { colors } from '@/ui/theme';
import { TimeWarpBackdrop, WarpRail } from '@/ui/time-warp';

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
      <TimeWarpBackdrop />
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <WarpRail />
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
            <SymbolView
              fallback={<Text style={styles.headerButtonText}>S</Text>}
              name={{ android: 'document_scanner', ios: 'viewfinder', web: 'document_scanner' }}
              size={20}
              tintColor={colors.secondaryText}
            />
          </Pressable>
          <Pressable
            accessibilityLabel="Add bet"
            accessibilityRole="button"
            onPress={() => router.push('/(app)/bets/new')}
            style={({ pressed }) => [styles.headerButtonPrimary, pressed && styles.cardPressed]}
          >
            <SymbolView
              fallback={<Text style={styles.headerButtonPrimaryText}>+</Text>}
              name={{ android: 'add', ios: 'plus', web: 'add' }}
              size={22}
              tintColor={colors.background}
            />
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
            return (
              <BetTicket
                bet={item}
                currency={currency}
                onPress={() => router.push({ pathname: '/(app)/bets/[id]', params: { id: item.id } })}
              />
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingBottom: 12, paddingTop: 6 },
  headerCopy: { flex: 1, gap: 3, minWidth: 0 },
  eyebrow: { color: colors.accent, fontFamily: 'monospace', fontSize: 9, fontWeight: '700', letterSpacing: 1.6 },
  title: { color: colors.text, fontSize: 25, fontWeight: '800', letterSpacing: -0.3, marginTop: 2 },
  subtitle: { color: colors.muted, fontSize: 11, marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerButton: { alignItems: 'center', borderColor: colors.border, borderRadius: 21, borderWidth: StyleSheet.hairlineWidth, height: 42, justifyContent: 'center', width: 42 },
  headerButtonText: { color: colors.secondaryText, fontSize: 12, fontWeight: '800' },
  headerButtonPrimary: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: 21, height: 42, justifyContent: 'center', width: 42 },
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
  cardPressed: { backgroundColor: colors.surfaceRaised, opacity: 0.9 },
});
