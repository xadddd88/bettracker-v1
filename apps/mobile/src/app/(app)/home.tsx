import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionCard, ScreenHeader, SectionTitle } from '@/ui/product-shell';
import { colors } from '@/ui/theme';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="XADDD FOUNDER"
          subtitle="Capture, review, and track every betting decision in one place."
          title="Your workspace"
        />

        <View style={styles.hero}>
          <Text style={styles.heroKicker}>CORE WORKFLOW</Text>
          <Text style={styles.heroTitle}>From screenshot to a clean betting record</Text>
          <Text style={styles.heroText}>
            Start with AI capture, verify every leg, then keep the result in Tracker.
          </Text>
          <View style={styles.workflow}>
            <WorkflowStep index="1" label="Capture" />
            <View style={styles.workflowLine} />
            <WorkflowStep index="2" label="Review" />
            <View style={styles.workflowLine} />
            <WorkflowStep index="3" label="Track" />
          </View>
        </View>

        <SectionTitle detail="Your priorities" title="Quick actions" />
        <View style={styles.actions}>
          <ActionCard
            badge="Ready"
            description="Take a photo or choose a coupon or event screenshot."
            icon={{ android: 'auto_awesome', ios: 'sparkles', web: 'auto_awesome' }}
            label="Open AI Analyzer"
            onPress={() => router.push('/(app)/ai')}
            tone="accent"
          />
          <ActionCard
            description="Browse Single and Express bets with ordered coupon legs."
            icon={{ android: 'confirmation_number', ios: 'ticket.fill', web: 'confirmation_number' }}
            label="Open Tracker"
            onPress={() => router.push('/(app)/bets')}
          />
          <ActionCard
            badge="Local review"
            description="Prepare a Single or Express draft before secure saving is enabled."
            icon={{ android: 'add_circle', ios: 'plus.circle.fill', web: 'add_circle' }}
            label="Add bet"
            onPress={() => router.push('/(app)/bets/new')}
          />
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Founder build</Text>
          <Text style={styles.noticeText}>
            AI preparation and the new bet editor remain local-only in this phase. Existing tracked
            bets are read from your secured account.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function WorkflowStep({ index, label }: { index: string; label: string }) {
  return (
    <View style={styles.workflowStep}>
      <View style={styles.workflowNumber}>
        <Text style={styles.workflowNumberText}>{index}</Text>
      </View>
      <Text style={styles.workflowLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { gap: 20, padding: 16, paddingBottom: 32 },
  hero: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderCurve: 'continuous',
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    padding: 18,
  },
  heroKicker: { color: colors.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  heroTitle: { color: colors.text, fontSize: 20, fontWeight: '800', lineHeight: 26 },
  heroText: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  workflow: { alignItems: 'center', flexDirection: 'row', marginTop: 10 },
  workflowStep: { alignItems: 'center', gap: 6 },
  workflowNumber: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.accent,
    borderRadius: 999,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  workflowNumberText: { color: colors.accent, fontSize: 12, fontWeight: '900' },
  workflowLabel: { color: colors.secondaryText, fontSize: 11, fontWeight: '700' },
  workflowLine: { backgroundColor: colors.border, flex: 1, height: 1, marginHorizontal: 6, marginTop: -18 },
  actions: { gap: 10 },
  notice: {
    backgroundColor: colors.surface,
    borderLeftColor: colors.accent,
    borderLeftWidth: 3,
    borderRadius: 10,
    gap: 5,
    padding: 14,
  },
  noticeTitle: { color: colors.secondaryText, fontSize: 13, fontWeight: '800' },
  noticeText: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
