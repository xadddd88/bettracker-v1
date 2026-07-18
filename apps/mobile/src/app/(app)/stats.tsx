import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader, SectionTitle } from '@/ui/product-shell';
import { colors } from '@/ui/theme';

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

        <View style={styles.metricGrid}>
          {METRICS.map((metric) => (
            <View key={metric.label} style={styles.metricCard}>
              <Text style={styles.metricLabel}>{metric.label}</Text>
              <Text style={styles.metricValue}>{metric.value}</Text>
            </View>
          ))}
        </View>

        <SectionTitle detail="Coming next" title="Analytics" />
        <View style={styles.placeholderCard}>
          <View style={styles.chartBars}>
            {[35, 58, 42, 74, 62, 86].map((height, index) => (
              <View key={index} style={[styles.chartBar, { height }]} />
            ))}
          </View>
          <Text style={styles.placeholderTitle}>Performance analytics is being prepared</Text>
          <Text style={styles.placeholderText}>
            Future versions will summarize results by sport, market, bookmaker, and time period.
          </Text>
        </View>

        <View style={styles.readOnlyNotice}>
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
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { gap: 20, padding: 16, paddingBottom: 32 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: 92,
    flexGrow: 1,
    gap: 8,
    minHeight: 92,
    padding: 14,
  },
  metricLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  metricValue: { color: colors.text, fontSize: 24, fontWeight: '800' },
  placeholderCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    padding: 18,
  },
  chartBars: { alignItems: 'flex-end', flexDirection: 'row', gap: 8, height: 90 },
  chartBar: { backgroundColor: colors.accent, borderRadius: 4, opacity: 0.45, width: 22 },
  placeholderTitle: { color: colors.text, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  placeholderText: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  readOnlyNotice: { backgroundColor: colors.surfaceRaised, borderRadius: 12, gap: 5, padding: 14 },
  readOnlyTitle: { color: colors.secondaryText, fontSize: 13, fontWeight: '800' },
  readOnlyText: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
