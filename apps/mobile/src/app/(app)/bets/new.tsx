import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  const nextLegId = useRef(2);
  const [draft, setDraft] = useState<TrackerDraft>({
    bookmaker: '',
    legs: [emptyTrackerLeg('leg-1')],
    notes: '',
    stake: '',
    totalOdds: '',
  });
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
            <Text style={styles.eyebrow}>TRACKER DRAFT</Text>
            <Text style={styles.title}>Build the coupon leg by leg</Text>
            <Text style={styles.subtitle}>
              Review everything locally. This form does not create a financial record yet.
            </Text>
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
            <Pressable
              accessibilityLabel="Add another leg"
              accessibilityRole="button"
              accessibilityState={{ disabled: draft.legs.length >= MAX_DRAFT_LEGS }}
              disabled={draft.legs.length >= MAX_DRAFT_LEGS}
              onPress={addLeg}
              style={({ pressed }) => [
                styles.addButton,
                draft.legs.length >= MAX_DRAFT_LEGS ? styles.disabled : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.addButtonText}>+ Add leg</Text>
            </Pressable>
          </View>

          {draft.legs.map((leg, index) => (
            <View key={leg.id} style={styles.legCard}>
              <View style={styles.legHeading}>
                <View style={styles.legNumber}>
                  <Text style={styles.legNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.legTitle}>Leg {index + 1}</Text>
                {draft.legs.length > 1 ? (
                  <Pressable
                    accessibilityLabel={`Remove leg ${index + 1}`}
                    accessibilityRole="button"
                    onPress={() => removeLeg(leg.id)}
                    style={({ pressed }) => [styles.removeButton, pressed ? styles.pressed : null]}
                  >
                    <Text style={styles.removeButtonText}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>

              <Text style={styles.fieldLabel}>Sport</Text>
              <View style={styles.sports}>
                {TRACKER_SPORTS.map((sport) => (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: leg.sport === sport }}
                    key={sport}
                    onPress={() => editLeg(leg.id, { sport })}
                    style={({ pressed }) => [
                      styles.sportChip,
                      leg.sport === sport ? styles.sportChipSelected : null,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <Text style={[styles.sportText, leg.sport === sport ? styles.sportTextSelected : null]}>
                      {SPORT_LABELS[sport]}
                    </Text>
                  </Pressable>
                ))}
              </View>

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
            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              style={({ pressed }) => [styles.secondaryButton, pressed ? styles.pressed : null]}
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={reviewBet}
              style={({ pressed }) => [styles.primaryButton, pressed ? styles.pressed : null]}
            >
              <Text style={styles.primaryButtonText}>Review bet</Text>
            </Pressable>
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
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.segmentButton,
        selected ? styles.segmentButtonSelected : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <Text style={[styles.segmentText, selected ? styles.segmentTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { gap: 16, padding: 16, paddingBottom: 36 },
  intro: { gap: 5 },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: colors.text, fontSize: 23, fontWeight: '800', lineHeight: 29 },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  segmented: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  segmentButton: { alignItems: 'center', borderRadius: 8, flex: 1, justifyContent: 'center', minHeight: 44 },
  segmentButtonSelected: { backgroundColor: colors.surfaceRaised },
  segmentText: { color: colors.muted, fontSize: 14, fontWeight: '800' },
  segmentTextSelected: { color: colors.accent },
  legsHeader: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  sectionTitle: { color: colors.secondaryText, fontSize: 13, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  sectionHint: { color: colors.placeholder, fontSize: 11, marginTop: 2 },
  addButton: { alignItems: 'center', borderColor: colors.accent, borderRadius: 9, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 14 },
  addButtonText: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, gap: 14, padding: 15 },
  legCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, gap: 13, padding: 15 },
  legHeading: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  legNumber: { alignItems: 'center', backgroundColor: colors.surfaceRaised, borderRadius: 999, height: 32, justifyContent: 'center', width: 32 },
  legNumberText: { color: colors.accent, fontSize: 12, fontWeight: '900' },
  legTitle: { color: colors.text, flex: 1, fontSize: 16, fontWeight: '800' },
  removeButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 5 },
  removeButtonText: { color: colors.danger, fontSize: 12, fontWeight: '800' },
  sports: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  sportChip: { borderColor: colors.border, borderRadius: 999, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 10 },
  sportChipSelected: { backgroundColor: colors.surfaceRaised, borderColor: colors.accent },
  sportText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  sportTextSelected: { color: colors.accent },
  field: { gap: 6 },
  fieldLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  input: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 10, borderWidth: 1, color: colors.text, fontSize: 14, minHeight: 46, paddingHorizontal: 12, paddingVertical: 10 },
  multilineInput: { minHeight: 92, textAlignVertical: 'top' },
  expressCard: { backgroundColor: colors.surface, borderColor: colors.accent, borderRadius: 16, borderWidth: 1, gap: 12, padding: 15 },
  previewRow: { alignItems: 'baseline', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  previewLabel: { color: colors.muted, fontSize: 12 },
  previewValue: { color: colors.accent, fontSize: 18, fontWeight: '900' },
  previewHint: { color: colors.placeholder, fontSize: 10, lineHeight: 15 },
  feedback: { borderRadius: 10, borderWidth: 1, padding: 13 },
  feedbackError: { backgroundColor: colors.surface, borderColor: colors.danger },
  feedbackSuccess: { backgroundColor: colors.surface, borderColor: colors.success },
  feedbackErrorText: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  feedbackSuccessText: { color: colors.success, fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.accent, borderColor: colors.accent, borderRadius: 10, borderWidth: 1, flexBasis: 140, flexGrow: 1, justifyContent: 'center', minHeight: 48, paddingHorizontal: 16 },
  primaryButtonText: { color: colors.background, fontSize: 14, fontWeight: '900' },
  secondaryButton: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 10, borderWidth: 1, flexBasis: 110, flexGrow: 1, justifyContent: 'center', minHeight: 48, paddingHorizontal: 16 },
  secondaryButtonText: { color: colors.secondaryText, fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
});
