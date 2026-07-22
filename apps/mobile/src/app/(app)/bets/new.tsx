import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
  emptyTrackerDraft,
  emptyTrackerLeg,
  MAX_DRAFT_LEGS,
  TRACKER_SPORTS,
  type TrackerDraft,
  type TrackerDraftPayload,
  type TrackerLegDraft,
  type TrackerSport,
  validateTrackerDraft,
} from '@/bets/draft';
import { clearScannerDraftHandoff, peekScannerDraftHandoff } from '@/bets/scanner-draft-handoff';
import { saveTrackedBet } from '@/bets/save';
import {
  beginSubmit,
  createSubmitIntent,
  fingerprintPayload,
  resolveSubmit,
  type SubmitIntent,
} from '@/bets/submit-intent';
import { BroadcastButton, BroadcastPanel, BroadcastStatus } from '@/ui/broadcast-noir-primitives';
import { semanticColors, typography } from '@/ui/theme';

type Feedback = { message: string; tone: 'error' | 'review' };

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
  const [initialHandoff] = useState(() => peekScannerDraftHandoff());
  const nextLegId = useRef((initialHandoff?.draft.legs.length ?? 1) + 1);
  const intentRef = useRef<SubmitIntent>(createSubmitIntent());
  const savingRef = useRef(false);
  const [draft, setDraft] = useState<TrackerDraft>(() => initialHandoff?.draft ?? emptyTrackerDraft());
  const [feedback, setFeedback] = useState<Feedback | null>(() => initialHandoff
    ? {
        message: initialHandoff.needsReview
          ? 'Needs review: scanner fields are incomplete. Fill the missing values before Review.'
          : 'Scanner draft imported. Review every editable field before saving.',
        tone: 'review',
      }
    : null);
  const [reviewedPayload, setReviewedPayload] = useState<TrackerDraftPayload | null>(null);
  const [saving, setSaving] = useState(false);
  const express = draft.legs.length > 1;
  const previewOdds = computeDraftExpressOdds(draft.legs);

  useEffect(() => {
    if (initialHandoff) clearScannerDraftHandoff(initialHandoff);
  }, [initialHandoff]);

  function markEdited() {
    setFeedback(null);
    setReviewedPayload(null);
  }

  function editDraft(patch: Partial<TrackerDraft>) {
    markEdited();
    setDraft((current) => ({ ...current, ...patch }));
  }

  function editLeg(id: string, patch: Partial<TrackerLegDraft>) {
    markEdited();
    setDraft((current) => ({
      ...current,
      legs: current.legs.map((leg) => (leg.id === id ? { ...leg, ...patch } : leg)),
    }));
  }

  function selectSingle() {
    if (!express) return;
    markEdited();
    setDraft((current) => ({ ...current, legs: current.legs.slice(0, 1), totalOdds: '' }));
  }

  function selectExpress() {
    if (!express) addLeg();
  }

  function addLeg() {
    markEdited();
    setDraft((current) => {
      if (current.legs.length >= MAX_DRAFT_LEGS) return current;
      const id = `leg-${nextLegId.current++}`;
      const sport = current.legs.at(-1)?.sport ?? 'soccer';
      return { ...current, legs: [...current.legs, emptyTrackerLeg(id, sport)] };
    });
  }

  function removeLeg(id: string) {
    markEdited();
    setDraft((current) => {
      if (current.legs.length <= 1) return current;
      const legs = current.legs.filter((leg) => leg.id !== id);
      return { ...current, legs, totalOdds: legs.length === 1 ? '' : current.totalOdds };
    });
  }

  function reviewBet() {
    const validation = validateTrackerDraft(draft);
    if (!validation.ok) {
      setReviewedPayload(null);
      setFeedback({ message: validation.issues[0]?.message ?? 'Check the bet details.', tone: 'error' });
      return;
    }

    setReviewedPayload(validation.payload);
    setFeedback({
      message: 'Draft checked. Review the coupon once more, then press Save bet.',
      tone: 'review',
    });
  }

  async function saveBet() {
    if (!reviewedPayload || savingRef.current) return;

    const fingerprint = fingerprintPayload(reviewedPayload);
    const begin = beginSubmit(intentRef.current, fingerprint, randomUUID);
    intentRef.current = begin.intent;
    if (!begin.ok) {
      setFeedback({
        message: begin.reason === 'conflict_unchanged'
          ? 'This unchanged draft conflicts with an earlier save. Edit it before starting a new intent.'
          : 'Saving is already in progress.',
        tone: 'error',
      });
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setFeedback({ message: 'Saving this reviewed draft…', tone: 'review' });

    const result = await saveTrackedBet(reviewedPayload, begin.key);
    if (result.ok) {
      intentRef.current = resolveSubmit(intentRef.current, 'success');
      router.replace({ pathname: '/(app)/bets/[id]', params: { id: result.betId } });
      return;
    }

    intentRef.current = resolveSubmit(intentRef.current, result.code === 'conflict' ? 'conflict' : 'retryable');
    setFeedback({ message: result.message, tone: 'error' });
    savingRef.current = false;
    setSaving(false);
  }

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={88}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BroadcastPanel style={styles.intro}>
            <Text style={styles.eyebrow}>TRACKER · EDITABLE DRAFT</Text>
            <Text maxFontSizeMultiplier={1.6} style={styles.title}>Add bet</Text>
            <Text style={styles.subtitle}>
              Enter the coupon exactly as shown. Review comes first; Save is a separate explicit action.
            </Text>
          </BroadcastPanel>

          <View accessibilityLabel="Bet type" accessibilityRole="radiogroup" style={styles.segmented}>
            <SegmentButton label="Single" onPress={selectSingle} selected={!express} />
            <SegmentButton label="Express" onPress={selectExpress} selected={express} />
          </View>

          <View style={styles.legsHeader}>
            <View>
              <Text style={styles.sectionTitle}>COUPON LEGS</Text>
              <Text style={styles.sectionHint}>{draft.legs.length} of {MAX_DRAFT_LEGS}</Text>
            </View>
            <BroadcastButton
              accessibilityLabel="Add another leg"
              disabled={draft.legs.length >= MAX_DRAFT_LEGS || saving}
              label="+ Add leg"
              onPress={addLeg}
              tone="secondary"
            />
          </View>

          {draft.legs.map((leg, index) => (
            <BroadcastPanel accessibilityLabel={`Leg ${index + 1}`} key={leg.id} style={styles.legCard}>
              <View style={styles.legHeading}>
                <Text style={styles.legNumber}>{String(index + 1).padStart(2, '0')}</Text>
                <Text style={styles.legTitle}>LEG {index + 1}</Text>
                {draft.legs.length > 1 ? (
                  <BroadcastButton
                    accessibilityLabel={`Remove leg ${index + 1}`}
                    disabled={saving}
                    label="Remove"
                    onPress={() => removeLeg(leg.id)}
                    tone="destructive"
                  />
                ) : null}
              </View>

              <Text style={styles.fieldLabel}>SPORT</Text>
              <ScrollView contentContainerStyle={styles.sports} horizontal showsHorizontalScrollIndicator={false}>
                {TRACKER_SPORTS.map((sport) => (
                  <Pressable
                    accessibilityLabel={SPORT_LABELS[sport]}
                    accessibilityRole="radio"
                    accessibilityState={{ disabled: saving, selected: leg.sport === sport }}
                    disabled={saving}
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
              </ScrollView>

              <DraftInput disabled={saving} label="Event" maxLength={200} onChangeText={(eventName) => editLeg(leg.id, { eventName })} placeholder="Team A — Team B" value={leg.eventName} />
              <DraftInput disabled={saving} label="Market" maxLength={100} onChangeText={(marketType) => editLeg(leg.id, { marketType })} placeholder="Match result, total, handicap…" value={leg.marketType} />
              <DraftInput disabled={saving} label="Selection (optional)" maxLength={200} onChangeText={(selection) => editLeg(leg.id, { selection })} placeholder="Your pick" value={leg.selection} />
              <DraftInput disabled={saving} inputMode="decimal" label="Leg odds" onChangeText={(odds) => editLeg(leg.id, { odds })} placeholder="1.85" value={leg.odds} />
            </BroadcastPanel>
          ))}

          {express ? (
            <BroadcastPanel style={styles.card}>
              <Text style={styles.sectionTitle}>EXPRESS TOTAL</Text>
              <DraftInput disabled={saving} inputMode="decimal" label="Total Express odds" onChangeText={(totalOdds) => editDraft({ totalOdds })} placeholder="4.10" value={draft.totalOdds} />
              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>Leg product preview</Text>
                <Text style={styles.previewValue}>{previewOdds?.toFixed(3) ?? '—'}</Text>
              </View>
              <Text style={styles.previewHint}>Preview only. The total you enter remains authoritative.</Text>
            </BroadcastPanel>
          ) : null}

          <BroadcastPanel style={styles.card}>
            <Text style={styles.sectionTitle}>BET DETAILS</Text>
            <DraftInput disabled={saving} inputMode="decimal" label="Stake" onChangeText={(stake) => editDraft({ stake })} placeholder="25.00" value={draft.stake} />
            <DraftInput disabled={saving} label="Bookmaker (optional)" maxLength={100} onChangeText={(bookmaker) => editDraft({ bookmaker })} placeholder="Bookmaker" value={draft.bookmaker} />
            <DraftInput disabled={saving} label="Notes (optional)" maxLength={500} multiline onChangeText={(notes) => editDraft({ notes })} placeholder="Context for this decision" value={draft.notes} />
          </BroadcastPanel>

          {feedback ? (
            <BroadcastPanel accessibilityLiveRegion="polite" role={feedback.tone === 'error' ? 'alert' : undefined} style={styles.feedback}>
              <BroadcastStatus label={feedback.tone === 'error' ? 'Needs attention' : saving ? 'Saving' : 'Ready to save'} status={feedback.tone === 'error' ? 'negative' : 'review'} />
              <Text style={feedback.tone === 'error' ? styles.feedbackError : styles.feedbackReview}>{feedback.message}</Text>
            </BroadcastPanel>
          ) : null}

          <View style={styles.actions}>
            <BroadcastButton disabled={saving} label="Cancel" onPress={() => router.back()} style={styles.action} tone="secondary" />
            {reviewedPayload ? (
              <BroadcastButton disabled={saving} label={saving ? 'Saving…' : 'Save bet'} onPress={() => void saveBet()} style={styles.action} />
            ) : (
              <BroadcastButton disabled={saving} label="Review bet" onPress={reviewBet} style={styles.action} />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type DraftInputProps = {
  disabled?: boolean;
  inputMode?: 'decimal' | 'text';
  label: string;
  maxLength?: number;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
};

function DraftInput({ disabled, inputMode = 'text', label, maxLength, multiline = false, onChangeText, placeholder, value }: DraftInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <TextInput
        accessibilityLabel={label}
        editable={!disabled}
        inputMode={inputMode}
        maxLength={maxLength}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={semanticColors.textQuiet}
        style={[styles.input, multiline ? styles.multilineInput : null, disabled ? styles.disabled : null]}
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
      style={({ pressed }) => [styles.segmentButton, selected ? styles.segmentButtonSelected : null, pressed ? styles.pressed : null]}
    >
      <Text style={[styles.segmentText, selected ? styles.segmentTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.night, flex: 1 },
  flex: { flex: 1 },
  content: { gap: 12, padding: 14, paddingBottom: 34 },
  intro: { padding: 18 },
  eyebrow: { color: semanticColors.textQuietRaised, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  title: { color: semanticColors.textPrimary, fontSize: 43, fontWeight: '900', letterSpacing: -2.1, lineHeight: 48, marginTop: 8 },
  subtitle: { color: semanticColors.textMuted, fontSize: typography.bodyMobile.fontSize, lineHeight: typography.bodyMobile.lineHeight, marginTop: 8 },
  segmented: { borderColor: semanticColors.borderStrong, borderRadius: 8, borderWidth: 1, flexDirection: 'row', overflow: 'hidden' },
  segmentButton: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: Platform.OS === 'android' ? 48 : 44, paddingHorizontal: 14 },
  segmentButtonSelected: { backgroundColor: semanticColors.signal },
  segmentText: { color: semanticColors.textPrimary, fontSize: 12, fontWeight: '900' },
  segmentTextSelected: { color: semanticColors.onSignal },
  legsHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  sectionTitle: { color: semanticColors.textMuted, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  sectionHint: { color: semanticColors.textQuiet, fontSize: 11, marginTop: 4 },
  legCard: { gap: 14, padding: 16 },
  legHeading: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  legNumber: { color: semanticColors.dataValue, fontSize: 12, fontVariant: ['tabular-nums'], fontWeight: '900' },
  legTitle: { color: semanticColors.textPrimary, flex: 1, fontSize: 12, fontWeight: '900', letterSpacing: 0.7 },
  sports: { gap: 8, paddingRight: 8 },
  sportChip: { alignItems: 'center', borderColor: semanticColors.borderStrong, borderRadius: 8, borderWidth: 1, justifyContent: 'center', minHeight: Platform.OS === 'android' ? 48 : 44, paddingHorizontal: 13 },
  sportChipSelected: { backgroundColor: semanticColors.signal, borderColor: semanticColors.signal },
  sportText: { color: semanticColors.textMuted, fontSize: 12, fontWeight: '800' },
  sportTextSelected: { color: semanticColors.onSignal },
  card: { gap: 14, padding: 16 },
  field: { gap: 7 },
  fieldLabel: { color: semanticColors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  input: { backgroundColor: semanticColors.night, borderColor: semanticColors.borderStrong, borderRadius: 8, borderWidth: 1, color: semanticColors.textPrimary, fontSize: 15, minHeight: Platform.OS === 'android' ? 48 : 44, paddingHorizontal: 12, paddingVertical: 10 },
  multilineInput: { minHeight: 96, textAlignVertical: 'top' },
  disabled: { opacity: 0.55 },
  previewRow: { alignItems: 'center', borderTopColor: semanticColors.borderSubtle, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12 },
  previewLabel: { color: semanticColors.textMuted, fontSize: 12 },
  previewValue: { color: semanticColors.dataValue, fontSize: 16, fontVariant: ['tabular-nums'], fontWeight: '900' },
  previewHint: { color: semanticColors.textQuiet, fontSize: 11, lineHeight: 17 },
  feedback: { gap: 12, padding: 16 },
  feedbackError: { color: semanticColors.negative, fontSize: 13, lineHeight: 20 },
  feedbackReview: { color: semanticColors.review, fontSize: 13, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1 },
  pressed: { opacity: 0.78 },
});
