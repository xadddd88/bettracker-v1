import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { useAuth } from '@/auth/auth-context';
import { fetchBankroll, fetchBets } from '@/bets/data';
import { readErrorMessage } from '@/bets/errors';
import { formatMoney, type BetDto } from '@/bets/models';
import { summarizeBets } from '@/bets/summary';
import { BetTicket } from '@/ui/bet-ticket';
import { MotionPressable } from '@/ui/motion';
import { colors } from '@/ui/theme';
import { EditorialBackdrop, EditorialRule, KineticType } from '@/ui/time-warp';

const ENTER = FadeInDown.duration(420).reduceMotion(ReduceMotion.System);

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

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View entering={FadeIn.duration(300).reduceMotion(ReduceMotion.System)} style={styles.masthead}>
          <Text style={styles.wordmark}>XADDD</Text>
          <Text style={styles.mastheadMeta}>FOUNDER EDITION / 2026</Text>
          <Pressable accessibilityLabel="Account and settings" accessibilityRole="button" onPress={() => router.push('/(app)/more')} style={styles.account}>
            <Text style={styles.accountText}>ACCOUNT</Text>
          </Pressable>
        </Animated.View>

        <Animated.View entering={ENTER} style={styles.hero}>
          <EditorialBackdrop dark />
          <KineticType label="DECIDE" />
          <View style={styles.heroTopline}>
            <Text style={styles.heroIndex}>SYSTEM 001</Text>
            <Text style={styles.heroIndex}>LIVE DATA</Text>
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>BETTING{`\n`}DECISIONS{`\n`}IN FOCUS</Text>
            <Text style={styles.heroBody}>Capture the evidence. Review the context. Track the outcome.</Text>
          </View>
          <View style={styles.heroActions}>
            <EditorialAction label="SCAN NOW" onPress={() => router.push('/(app)/ai')} primary />
            <EditorialAction label="OPEN TRACKER" onPress={() => router.push('/(app)/bets')} />
          </View>
        </Animated.View>

        <View style={styles.signalBand}>
          <Text numberOfLines={1} style={styles.signalText}>ANALYZE  /  VERIFY  /  TRACK  /  ANALYZE  /  VERIFY  /  TRACK</Text>
        </View>

        <Animated.View entering={FadeInDown.delay(90).duration(420).reduceMotion(ReduceMotion.System)} style={styles.portfolio}>
          <View style={styles.sectionTopline}>
            <Text style={styles.sectionIndex}>01</Text>
            <Text style={styles.sectionName}>PORTFOLIO</Text>
            <Text style={styles.sectionMeta}>{summary.openCount} OPEN</Text>
          </View>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.text} />
              <Text style={styles.loadingText}>SYNCING ACCOUNT</Text>
            </View>
          ) : (
            <>
              <Text adjustsFontSizeToFit numberOfLines={1} style={styles.balance}>
                {balance === null ? '—' : formatMoney(balance, currency)}
              </Text>
              <View style={styles.metrics}>
                <Metric label="NET P&L" value={summary.settledCount === 0 ? '—' : formatMoney(summary.netPnl, currency)} />
                <Metric label="TRACKED" value={String(bets.length).padStart(2, '0')} />
                <Metric label="SETTLED" value={String(summary.settledCount).padStart(2, '0')} />
              </View>
            </>
          )}
          {error ? (
            <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.errorBand}>
              <Text accessibilityLiveRegion="polite" style={styles.errorText}>{error} — RETRY</Text>
            </Pressable>
          ) : null}
        </Animated.View>

        <View style={styles.actionSplit}>
          <SplitAction index="A" label="SCAN COUPON" onPress={() => router.push('/(app)/ai')} />
          <SplitAction index="B" label="ADD BET" onPress={() => router.push('/(app)/bets/new')} inverted />
        </View>

        <View style={styles.recentSection}>
          <View style={styles.sectionTopline}>
            <Text style={styles.sectionIndex}>02</Text>
            <Text style={styles.sectionName}>RECENT BETS</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push('/(app)/bets')} style={styles.viewAll}>
              <Text style={styles.viewAllText}>VIEW ALL →</Text>
            </Pressable>
          </View>
          <EditorialRule label={`${recent.length} RECORDS`} />
          {recent.length === 0 && !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>NO RECORDS</Text>
              <Text style={styles.emptyText}>Scan a coupon or prepare the first decision.</Text>
            </View>
          ) : recent.map((bet, index) => (
            <BetTicket
              animationDelay={index * 70}
              bet={bet}
              compact
              currency={currency}
              key={bet.id}
              onPress={() => router.push({ pathname: '/(app)/bets/[id]', params: { id: bet.id } })}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function EditorialAction({ label, onPress, primary = false }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <MotionPressable accessibilityRole="button" onPress={onPress} style={[styles.editorialAction, primary ? styles.editorialActionPrimary : null]}>
      <Text style={[styles.editorialActionText, primary ? styles.editorialActionTextPrimary : null]}>{label}</Text>
    </MotionPressable>
  );
}

function SplitAction({ index, inverted = false, label, onPress }: { index: string; inverted?: boolean; label: string; onPress: () => void }) {
  return (
    <MotionPressable accessibilityRole="button" onPress={onPress} style={[styles.splitAction, inverted && styles.splitActionInverted]}>
      <Text style={[styles.splitIndex, inverted && styles.splitTextInverted]}>{index}</Text>
      <Text style={[styles.splitLabel, inverted && styles.splitTextInverted]}>{label}</Text>
      <Text style={[styles.splitArrow, inverted && styles.splitTextInverted]}>↗</Text>
    </MotionPressable>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { backgroundColor: colors.background, paddingBottom: 28 },
  masthead: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', minHeight: 48, paddingHorizontal: 12 },
  wordmark: { color: colors.text, fontSize: 17, fontWeight: '900', letterSpacing: -0.6 },
  mastheadMeta: { color: colors.muted, flex: 1, fontSize: 8, letterSpacing: 0.9, marginLeft: 10 },
  account: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingLeft: 10 },
  accountText: { color: colors.text, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  hero: { backgroundColor: '#050505', minHeight: 470, overflow: 'hidden', padding: 18 },
  heroTopline: { flexDirection: 'row', justifyContent: 'space-between', zIndex: 2 },
  heroIndex: { color: '#FFFFFF', fontSize: 8, fontWeight: '700', letterSpacing: 1.3 },
  heroCopy: { flex: 1, justifyContent: 'center', zIndex: 2 },
  heroTitle: { color: '#FFFFFF', fontSize: 43, fontWeight: '900', letterSpacing: -2.5, lineHeight: 40 },
  heroBody: { color: '#C8C8C3', fontSize: 12, lineHeight: 17, marginTop: 18, maxWidth: 255 },
  heroActions: { flexDirection: 'row', gap: 8, zIndex: 2 },
  editorialAction: { alignItems: 'center', borderColor: '#FFFFFF', borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 48, paddingHorizontal: 10 },
  editorialActionPrimary: { backgroundColor: '#FFFFFF' },
  editorialActionText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  editorialActionTextPrimary: { color: '#050505' },
  signalBand: { backgroundColor: colors.accentMuted, borderBottomColor: colors.border, borderBottomWidth: 1, borderTopColor: colors.border, borderTopWidth: 1, justifyContent: 'center', minHeight: 42, overflow: 'hidden', paddingHorizontal: 12 },
  signalText: { color: '#050505', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  portfolio: { paddingHorizontal: 14, paddingVertical: 22 },
  sectionTopline: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 32 },
  sectionIndex: { color: colors.muted, fontSize: 9, fontWeight: '700' },
  sectionName: { color: colors.text, flex: 1, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  sectionMeta: { color: colors.text, fontSize: 9, fontWeight: '700' },
  balance: { color: colors.text, fontSize: 56, fontVariant: ['tabular-nums'], fontWeight: '900', letterSpacing: -3.2, marginVertical: 22 },
  metrics: { borderBottomColor: colors.border, borderBottomWidth: 1, borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row' },
  metric: { borderRightColor: colors.border, borderRightWidth: 1, flex: 1, gap: 6, paddingHorizontal: 9, paddingVertical: 13 },
  metricLabel: { color: colors.muted, fontSize: 8, fontWeight: '700', letterSpacing: 1 },
  metricValue: { color: colors.text, fontSize: 16, fontVariant: ['tabular-nums'], fontWeight: '800' },
  loadingRow: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 136 },
  loadingText: { color: colors.muted, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  errorBand: { backgroundColor: colors.danger, marginTop: 12, minHeight: 44, padding: 12 },
  errorText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  actionSplit: { borderBottomColor: colors.border, borderBottomWidth: 1, borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row' },
  splitAction: { backgroundColor: '#FFFFFF', flex: 1, minHeight: 112, padding: 12 },
  splitActionInverted: { backgroundColor: '#050505' },
  splitIndex: { color: colors.muted, fontSize: 9 },
  splitLabel: { color: colors.text, fontSize: 15, fontWeight: '900', marginTop: 'auto' },
  splitArrow: { color: colors.text, fontSize: 20, position: 'absolute', right: 12, top: 10 },
  splitTextInverted: { color: '#FFFFFF' },
  recentSection: { paddingHorizontal: 14, paddingTop: 22 },
  viewAll: { justifyContent: 'center', minHeight: 44 },
  viewAllText: { color: colors.text, fontSize: 9, fontWeight: '800' },
  empty: { gap: 8, minHeight: 180, paddingVertical: 50 },
  emptyTitle: { color: colors.text, fontSize: 26, fontWeight: '900' },
  emptyText: { color: colors.muted, fontSize: 12 },
});
