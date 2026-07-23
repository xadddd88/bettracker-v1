import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { betFinancialSummary, couponPresentation, formatMoney, type BetDto } from '@/bets/models';
import { STATUS_PRESENTATION } from '@/bets/presentation';
import { BroadcastStatus } from '@/ui/broadcast-noir-primitives';
import { MotionPressable } from '@/ui/motion';
import { semanticColors, typography } from '@/ui/theme';

type BetTicketProps = {
  animationDelay?: number;
  bet: BetDto;
  compact?: boolean;
  currency: string;
  onPress: () => void;
};

export function BetTicket({ animationDelay = 0, bet, currency, onPress }: BetTicketProps) {
  const coupon = couponPresentation(bet);
  const status = STATUS_PRESENTATION[bet.status];
  const financial = betFinancialSummary(bet, currency);
  const totalOdds = bet.totalOdds ?? bet.legs[0]?.odds ?? null;

  return (
    <Animated.View
      entering={FadeInDown.delay(animationDelay).duration(380).reduceMotion(ReduceMotion.System)}
      layout={LinearTransition.duration(220).reduceMotion(ReduceMotion.System)}
    >
      <MotionPressable accessibilityHint="Opens bet details" accessibilityRole="button" glow="none" onPress={onPress} style={styles.ticket}>
        <View style={styles.metaRow}>
          <Text style={styles.type}>{coupon.isExpress ? `EXPRESS / ${coupon.legs.length}` : 'SINGLE'}</Text>
          <BroadcastStatus label={status.label} status={status.tone} />
        </View>
        <View style={styles.legs}>
          {coupon.legs.length ? coupon.legs.map((leg, index) => (
            <View key={leg.id} style={styles.leg}>
              <Text style={styles.legIndex}>{String(index + 1).padStart(2, '0')}</Text>
              <View style={styles.mainCopy}>
                <Text style={styles.event}>{leg.eventName}</Text>
                <Text style={styles.selection}>
                  {[leg.marketType, leg.selection].filter(Boolean).join(' · ') || 'Selection not recorded'}
                </Text>
              </View>
              <Text style={styles.legOdds}>{leg.odds === null ? '—' : leg.odds.toFixed(2)}</Text>
            </View>
          )) : (
            <Text style={styles.emptyLeg}>Leg details were not recorded.</Text>
          )}
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
  ticket: { borderBottomColor: semanticColors.borderStrong, borderBottomWidth: 1, overflow: 'hidden', paddingVertical: 16 },
  metaRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  type: { color: semanticColors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  legs: { gap: 12 },
  leg: { alignItems: 'flex-start', flexDirection: 'row', gap: 9 },
  legIndex: { color: semanticColors.textQuietRaised, fontSize: 11, fontVariant: ['tabular-nums'], fontWeight: '700', lineHeight: 18, width: 20 },
  mainCopy: { flex: 1, gap: 5, minWidth: 0 },
  event: { color: semanticColors.textPrimary, fontSize: typography.metadataPreferred.fontSize, fontWeight: '800', lineHeight: 18 },
  selection: { color: semanticColors.textMuted, fontSize: typography.metadataCompact.fontSize, lineHeight: 16 },
  legOdds: { color: semanticColors.dataValue, fontSize: 12, fontVariant: ['tabular-nums'], fontWeight: '900', lineHeight: 18 },
  emptyLeg: { color: semanticColors.textMuted, fontSize: 12, lineHeight: 18 },
  financialRow: { alignItems: 'flex-end', flexDirection: 'row', gap: 17, marginTop: 16 },
  metric: { gap: 3, minWidth: 48 },
  metricLabel: { color: semanticColors.textQuietRaised, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  metricValue: { color: semanticColors.dataValue, fontSize: 12, fontVariant: ['tabular-nums'], fontWeight: '800' },
  arrow: { color: semanticColors.textPrimary, fontSize: 18, marginLeft: 'auto' },
});
