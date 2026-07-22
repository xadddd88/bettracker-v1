import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BroadcastDataValue, BroadcastPanel, BroadcastStatus } from '@/ui/broadcast-noir-primitives';
import { ScreenHeader, SectionTitle } from '@/ui/product-shell';
import { semanticColors, typography } from '@/ui/theme';

const METRICS = [
  { label: 'Net P&L', value: '—' },
  { label: 'Win rate', value: '—' },
  { label: 'ROI', value: '—' },
] as const;

export default function StatsScreen() {
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="PERFORMANCE"
          subtitle="A structured view of the decisions already recorded in Tracker."
          title="Stats"
        />

        <View accessibilityLabel="Performance metrics unavailable" style={styles.metricGrid}>
          {METRICS.map((metric) => (
            <BroadcastPanel key={metric.label} style={styles.metricCard}>
              <Text style={styles.metricLabel}>{metric.label}</Text>
              <BroadcastDataValue>{metric.value}</BroadcastDataValue>
            </BroadcastPanel>
          ))}
        </View>

        <SectionTitle detail="Coming next" title="Analytics" />
        <BroadcastPanel style={styles.placeholderCard}>
          <View style={styles.chartBars}>
            {[35, 58, 42, 74, 62, 86].map((height, index) => (
              <View key={index} style={[styles.chartBar, { height }]} />
            ))}
          </View>
          <Text style={styles.placeholderTitle}>Performance analytics is being prepared</Text>
          <Text style={styles.placeholderText}>
            Future versions will summarize results by sport, market, bookmaker, and time period.
          </Text>
        </BroadcastPanel>

        <View style={styles.readOnlyNotice}>
          <BroadcastStatus label="Read-only placeholder" status="neutral" />
          <Text style={styles.readOnlyTitle}>No calculations are estimated</Text>
          <Text style={styles.readOnlyText}>
            This screen intentionally shows placeholders until the mobile analytics read model is approved.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.night, flex: 1 },
  content: { gap: 20, padding: 16, paddingBottom: 32 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: {
    flexBasis: 92,
    flexGrow: 1,
    gap: 8,
    minHeight: 92,
    padding: 14,
  },
  metricLabel: { color: semanticColors.textQuiet, ...typography.metadataPreferred, fontWeight: '800' },
  placeholderCard: {
    alignItems: 'center',
    gap: 10,
    padding: 18,
  },
  chartBars: { alignItems: 'flex-end', flexDirection: 'row', gap: 8, height: 90 },
  chartBar: { backgroundColor: semanticColors.borderStrong, borderRadius: 2, width: 22 },
  placeholderTitle: { color: semanticColors.textPrimary, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  placeholderText: { color: semanticColors.textMuted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  readOnlyNotice: { backgroundColor: semanticColors.fieldRaised, borderColor: semanticColors.borderStrong, borderWidth: 1, gap: 8, padding: 14 },
  readOnlyTitle: { color: semanticColors.textPrimary, fontSize: 13, fontWeight: '800' },
  readOnlyText: { color: semanticColors.textQuietRaised, fontSize: 12, lineHeight: 18 },
});
