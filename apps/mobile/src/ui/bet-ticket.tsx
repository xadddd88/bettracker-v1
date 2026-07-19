import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition, ReduceMotion } from 'react-native-reanimated';

import {
  betFinancialSummary,
  couponPresentation,
  formatMoney,
  type BetDto,
} from '@/bets/models';
import { STATUS_PRESENTATION } from '@/bets/presentation';
import { MotionPressable } from '@/ui/motion';
import { colors } from '@/ui/theme';

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
  const totalOdds = bet.totalOdds ?? bet.legs[0]?.odds ?? null;
  const previewLegs = coupon.legs.slice(0, compact ? 1 : 2);

  return (
    <Animated.View
      entering={FadeInDown.delay(animationDelay).duration(420).reduceMotion(ReduceMotion.System)}
      layout={LinearTransition.duration(240).reduceMotion(ReduceMotion.System)}
    >
      <MotionPressable
        accessibilityHint="Opens bet details"
        accessibilityRole="button"
        glow="none"
        onPress={onPress}
        style={styles.ticket}
      >
      <View style={styles.topline}>
        <View style={styles.typeBadge}>
          <Text style={styles.typeText}>
            {coupon.isExpress ? `EXPRESS · ${coupon.legs.length}` : 'SINGLE'}
          </Text>
        </View>
        <View style={styles.status}>
          <View style={[styles.statusDot, { backgroundColor: status.color }]} />
          <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>

      <View style={styles.legs}>
        {previewLegs.map((leg) => (
          <View key={leg.id} style={styles.legRow}>
            {coupon.isExpress ? (
              <View style={styles.legIndex}>
                <Text style={styles.legIndexText}>{leg.index}</Text>
              </View>
            ) : null}
            <View style={styles.legCopy}>
              <Text numberOfLines={1} style={styles.event}>{leg.eventName}</Text>
              <Text numberOfLines={1} style={styles.selection}>
                {leg.selection ?? leg.marketType ?? 'Selection not recorded'}
              </Text>
            </View>
            {leg.odds !== null ? <Text style={styles.legOdds}>{leg.odds.toFixed(2)}</Text> : null}
          </View>
        ))}
        {!compact && coupon.legs.length > previewLegs.length ? (
          <Text style={styles.moreLegs}>+{coupon.legs.length - previewLegs.length} more selections</Text>
        ) : null}
      </View>

      <View style={styles.financialRow}>
        <TicketMetric label="Stake" value={formatMoney(bet.stake, currency)} />
        <TicketMetric label="Total odds" value={totalOdds?.toFixed(2) ?? '—'} />
        <TicketMetric label={financial.label} value={financial.value} />
        {!compact ? <Text style={styles.date}>{new Date(bet.placedAt).toLocaleDateString()}</Text> : null}
      </View>
      </MotionPressable>
    </Animated.View>
  );
}

function TicketMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ticket: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  topline: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 36,
    paddingHorizontal: 12,
  },
  typeBadge: { borderColor: colors.accent, borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 7, paddingVertical: 4 },
  typeText: { color: colors.accent, fontFamily: 'monospace', fontSize: 8, fontWeight: '700', letterSpacing: 0.7 },
  status: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  statusDot: { borderRadius: 99, height: 6, width: 6 },
  statusText: { fontSize: 10, fontWeight: '700' },
  legs: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  legRow: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 60, paddingHorizontal: 12, paddingVertical: 9 },
  legIndex: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 7, height: 28, justifyContent: 'center', width: 28 },
  legIndexText: { color: colors.magenta, fontFamily: 'monospace', fontSize: 10, fontWeight: '700' },
  legCopy: { flex: 1, gap: 4, minWidth: 0 },
  event: { color: colors.muted, fontSize: 10, fontWeight: '600' },
  selection: { color: colors.text, fontSize: 13, fontWeight: '700' },
  legOdds: { borderColor: colors.accent, borderRadius: 5, borderWidth: StyleSheet.hairlineWidth, color: colors.accent, fontSize: 14, fontVariant: ['tabular-nums'], fontWeight: '800', minWidth: 46, paddingHorizontal: 7, paddingVertical: 5, textAlign: 'center' },
  moreLegs: { color: colors.muted, fontSize: 10, paddingBottom: 9, paddingHorizontal: 50 },
  financialRow: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 16,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  metric: { gap: 2, minWidth: 48 },
  metricLabel: { color: colors.placeholder, fontFamily: 'monospace', fontSize: 8, fontWeight: '600' },
  metricValue: { color: colors.secondaryText, fontSize: 11, fontVariant: ['tabular-nums'], fontWeight: '700' },
  date: { color: colors.placeholder, fontSize: 9, marginLeft: 'auto' },
});
