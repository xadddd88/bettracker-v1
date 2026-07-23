import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { useAuth } from '@/auth/auth-context';
import { fetchBankroll, fetchBets } from '@/bets/data';
import { readErrorMessage } from '@/bets/errors';
import { formatMoney, type BetDto } from '@/bets/models';
import { summarizeBets } from '@/bets/summary';
import { BetTicket } from '@/ui/bet-ticket';
import { BroadcastButton, BroadcastPanel } from '@/ui/broadcast-noir-primitives';
import { geometry, semanticColors, typography } from '@/ui/theme';

const ENTER = FadeInDown.duration(260).reduceMotion(ReduceMotion.System);
const touchMinimum = Platform.OS === 'android' ? geometry.androidTouchMinimum : geometry.iosTouchMinimum;

export default function HomeScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [bets, setBets] = useState<BetDto[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [nextBets, bankroll] = await Promise.all([fetchBets(userId), fetchBankroll(userId)]);
      setBets(nextBets);
      setBalance(bankroll.balance);
      setCurrency(bankroll.currency);
    } catch (nextError) {
      setError(readErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const summary = useMemo(() => summarizeBets(bets), [bets]);
  const recent = bets.slice(0, 3);
  const reviewPending = summary.openCount > 0;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.masthead}>
          <View style={styles.mastheadCopy}>
            <Text style={styles.wordmark}>BETTRACKER</Text>
            <Text style={styles.mastheadMeta}>FOUNDER HOME</Text>
          </View>
          <Pressable
            accessibilityLabel="Account and settings"
            accessibilityRole="button"
            onPress={() => router.push('/(app)/more')}
            style={styles.account}
          >
            <Text style={styles.accountText}>ACCOUNT</Text>
          </Pressable>
        </View>

        <Animated.View entering={ENTER}>
          <BroadcastPanel style={styles.hero}>
            <View style={styles.signalRail} />
            <Text style={styles.eyebrow}>PERSISTED ACCOUNT DATA</Text>
            <Text style={styles.heroTitle}>ONE USEFUL ACTION.{`\n`}NO INVENTED SIGNAL.</Text>
            <Text style={styles.heroBody}>
              Review the account state, take one explicit action, and keep every saved result traceable.
            </Text>
          </BroadcastPanel>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(50).duration(260).reduceMotion(ReduceMotion.System)}>
          <BroadcastPanel style={styles.adaptivePanel}>
            <View style={styles.sectionTopline}>
              <Text style={styles.signalLabel}>ADAPTIVE ACTION</Text>
              <Text style={styles.sectionMeta}>{reviewPending ? `${summary.openCount} OPEN` : 'NO PENDING BETS'}</Text>
            </View>
            <Text style={styles.actionTitle}>{reviewPending ? 'Review pending bets' : 'Scan coupon'}</Text>
            <Text style={styles.actionBody}>
              {reviewPending
                ? 'Open the records already stored in Tracker.'
                : 'Capture a coupon and review the editable draft before saving.'}
            </Text>
            <BroadcastButton
              label={reviewPending ? 'OPEN TRACKER' : 'SCAN COUPON'}
              onPress={() => router.push(reviewPending ? '/(app)/bets' : '/(app)/ai')}
              style={styles.primaryAction}
            />
          </BroadcastPanel>
        </Animated.View>

        <BroadcastPanel style={styles.portfolio}>
          <View style={styles.sectionTopline}>
            <Text style={styles.sectionName}>PORTFOLIO</Text>
            <Text style={styles.sectionMeta}>{summary.openCount} OPEN</Text>
          </View>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={semanticColors.textPrimary} />
              <Text accessibilityLiveRegion="polite" style={styles.loadingText}>SYNCING ACCOUNT</Text>
            </View>
          ) : (
            <>
              <Text adjustsFontSizeToFit numberOfLines={1} style={styles.balance}>
                {balance === null ? '—' : formatMoney(balance, currency)}
              </Text>
              <View style={styles.metrics}>
                <Metric label="NET P&L" value={summary.settledCount === 0 ? '—' : formatMoney(summary.netPnl, currency)} />
                <Metric label="TRACKED" value={String(bets.length)} />
                <Metric label="SETTLED" value={String(summary.settledCount)} last />
              </View>
            </>
          )}
          {error ? (
            <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.errorBand}>
              <Text accessibilityLiveRegion="polite" style={styles.errorText}>{error}</Text>
              <Text style={styles.retryText}>RETRY</Text>
            </Pressable>
          ) : null}
        </BroadcastPanel>

        <View style={styles.quickActions}>
          <QuickAction label="SCAN COUPON" onPress={() => router.push('/(app)/ai')} primary />
          <QuickAction label="ADD BET" onPress={() => router.push('/(app)/bets/new')} />
        </View>

        <BroadcastPanel style={styles.recentPanel}>
          <View style={styles.sectionTopline}>
            <Text style={styles.sectionName}>RECENT BETS</Text>
            <Pressable accessibilityLabel="View all saved bets" accessibilityRole="button" onPress={() => router.push('/(app)/bets')} style={styles.viewAll}>
              <Text style={styles.viewAllText}>VIEW ALL →</Text>
            </Pressable>
          </View>
          {recent.length === 0 && !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>NO SAVED BETS</Text>
              <Text style={styles.emptyText}>A scan becomes a record only after you review and save it.</Text>
            </View>
          ) : recent.map((bet, index) => (
            <BetTicket
              animationDelay={index * 50}
              bet={bet}
              compact
              currency={currency}
              key={bet.id}
              onPress={() => router.push({ pathname: '/(app)/bets/[id]', params: { id: bet.id } })}
            />
          ))}
        </BroadcastPanel>
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickAction({ label, onPress, primary = false }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.quickAction, primary ? styles.quickActionPrimary : null, pressed ? styles.pressed : null]}
    >
      <Text style={[styles.quickActionText, primary ? styles.quickActionTextPrimary : null]}>{label}</Text>
      <Text aria-hidden style={[styles.quickActionArrow, primary ? styles.quickActionTextPrimary : null]}>→</Text>
    </Pressable>
  );
}

function Metric({ label, last = false, value }: { label: string; last?: boolean; value: string }) {
  return (
    <View style={[styles.metric, last ? styles.metricLast : null]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text adjustsFontSizeToFit numberOfLines={1} style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.night, flex: 1 },
  content: { backgroundColor: semanticColors.night, gap: 12, padding: 12, paddingBottom: 28 },
  masthead: { alignItems: 'center', flexDirection: 'row', minHeight: touchMinimum, paddingHorizontal: 4 },
  mastheadCopy: { flex: 1, minWidth: 0 },
  wordmark: { color: semanticColors.textPrimary, fontSize: 18, fontWeight: '900', letterSpacing: -0.7 },
  mastheadMeta: { color: semanticColors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
  account: { alignItems: 'center', justifyContent: 'center', minHeight: touchMinimum, paddingHorizontal: 10 },
  accountText: { color: semanticColors.textPrimary, fontSize: 12, fontWeight: '800', letterSpacing: 0.7 },
  hero: { minHeight: 250, overflow: 'hidden', padding: 20 },
  signalRail: { backgroundColor: semanticColors.signal, bottom: 0, left: 0, position: 'absolute', top: 0, width: 4 },
  eyebrow: { color: semanticColors.textQuietRaised, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  heroTitle: { color: semanticColors.textPrimary, fontSize: 34, fontWeight: '900', letterSpacing: -1.6, lineHeight: 37, marginTop: 30 },
  heroBody: { color: semanticColors.textMuted, fontSize: typography.bodyMobile.fontSize, lineHeight: typography.bodyMobile.lineHeight, marginTop: 18, maxWidth: 310 },
  adaptivePanel: { borderColor: semanticColors.signal, minHeight: 240, padding: 18 },
  sectionTopline: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  signalLabel: { color: semanticColors.signal, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  sectionName: { color: semanticColors.textPrimary, flex: 1, fontSize: 12, fontWeight: '900', letterSpacing: 1.1 },
  sectionMeta: { color: semanticColors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  actionTitle: { color: semanticColors.textPrimary, fontSize: 28, fontWeight: '900', letterSpacing: -1, lineHeight: 32, marginTop: 30 },
  actionBody: { color: semanticColors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 8 },
  primaryAction: { marginTop: 'auto' },
  portfolio: { padding: 18 },
  balance: { color: semanticColors.dataValue, fontSize: 48, fontVariant: ['tabular-nums'], fontWeight: '900', letterSpacing: -2.4, marginVertical: 24 },
  metrics: { borderBottomColor: semanticColors.borderStrong, borderBottomWidth: 1, borderTopColor: semanticColors.borderStrong, borderTopWidth: 1, flexDirection: 'row' },
  metric: { borderRightColor: semanticColors.borderStrong, borderRightWidth: 1, flex: 1, gap: 7, minWidth: 0, paddingHorizontal: 8, paddingVertical: 13 },
  metricLast: { borderRightWidth: 0 },
  metricLabel: { color: semanticColors.textQuietRaised, fontSize: 11, fontWeight: '700', letterSpacing: 0.7 },
  metricValue: { color: semanticColors.dataValue, fontSize: 15, fontVariant: ['tabular-nums'], fontWeight: '800' },
  loadingRow: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 136 },
  loadingText: { color: semanticColors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  errorBand: { borderColor: semanticColors.negative, borderRadius: geometry.radiusControl, borderWidth: 1, gap: 6, marginTop: 14, minHeight: touchMinimum, padding: 12 },
  errorText: { color: semanticColors.negative, fontSize: 12, fontWeight: '800' },
  retryText: { color: semanticColors.textPrimary, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  quickActions: { flexDirection: 'row', gap: 10 },
  quickAction: { alignItems: 'flex-end', backgroundColor: semanticColors.field, borderColor: semanticColors.borderStrong, borderRadius: geometry.radiusControl, borderWidth: 1, flex: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 96, padding: 14 },
  quickActionPrimary: { backgroundColor: semanticColors.signal, borderColor: semanticColors.signal },
  quickActionText: { color: semanticColors.textPrimary, flex: 1, fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  quickActionTextPrimary: { color: semanticColors.onSignal },
  quickActionArrow: { color: semanticColors.textPrimary, fontSize: 20 },
  pressed: { opacity: 0.82 },
  recentPanel: { padding: 18 },
  viewAll: { alignItems: 'center', justifyContent: 'center', minHeight: touchMinimum, paddingLeft: 10 },
  viewAllText: { color: semanticColors.textPrimary, fontSize: 11, fontWeight: '900', letterSpacing: 0.4 },
  empty: { gap: 8, minHeight: 180, paddingVertical: 50 },
  emptyTitle: { color: semanticColors.textPrimary, fontSize: 26, fontWeight: '900' },
  emptyText: { color: semanticColors.textMuted, fontSize: 14, lineHeight: 21 },
});
