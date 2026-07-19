import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { betFinancialSummary, couponPresentation, formatMoney, type BetDto } from '@/bets/models';
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
  const lead = coupon.legs[0];

  return (
    <Animated.View
      entering={FadeInDown.delay(animationDelay).duration(380).reduceMotion(ReduceMotion.System)}
      layout={LinearTransition.duration(220).reduceMotion(ReduceMotion.System)}
    >
      <MotionPressable accessibilityHint="Opens bet details" accessibilityRole="button" glow="none" onPress={onPress} style={styles.ticket}>
        <View style={styles.metaRow}>
          <Text style={styles.type}>{coupon.isExpress ? `EXPRESS / ${coupon.legs.length}` : 'SINGLE'}</Text>
          <Text style={[styles.status, { color: status.color }]}>{status.label.toUpperCase()}</Text>
        </View>
        <View style={styles.mainRow}>
          <View style={styles.mainCopy}>
            <Text numberOfLines={1} style={styles.event}>{lead?.eventName ?? 'Event not recorded'}</Text>
            <Text numberOfLines={compact ? 1 : 2} style={styles.selection}>
              {coupon.isExpress ? coupon.label : lead?.selection ?? lead?.marketType ?? 'Selection not recorded'}
            </Text>
          </View>
          <Text style={styles.odds}>{totalOdds?.toFixed(2) ?? '—'}</Text>
        </View>
        <View style={styles.financialRow}>
          <Metric label="STAKE" value={formatMoney(bet.stake, currency)} />
          <Metric label="TOTAL ODDS" value={totalOdds?.toFixed(2) ?? '—'} />
          <Metric label={financial.label.toUpperCase()} value={financial.value} />
          <Text style={styles.arrow}>→</Text>
        </View>
      </MotionPressable>
    </Animated.View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text numberOfLines={1} style={styles.metricValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  ticket: { borderBottomColor: colors.border, borderBottomWidth: 1, overflow: 'hidden', paddingVertical: 15 },
  metaRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  type: { color: colors.muted, fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  status: { fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  mainRow: { alignItems: 'flex-end', flexDirection: 'row', gap: 12 },
  mainCopy: { flex: 1, gap: 5, minWidth: 0 },
  event: { color: colors.muted, fontSize: 10, fontWeight: '600' },
  selection: { color: colors.text, fontSize: 18, fontWeight: '900', letterSpacing: -0.4, lineHeight: 22 },
  odds: { color: colors.text, fontSize: 27, fontVariant: ['tabular-nums'], fontWeight: '900', letterSpacing: -1.2 },
  financialRow: { alignItems: 'flex-end', flexDirection: 'row', gap: 17, marginTop: 16 },
  metric: { gap: 3, minWidth: 48 },
  metricLabel: { color: colors.placeholder, fontSize: 7, fontWeight: '700', letterSpacing: 0.7 },
  metricValue: { color: colors.secondaryText, fontSize: 10, fontVariant: ['tabular-nums'], fontWeight: '700' },
  arrow: { color: colors.text, fontSize: 18, marginLeft: 'auto' },
});
