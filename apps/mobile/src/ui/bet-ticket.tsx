import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { betFinancialSummary, couponPresentation, formatMoney, type BetDto, type BetStatus } from '@/bets/models';
import { STATUS_PRESENTATION } from '@/bets/presentation';
import { BroadcastStatus } from '@/ui/broadcast-noir-primitives';
import { MotionPressable } from '@/ui/motion';
import { semanticColors } from '@/ui/theme';

type BetTicketProps = {
  animationDelay?: number;
  bet: BetDto;
  compact?: boolean;
  currency: string;
  onPress: () => void;
};

export function BetTicket({ animationDelay = 0, bet, compact = false, currency, onPress }: BetTicketProps) {
  const coupon = couponPresentation(bet);
  const status = STATUS_PRESENTATION[bet.status];
  const financial = betFinancialSummary(bet, currency);
  const totalOdds = bet.totalOdds ?? (coupon.isExpress ? null : bet.legs[0]?.odds ?? null);

  return (
    <Animated.View
      entering={FadeInDown.delay(animationDelay).duration(300).reduceMotion(ReduceMotion.System)}
      layout={LinearTransition.duration(220).reduceMotion(ReduceMotion.System)}
    >
      <MotionPressable accessibilityHint="Opens bet details" accessibilityRole="button" glow="none" onPress={onPress} style={styles.ticket}>
        <View style={styles.metaRow}>
          <Text style={styles.type}>{coupon.isExpress ? `EXPRESS / ${coupon.legs.length} LEGS` : 'SINGLE'}</Text>
          <BroadcastStatus label={status.label} status={statusTone(bet.status)} />
        </View>

        <View style={styles.legs}>
          {coupon.legs.map((leg, index) => (
            <View key={leg.id} style={styles.leg}>
              <Text style={styles.legIndex}>{String(index + 1).padStart(2, '0')}</Text>
              <View style={styles.legCopy}>
                <Text numberOfLines={compact ? 1 : undefined} style={styles.event}>{leg.eventName || 'Event not recorded'}</Text>
                <Text numberOfLines={compact ? 1 : undefined} style={styles.selection}>
                  {[leg.marketType, leg.selection].filter(Boolean).join(' · ') || 'Selection not recorded'}
                </Text>
              </View>
              <Text style={styles.legOdds}>{leg.odds === null ? '—' : leg.odds.toFixed(2)}</Text>
            </View>
          ))}
        </View>

        {coupon.isLegacy ? <Text style={styles.legacy}>LEGACY EXPRESS / INDIVIDUAL LEG ODDS UNRESOLVED</Text> : null}

        <View style={styles.financialRow}>
          <Metric label="STAKE" value={formatMoney(bet.stake, currency)} />
          <Metric label="TOTAL ODDS" value={totalOdds?.toFixed(2) ?? '—'} />
          <Metric label={financial.label.toUpperCase()} value={financial.value} />
          <Text aria-hidden style={styles.arrow}>→</Text>
        </View>
      </MotionPressable>
    </Animated.View>
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

function statusTone(status: BetStatus): 'negative' | 'neutral' | 'review' | 'success' {
  if (status === 'won') return 'success';
  if (status === 'lost') return 'negative';
  if (status === 'pending') return 'review';
  return 'neutral';
}

const styles = StyleSheet.create({
  ticket: { borderBottomColor: semanticColors.borderSubtle, borderBottomWidth: 1, minHeight: 150, overflow: 'hidden', paddingVertical: 18 },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', marginBottom: 14 },
  type: { color: semanticColors.textMuted, flex: 1, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  legs: { gap: 13 },
  leg: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  legIndex: { color: semanticColors.textQuiet, fontSize: 11, fontVariant: ['tabular-nums'], marginTop: 1, width: 22 },
  legCopy: { flex: 1, gap: 3, minWidth: 0 },
  event: { color: semanticColors.textPrimary, fontSize: 13, fontWeight: '800', lineHeight: 18 },
  selection: { color: semanticColors.textMuted, fontSize: 12, lineHeight: 17 },
  legOdds: { color: semanticColors.dataValue, fontSize: 13, fontVariant: ['tabular-nums'], fontWeight: '900' },
  legacy: { borderColor: semanticColors.review, borderWidth: 1, color: semanticColors.review, fontSize: 11, fontWeight: '800', lineHeight: 16, marginTop: 14, padding: 9 },
  financialRow: { alignItems: 'flex-end', flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 18 },
  metric: { gap: 4, minWidth: 58 },
  metricLabel: { color: semanticColors.textQuiet, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  metricValue: { color: semanticColors.dataValue, fontSize: 12, fontVariant: ['tabular-nums'], fontWeight: '800' },
  arrow: { color: semanticColors.signal, fontSize: 22, marginLeft: 'auto' },
});
