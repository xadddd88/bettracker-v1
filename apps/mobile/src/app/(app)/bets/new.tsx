import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { consumeScannerDraft } from '@/ai/scanner-draft';
import {
  computeDraftExpressOdds,
  emptyTrackerLeg,
  MAX_DRAFT_LEGS,
  TRACKER_SPORTS,
  type TrackerDraft,
  type TrackerLegDraft,
  type TrackerSport,
  validateTrackerDraft,
} from '@/bets/draft';
import { colors } from '@/ui/theme';
import { MotionPressable } from '@/ui/motion';
import { TimeWarpBackdrop, WarpRail } from '@/ui/time-warp';

type Feedback = { message: string; tone: 'error' | 'success' };

const SPORT_LABELS: Record<TrackerSport, string> = {
  basketball: 'Basketball',
  cs2: 'CS2',
  ice_hockey: 'Hockey',
  mma: 'MMA',
  other: 'Other',
  soccer: 'Soccer',
  tennis: 'Tennis',
};

export default function NewBetScreen() {
  const router = useRouter();
  const [draft, setDraft] = useState<TrackerDraft>(() => consumeScannerDraft() ?? ({
    bookmaker: '',
    legs: [emptyTrackerLeg('leg-1')],
    notes: '',
    stake: '',
    totalOdds: '',
  }));
  const nextLegId = useRef(draft.legs.length + 1);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const express = draft.legs.length > 1;
  const previewOdds = computeDraftExpressOdds(draft.legs);

  function editDraft(patch: Partial<TrackerDraft>) {
    setFeedback(null);
    setDraft((current) => ({ ...current, ...patch }));
  }

  function editLeg(id: string, patch: Partial<TrackerLegDraft>) {
    setFeedback(null);
    setDraft((current) => ({
      ...current,
      legs: current.legs.map((leg) => (leg.id === id ? { ...leg, ...patch } : leg)),
    }));
  }

  function selectSingle() {
    if (!express) return;
    setFeedback(null);
    setDraft((current) => ({ ...current, legs: current.legs.slice(0, 1), totalOdds: '' }));
  }

  function selectExpress() {
    if (express) return;
    addLeg();
  }

  function addLeg() {
    setFeedback(null);
    setDraft((current) => {
      if (current.legs.length >= MAX_DRAFT_LEGS) return current;
      const id = `leg-${nextLegId.current++}`;
      const sport = current.legs.at(-1)?.sport ?? 'soccer';
      return { ...current, legs: [...current.legs, emptyTrackerLeg(id, sport)] };
    });
  }

  function removeLeg(id: string) {
    setFeedback(null);
    setDraft((current) => {
      if (current.legs.length <= 1) return current;
      const legs = current.legs.filter((leg) => leg.id !== id);
      return { ...current, legs, totalOdds: legs.length === 1 ? '' : current.totalOdds };
    });
  }

  function reviewBet() {
    const validation = validateTrackerDraft(draft);
    if (!validation.ok) {
      setFeedback({ message: validation.issues[0]?.message ?? 'Check the bet details.', tone: 'error' });
      return;
    }

    setFeedback({
      message: 'Bet is valid. Secure saving will be enabled in the next phase.',
      tone: 'success',
    });
  }

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.safeArea}>
      <TimeWarpBackdrop />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={88}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.intro}>
            <WarpRail />
            <Text style={styles.eyebrow}>TRACKER</Text>
            <Text style={styles.title}>Add bet</Text>
            <Text style={styles.subtitle}>Enter the coupon exactly as it appears.</Text>
          </View>

          <View accessibilityLabel="Bet type" style={styles.segmented}>
            <SegmentButton label="Single" onPress={selectSingle} selected={!express} />
            <SegmentButton label="Express" onPress={selectExpress} selected={express} />
          </View>

          <View style={styles.legsHeader}>
            <View>
              <Text style={styles.sectionTitle}>Coupon legs</Text>
              <Text style={styles.sectionHint}>{draft.legs.length} of {MAX_DRAFT_LEGS}</Text>
            </View>
            <MotionPressable
              accessibilityLabel="Add another leg"
              accessibilityRole="button"
              accessibilityState={{ disabled: draft.legs.length >= MAX_DRAFT_LEGS }}
              disabled={draft.legs.length >= MAX_DRAFT_LEGS}
              glow="magenta"
              onPress={addLeg}
              style={[
                styles.addButton,
                draft.legs.length >= MAX_DRAFT_LEGS ? styles.disabled : null,
              ]}
            >
              <Text style={styles.addButtonText}>+ Add leg</Text>
            </MotionPressable>
          </View>

          {draft.legs.map((leg, index) => (
            <View key={leg.id} style={styles.legCard}>
              <View style={styles.legHeading}>
                <View style={styles.legNumber}>
                  <Text style={styles.legNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.legTitle}>Leg {index + 1}</Text>
                {draft.legs.length > 1 ? (
                  <MotionPressable
                    accessibilityLabel={`Remove leg ${index + 1}`}
                    accessibilityRole="button"
                    glow="none"
                    onPress={() => removeLeg(leg.id)}
                    style={styles.removeButton}
                  >
                    <Text style={styles.removeButtonText}>Remove</Text>
                  </MotionPressable>
                ) : null}
              </View>

              <Text style={styles.fieldLabel}>Sport</Text>
              <ScrollView
                contentContainerStyle={styles.sports}
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                {TRACKER_SPORTS.map((sport) => (
                  <MotionPressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: leg.sport === sport }}
                    glow="none"
                    key={sport}
                    onPress={() => editLeg(leg.id, { sport })}
                    style={[
                      styles.sportChip,
                      leg.sport === sport ? styles.sportChipSelected : null,
                    ]}
                  >
                    <Text style={[styles.sportText, leg.sport === sport ? styles.sportTextSelected : null]}>
                      {SPORT_LABELS[sport]}
                    </Text>
                  </MotionPressable>
                ))}
              </ScrollView>

              <DraftInput
                label="Event"
                maxLength={200}
                onChangeText={(eventName) => editLeg(leg.id, { eventName })}
                placeholder="Team A — Team B"
                value={leg.eventName}
              />
              <DraftInput
                label="Market"
                maxLength={100}
                onChangeText={(marketType) => editLeg(leg.id, { marketType })}
                placeholder="Match result, total, handicap…"
                value={leg.marketType}
              />
              <DraftInput
                label="Selection (optional)"
                maxLength={200}
                onChangeText={(selection) => editLeg(leg.id, { selection })}
                placeholder="Your pick"
                value={leg.selection}
              />
              <DraftInput
                inputMode="decimal"
                label="Leg odds"
                onChangeText={(odds) => editLeg(leg.id, { odds })}
                placeholder="1.85"
                value={leg.odds}
              />
            </View>
          ))}

          {express ? (
            <View style={styles.expressCard}>
              <DraftInput
                inputMode="decimal"
                label="Total Express odds"
                onChangeText={(totalOdds) => editDraft({ totalOdds })}
                placeholder="4.10"
                value={draft.totalOdds}
              />
              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>Leg product preview</Text>
                <Text style={styles.previewValue}>{previewOdds?.toFixed(3) ?? '—'}</Text>
              </View>
              <Text style={styles.previewHint}>Preview only. Your entered total remains authoritative.</Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Bet details</Text>
            <DraftInput
              inputMode="decimal"
              label="Stake"
              onChangeText={(stake) => editDraft({ stake })}
              placeholder="25.00"
              value={draft.stake}
            />
            <DraftInput
              label="Bookmaker (optional)"
              maxLength={100}
              onChangeText={(bookmaker) => editDraft({ bookmaker })}
              placeholder="Bookmaker"
              value={draft.bookmaker}
            />
            <DraftInput
              label="Notes (optional)"
              maxLength={500}
              multiline
              onChangeText={(notes) => editDraft({ notes })}
              placeholder="Context for this decision"
              value={draft.notes}
            />
          </View>

          {feedback ? (
            <View
              accessibilityLiveRegion="polite"
              role={feedback.tone === 'error' ? 'alert' : undefined}
              style={[styles.feedback, feedback.tone === 'error' ? styles.feedbackError : styles.feedbackSuccess]}
            >
              <Text style={feedback.tone === 'error' ? styles.feedbackErrorText : styles.feedbackSuccessText}>
                {feedback.message}
              </Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <MotionPressable
              accessibilityRole="button"
              glow="none"
              onPress={() => router.back()}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </MotionPressable>
            <MotionPressable
              accessibilityRole="button"
              onPress={reviewBet}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>Review bet</Text>
            </MotionPressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type DraftInputProps = {
  inputMode?: 'decimal' | 'text';
  label: string;
  maxLength?: number;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
};

function DraftInput({
  inputMode = 'text',
  label,
  maxLength,
  multiline = false,
  onChangeText,
  placeholder,
  value,
}: DraftInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        inputMode={inputMode}
        maxLength={maxLength}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        style={[styles.input, multiline ? styles.multilineInput : null]}
        value={value}
      />
    </View>
  );
}

function SegmentButton({ label, onPress, selected }: { label: string; onPress: () => void; selected: boolean }) {
  return (
    <MotionPressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      glow={selected ? 'cyan' : 'none'}
      onPress={onPress}
      style={[
        styles.segmentButton,
        selected ? styles.segmentButtonSelected : null,
      ]}
    >
      <Text style={[styles.segmentText, selected ? styles.segmentTextSelected : null]}>{label}</Text>
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { gap: 0, paddingBottom: 32 },
  intro: { borderBottomColor: colors.border, borderBottomWidth: 1, gap: 7, minHeight: 175, padding: 14, paddingTop: 24 },
  eyebrow: { color: colors.muted, fontSize: 8, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: colors.text, fontSize: 45, fontWeight: '900', letterSpacing: -2.3, lineHeight: 47 },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  segmented: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 0,
  },
  segmentButton: { alignItems: 'center', borderRightColor: colors.border, borderRightWidth: 1, flex: 1, justifyContent: 'center', minHeight: 58 },
  segmentButtonSelected: { backgroundColor: colors.accentMuted },
  segmentText: { color: colors.muted, fontSize: 14, fontWeight: '800' },
  segmentTextSelected: { color: colors.text },
  legsHeader: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', gap: 12, justifyContent: 'space-between', padding: 14 },
  sectionTitle: { color: colors.secondaryText, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  sectionHint: { color: colors.placeholder, fontSize: 11, marginTop: 2 },
  addButton: { alignItems: 'center', backgroundColor: colors.text, justifyContent: 'center', minHeight: 44, paddingHorizontal: 14 },
  addButtonText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  card: { backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, gap: 14, padding: 15 },
  legCard: { backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, gap: 13, padding: 15 },
  legHeading: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  legNumber: { alignItems: 'center', backgroundColor: colors.accentMuted, borderColor: colors.border, borderWidth: 1, height: 32, justifyContent: 'center', width: 32 },
  legNumberText: { color: colors.text, fontSize: 11, fontWeight: '900' },
  legTitle: { color: colors.text, flex: 1, fontSize: 16, fontWeight: '800' },
  removeButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 5 },
  removeButtonText: { color: colors.danger, fontSize: 12, fontWeight: '800' },
  sports: { gap: 7, paddingRight: 4 },
  sportChip: { borderColor: colors.border, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 10 },
  sportChipSelected: { backgroundColor: colors.accentMuted, borderColor: colors.border },
  sportText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  sportTextSelected: { color: colors.text },
  field: { gap: 6 },
  fieldLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  input: { backgroundColor: colors.background, borderBottomColor: colors.border, borderBottomWidth: 1, color: colors.text, fontSize: 14, minHeight: 46, paddingHorizontal: 0, paddingVertical: 10 },
  multilineInput: { minHeight: 92, textAlignVertical: 'top' },
  expressCard: { backgroundColor: colors.accentMuted, borderBottomColor: colors.border, borderBottomWidth: 1, gap: 12, padding: 15 },
  previewRow: { alignItems: 'baseline', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  previewLabel: { color: colors.muted, fontSize: 12 },
  previewValue: { color: colors.text, fontSize: 20, fontWeight: '900' },
  previewHint: { color: colors.placeholder, fontSize: 10, lineHeight: 15 },
  feedback: { borderBottomWidth: 1, borderTopWidth: 1, marginTop: 12, padding: 13 },
  feedbackError: { backgroundColor: colors.surface, borderColor: colors.danger },
  feedbackSuccess: { backgroundColor: colors.surface, borderColor: colors.success },
  feedbackErrorText: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  feedbackSuccessText: { color: colors.success, fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', flexWrap: 'wrap' },
  primaryButton: { alignItems: 'center', backgroundColor: colors.accent, borderColor: colors.accent, borderWidth: 1, flexBasis: 140, flexGrow: 1, justifyContent: 'center', minHeight: 56, paddingHorizontal: 16 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  secondaryButton: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, flexBasis: 110, flexGrow: 1, justifyContent: 'center', minHeight: 56, paddingHorizontal: 16 },
  secondaryButtonText: { color: colors.secondaryText, fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
});
