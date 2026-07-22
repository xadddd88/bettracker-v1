import { Image } from 'expo-image';
import { useNetworkState } from 'expo-network';
import { useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, ReduceMotion, StretchInX } from 'react-native-reanimated';

import { runWithCaptureLock } from '@/ai/capture-lock';
import { PreparedImageCacheLifecycle } from '@/ai/image-cache-lifecycle';
import { deleteGeneratedImage } from '@/ai/image-cache';
import { captureFromCamera, captureFromLibrary, type CaptureOutcome, type CaptureSource, type PreparedCapture } from '@/ai/image-capture';
import { analysisBodyByteLength, MAX_ANALYZE_JSON_BYTES, type CaptureMode } from '@/ai/image-policy';
import { scannerAnalysisToTrackerDraft, stageScannerDraft } from '@/ai/scanner-draft';
import { scanPreparedCoupon } from '@/ai/scanner-client';
import type { ScannerAnalysis } from '@/ai/scanner-model';
import { MotionPressable } from '@/ui/motion';
import { semanticColors } from '@/ui/theme';

const MESSAGES = {
  cameraDenied: 'Camera access is off. Allow it in device settings to take a photo.',
  cancelled: 'Selection cancelled. Current image unchanged.',
  corrupt: 'This image could not be prepared. Choose another image.',
  eventPending: 'Event analysis is not connected yet. Coupon scanning is available now.',
  offline: 'You are offline. Capture stays available, but Analyze waits for a connection.',
  oversize: 'This image is too large to prepare safely. Try a tighter crop or a lower-resolution image.',
  photosDenied: 'Photo access is off. Allow it in device settings to choose an image.',
} as const;

const MODE_OPTIONS: readonly { label: string; value: CaptureMode }[] = [
  { label: 'Coupon', value: 'coupon' },
  { label: 'Event', value: 'event' },
];
const CONTENT_PADDING_TOP = 10;

type Feedback = { canOpenSettings?: boolean; message: string; tone: 'error' | 'info' | 'success' };
type ActionButtonProps = { disabled?: boolean; icon: SymbolViewProps['name']; label: string; onPress: () => void; tone?: 'danger' | 'primary' | 'secondary' };

export default function AiCaptureScreen() {
  const networkState = useNetworkState();
  const router = useRouter();
  const safeAreaInsets = useSafeAreaInsets();
  const operationLockRef = useRef(false);
  const cacheLifecycleRef = useRef<PreparedImageCacheLifecycle | null>(null);
  if (cacheLifecycleRef.current === null) {
    cacheLifecycleRef.current = new PreparedImageCacheLifecycle(deleteGeneratedImage);
  }
  const [mode, setMode] = useState<CaptureMode>('coupon');
  const [prepared, setPrepared] = useState<PreparedCapture | null>(null);
  const [operation, setOperation] = useState<'analyze' | 'capture' | null>(null);
  const [analysis, setAnalysis] = useState<ScannerAnalysis | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const busy = operation !== null;
  const offline = networkState.isConnected === false || networkState.isInternetReachable === false;
  const androidTopInset = Platform.OS === 'android' ? { paddingTop: CONTENT_PADDING_TOP + safeAreaInsets.top } : undefined;

  useEffect(() => () => cacheLifecycleRef.current?.clear(), []);

  function replacePrepared(nextPrepared: PreparedCapture | null) {
    cacheLifecycleRef.current?.replace(nextPrepared?.uri ?? null);
    setPrepared(nextPrepared);
  }

  async function handleCapture(source: CaptureSource) {
    if (busy) return;
    const outcome = await runWithCaptureLock(operationLockRef, async (): Promise<CaptureOutcome> => {
      setOperation('capture');
      setFeedback(null);
      try {
        return source === 'camera' ? await captureFromCamera(mode) : await captureFromLibrary(mode);
      } catch {
        return { status: 'corrupt' };
      } finally {
        setOperation(null);
      }
    });
    if (outcome) applyOutcome(outcome);
  }

  function applyOutcome(outcome: CaptureOutcome) {
    switch (outcome.status) {
      case 'ready':
        replacePrepared(outcome.image);
        setAnalysis(null);
        setFeedback({ message: `${mode === 'coupon' ? 'Coupon' : 'Event'} image is ready.`, tone: 'success' });
        return;
      case 'cancelled': setFeedback({ message: MESSAGES.cancelled, tone: 'info' }); return;
      case 'permission-denied':
        setFeedback({ canOpenSettings: true, message: outcome.permission === 'camera' ? MESSAGES.cameraDenied : MESSAGES.photosDenied, tone: 'error' });
        return;
      case 'oversize': setFeedback({ message: MESSAGES.oversize, tone: 'error' }); return;
      case 'corrupt': setFeedback({ message: MESSAGES.corrupt, tone: 'error' });
    }
  }

  function selectMode(nextMode: CaptureMode) {
    if (busy || nextMode === mode) return;
    if (prepared) {
      const bodyBytes = analysisBodyByteLength(nextMode, prepared.base64);
      if (bodyBytes >= MAX_ANALYZE_JSON_BYTES) {
        replacePrepared(null);
        setFeedback({ message: MESSAGES.oversize, tone: 'error' });
      } else {
        setPrepared({ ...prepared, bodyBytes });
        setFeedback(null);
      }
    }
    setAnalysis(null);
    setMode(nextMode);
  }

  function showReplaceMenu() {
    if (busy) return;
    Alert.alert('Replace image', 'Choose a source.', [
      { text: 'Camera', onPress: () => void handleCapture('camera') },
      { text: 'Photo library', onPress: () => void handleCapture('library') },
      { style: 'cancel', text: 'Cancel' },
    ]);
  }
  function removeImage() {
    if (!busy) {
      replacePrepared(null);
      setAnalysis(null);
      setFeedback({ message: 'Image removed.', tone: 'info' });
    }
  }
  async function analyze() {
    if (!prepared || busy || offline) return;
    if (mode === 'event') {
      setAnalysis(null);
      setFeedback({ message: MESSAGES.eventPending, tone: 'info' });
      return;
    }

    const result = await runWithCaptureLock(operationLockRef, async () => {
      setOperation('analyze');
      setAnalysis(null);
      setFeedback({ message: 'Analyzing coupon securely…', tone: 'info' });
      try {
        return await scanPreparedCoupon(prepared);
      } catch {
        return { ok: false as const, message: 'Could not reach the scanner. Check your connection.' };
      } finally {
        setOperation(null);
      }
    });
    if (!result) return;

    if (result.ok) {
      setAnalysis(result.analysis);
      replacePrepared(null);
      setFeedback({ message: 'Coupon analysis is ready. Review every field before tracking.', tone: 'success' });
    } else {
      setFeedback({ message: result.message, tone: 'error' });
    }
  }
  function reviewInTracker() {
    if (!analysis) return;
    const draft = scannerAnalysisToTrackerDraft(analysis);
    if (!draft) {
      setFeedback({ message: 'Coupon could not be prepared as an editable draft.', tone: 'error' });
      return;
    }
    stageScannerDraft(draft);
    router.push('/(app)/bets/new');
  }
  async function openSettings() {
    try { await Linking.openSettings(); }
    catch { setFeedback({ message: 'Settings could not be opened. Open device settings manually.', tone: 'error' }); }
  }

  return (
    <ScrollView contentContainerStyle={[styles.content, androidTopInset]} contentInsetAdjustmentBehavior="automatic" style={styles.screen}>
      <View style={styles.masthead}>
        <Text style={styles.wordmark}>BETTRACKER</Text><Text style={styles.mastheadMeta}>AI CAPTURE / 02</Text>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroTopline}><Text style={styles.heroMeta}>AI / CAPTURE</Text><Text style={styles.heroMeta}>{offline ? 'OFFLINE' : 'READY'}</Text></View>
        <View style={styles.heroCopy}>
          <Text style={styles.title}>SCAN{`\n`}SCREENSHOT</Text>
          <Text style={styles.subtitle}>Prepare a coupon or event image, inspect the extracted fields, then choose whether to continue.</Text>
        </View>
      </View>

      <View accessibilityLabel="Capture type" style={styles.modeControl}>
        {MODE_OPTIONS.map((option, index) => (
          <MotionPressable
            accessibilityRole="radio"
            accessibilityState={{ selected: mode === option.value }}
            disabled={busy}
            key={option.value}
            onPress={() => selectMode(option.value)}
            style={[styles.modeOption, mode === option.value && styles.modeOptionSelected]}
          >
            <Text style={styles.modeIndex}>0{index + 1}</Text>
            <Text style={[styles.modeLabel, mode === option.value && styles.modeLabelSelected]}>{option.label.toUpperCase()}</Text>
          </MotionPressable>
        ))}
      </View>

      {offline ? <View accessibilityLiveRegion="polite" style={styles.offlineNotice}><Text style={styles.offlineLabel}>NO CONNECTION</Text><Text style={styles.offlineText}>{MESSAGES.offline}</Text></View> : null}

      <View style={styles.captureTool}>
        {prepared ? (
          <>
            <View style={styles.previewFrame}>
              <Image accessibilityLabel={`Prepared ${mode} screenshot`} cachePolicy="none" contentFit="contain" source={{ uri: prepared.uri }} style={{ height: '100%', width: '100%' }} />
              <View style={styles.previewStamp}><Text style={styles.previewStampText}>{mode.toUpperCase()} / JPEG</Text></View>
            </View>
            <View style={styles.preparedMeta}>
              <Text style={styles.metaPrimary}>IMAGE PREPARED</Text>
              <Text style={styles.metaSecondary}>{prepared.width} × {prepared.height}</Text>
              <Text style={styles.metaSecondary}>{(prepared.bodyBytes / 1_000_000).toFixed(2)} MB</Text>
            </View>
            <View style={styles.actionRow}>
              <ActionButton disabled={busy} icon={{ android: 'refresh', ios: 'arrow.triangle.2.circlepath', web: 'refresh' }} label="Replace" onPress={showReplaceMenu} />
              <ActionButton disabled={busy} icon={{ android: 'delete', ios: 'trash', web: 'delete' }} label="Remove" onPress={removeImage} tone="danger" />
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyTopline}><Text style={styles.emptyIndex}>CAPTURE / {mode.toUpperCase()}</Text><Text style={styles.emptyIndex}>JPG OUTPUT</Text></View>
            <Text style={styles.emptyPlus}>+</Text>
            <Text style={styles.emptyTitle}>ADD {mode === 'coupon' ? 'COUPON' : 'EVENT'} IMAGE</Text>
            <Text style={styles.emptyText}>Take a clear photo or choose an existing screenshot.</Text>
            <View style={styles.sourceActions}>
              <ActionButton disabled={busy} icon={{ android: 'camera_alt', ios: 'camera.fill', web: 'camera_alt' }} label="Take photo" onPress={() => void handleCapture('camera')} tone="primary" />
              <ActionButton disabled={busy} icon={{ android: 'photo_library', ios: 'photo.on.rectangle', web: 'photo_library' }} label="Choose photo" onPress={() => void handleCapture('library')} />
            </View>
          </View>
        )}
      </View>

      {busy ? <Animated.View entering={StretchInX.duration(320).reduceMotion(ReduceMotion.System)} style={styles.signalSweep} /> : null}
      {busy ? <View accessibilityLabel={operation === 'analyze' ? 'Analyzing coupon' : 'Preparing image'} style={styles.processing}><ActivityIndicator color={semanticColors.signal} /><Text style={styles.processingText}>{operation === 'analyze' ? 'ANALYZING COUPON' : 'PREPARING JPEG'}</Text></View> : null}
      {feedback ? (
        <View accessibilityLiveRegion="polite" role={feedback.tone === 'error' ? 'alert' : undefined} style={[styles.feedback, feedback.tone === 'error' && styles.feedbackError, feedback.tone === 'success' && styles.feedbackSuccess]}>
          <Text style={styles.feedbackLabel}>{feedback.tone.toUpperCase()}</Text>
          <Text style={styles.feedbackText}>{feedback.message}</Text>
          {feedback.canOpenSettings ? <ActionButton icon={{ android: 'settings', ios: 'gearshape', web: 'settings' }} label="Open settings" onPress={() => void openSettings()} /> : null}
        </View>
      ) : null}
      {analysis ? <AnalysisResultPanel analysis={analysis} onReview={reviewInTracker} /> : null}
      <View style={styles.safetyRule}><Text style={styles.safetyRuleText}>NO FINANCIAL RECORD IS SAVED AUTOMATICALLY</Text></View>
      <ActionButton disabled={!prepared || busy || offline} icon={{ android: 'auto_awesome', ios: 'sparkles', web: 'auto_awesome' }} label="Analyze" onPress={() => void analyze()} tone="primary" />
    </ScrollView>
  );
}

function AnalysisResultPanel({ analysis, onReview }: { analysis: ScannerAnalysis; onReview: () => void }) {
  const legs = analysis.legs.length > 0
    ? analysis.legs
    : [{ eventName: analysis.eventName, marketType: analysis.marketType, odds: analysis.totalOdds, selection: analysis.selection, sport: analysis.sport }];

  return (
    <Animated.View accessibilityLabel="Coupon analysis result" entering={FadeInDown.duration(360).reduceMotion(ReduceMotion.System)} style={styles.analysisPanel}>
      <View style={styles.analysisHeading}>
        <Text style={styles.analysisEyebrow}>EXTRACTED / REVIEW REQUIRED</Text>
        <Text style={styles.analysisCount}>{String(legs.length).padStart(2, '0')} LEG{legs.length === 1 ? '' : 'S'}</Text>
      </View>
      {legs.map((leg, index) => (
        <View key={`${index}-${leg.eventName ?? 'unknown'}`} style={styles.analysisLeg}>
          <Text style={styles.analysisLegIndex}>{String(index + 1).padStart(2, '0')}</Text>
          <View style={styles.analysisLegCopy}>
            <Text style={styles.analysisEvent}>{leg.eventName ?? 'UNRESOLVED EVENT'}</Text>
            <Text style={styles.analysisSelection}>{leg.selection ?? leg.marketType ?? 'SELECTION NOT READ'}</Text>
          </View>
          <Text style={styles.analysisOdds}>{leg.odds != null ? leg.odds.toFixed(2) : '—'}</Text>
        </View>
      ))}
      <View style={styles.analysisSummary}>
        <AnalysisMetric label="TOTAL ODDS" value={analysis.totalOdds != null ? analysis.totalOdds.toFixed(2) : '—'} />
        <AnalysisMetric label="STAKE" value={analysis.stake != null ? String(analysis.stake) : '—'} />
        <AnalysisMetric label="BOOKMAKER" value={analysis.bookmaker ?? '—'} />
      </View>
      <MotionPressable accessibilityLabel="Review coupon in Tracker" accessibilityRole="button" onPress={onReview} style={styles.reviewButton}>
        <Text style={styles.reviewButtonText}>REVIEW IN TRACKER</Text><Text style={styles.reviewButtonText}>→</Text>
      </MotionPressable>
    </Animated.View>
  );
}

function AnalysisMetric({ label, value }: { label: string; value: string }) {
  return <View style={styles.analysisMetric}><Text style={styles.analysisMetricLabel}>{label}</Text><Text numberOfLines={1} style={styles.analysisMetricValue}>{value}</Text></View>;
}

function ActionButton({ disabled = false, icon, label, onPress, tone = 'secondary' }: ActionButtonProps) {
  const primary = tone === 'primary';
  return (
    <MotionPressable accessibilityLabel={label} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.actionButton, primary && styles.actionButtonPrimary, tone === 'danger' && styles.actionButtonDanger, disabled && styles.disabled]}>
      <SymbolView fallback={<Text style={[styles.actionFallback, primary && styles.actionTextPrimary]}>+</Text>} name={icon} size={17} tintColor={primary ? semanticColors.onSignal : semanticColors.textPrimary} />
      <Text style={[styles.actionLabel, primary && styles.actionTextPrimary]}>{label.toUpperCase()}</Text><Text style={[styles.actionArrow, primary && styles.actionTextPrimary]}>→</Text>
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: semanticColors.night },
  content: { flexGrow: 1, paddingBottom: 28, paddingHorizontal: 16, paddingTop: 6 },
  masthead: { alignItems: 'center', borderBottomColor: semanticColors.borderStrong, borderBottomWidth: 1, flexDirection: 'row', minHeight: 64 },
  wordmark: { color: semanticColors.textPrimary, fontSize: 17, fontWeight: '900' },
  mastheadMeta: { color: semanticColors.textQuiet, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginLeft: 'auto' },
  hero: { backgroundColor: semanticColors.field, borderColor: semanticColors.borderStrong, borderWidth: 1, minHeight: 280, overflow: 'hidden', padding: 20 },
  heroTopline: { flexDirection: 'row', justifyContent: 'space-between' },
  heroMeta: { color: semanticColors.textQuietRaised, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  heroCopy: { flex: 1, justifyContent: 'flex-end', paddingBottom: 8 },
  title: { color: semanticColors.textPrimary, fontSize: 42, fontWeight: '900', lineHeight: 40 },
  subtitle: { color: semanticColors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 16, maxWidth: 300 },
  modeControl: { borderBottomColor: semanticColors.borderStrong, borderBottomWidth: 1, borderLeftColor: semanticColors.borderStrong, borderLeftWidth: 1, borderRightColor: semanticColors.borderStrong, borderRightWidth: 1, flexDirection: 'row' },
  modeOption: { backgroundColor: semanticColors.field, flex: 1, minHeight: 64, padding: 12 },
  modeOptionSelected: { backgroundColor: semanticColors.signal },
  modeIndex: { color: semanticColors.textQuietRaised, fontSize: 11, fontWeight: '700' },
  modeLabel: { color: semanticColors.textMuted, fontSize: 13, fontWeight: '900', marginTop: 'auto' },
  modeLabelSelected: { color: semanticColors.onSignal },
  offlineNotice: { backgroundColor: semanticColors.fieldRaised, borderColor: semanticColors.review, borderWidth: 1, padding: 14 },
  offlineLabel: { color: semanticColors.review, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  offlineText: { color: semanticColors.textPrimary, fontSize: 12, lineHeight: 18, marginTop: 6 },
  captureTool: { borderColor: semanticColors.borderStrong, borderTopWidth: 0, borderWidth: 1 },
  emptyState: { backgroundColor: semanticColors.night, minHeight: 340, padding: 18 },
  emptyTopline: { flexDirection: 'row', justifyContent: 'space-between' },
  emptyIndex: { color: semanticColors.textQuiet, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  emptyPlus: { color: semanticColors.signal, fontSize: 76, fontWeight: '300', lineHeight: 82, marginTop: 24 },
  emptyTitle: { color: semanticColors.textPrimary, fontSize: 25, fontWeight: '900' },
  emptyText: { color: semanticColors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 10 },
  sourceActions: { gap: 8, marginTop: 24 },
  previewFrame: { aspectRatio: 0.78, backgroundColor: semanticColors.night, maxHeight: 520, minHeight: 300, overflow: 'hidden', width: '100%' },
  previewStamp: { backgroundColor: semanticColors.fieldRaised, borderColor: semanticColors.borderStrong, borderWidth: 1, bottom: 10, left: 10, paddingHorizontal: 9, paddingVertical: 6, position: 'absolute' },
  previewStampText: { color: semanticColors.textPrimary, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  preparedMeta: { alignItems: 'baseline', backgroundColor: semanticColors.field, borderBottomColor: semanticColors.borderStrong, borderBottomWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 14 },
  metaPrimary: { color: semanticColors.textPrimary, flex: 1, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  metaSecondary: { color: semanticColors.textMuted, fontSize: 11 },
  actionRow: { flexDirection: 'row' },
  actionButton: { alignItems: 'center', backgroundColor: semanticColors.field, borderColor: semanticColors.borderStrong, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'flex-start', minHeight: 52, paddingHorizontal: 13 },
  actionButtonPrimary: { backgroundColor: semanticColors.signal, borderColor: semanticColors.signal },
  actionButtonDanger: { borderColor: semanticColors.negative },
  actionLabel: { color: semanticColors.textPrimary, fontSize: 11, fontWeight: '900', letterSpacing: 0.7 },
  actionTextPrimary: { color: semanticColors.onSignal },
  actionArrow: { color: semanticColors.textPrimary, fontSize: 16, marginLeft: 'auto' },
  actionFallback: { color: semanticColors.textPrimary, fontWeight: '900' },
  disabled: { opacity: 0.35 },
  signalSweep: { backgroundColor: semanticColors.signal, height: 3, transformOrigin: 'left' },
  processing: { alignItems: 'center', backgroundColor: semanticColors.field, borderBottomColor: semanticColors.borderStrong, borderBottomWidth: 1, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 52 },
  processingText: { color: semanticColors.textPrimary, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  feedback: { backgroundColor: semanticColors.field, borderBottomColor: semanticColors.borderStrong, borderBottomWidth: 1, gap: 6, padding: 14 },
  feedbackError: { borderLeftColor: semanticColors.negative, borderLeftWidth: 5 },
  feedbackSuccess: { borderLeftColor: semanticColors.success, borderLeftWidth: 5 },
  feedbackLabel: { color: semanticColors.textMuted, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  feedbackText: { color: semanticColors.textPrimary, fontSize: 12, lineHeight: 18 },
  safetyRule: { borderBottomColor: semanticColors.borderStrong, borderBottomWidth: 1, borderTopColor: semanticColors.borderStrong, borderTopWidth: 1, paddingVertical: 14 },
  safetyRuleText: { color: semanticColors.textQuiet, fontSize: 11, fontWeight: '800', letterSpacing: 0.7, textAlign: 'center' },
  analysisPanel: { backgroundColor: semanticColors.field, borderColor: semanticColors.borderStrong, borderWidth: 1 },
  analysisHeading: { alignItems: 'center', borderBottomColor: semanticColors.borderStrong, borderBottomWidth: 1, flexDirection: 'row', minHeight: 56, paddingHorizontal: 14 },
  analysisEyebrow: { color: semanticColors.review, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  analysisCount: { color: semanticColors.textMuted, fontSize: 11, fontWeight: '900', marginLeft: 'auto' },
  analysisLeg: { alignItems: 'center', borderBottomColor: semanticColors.borderSubtle, borderBottomWidth: 1, flexDirection: 'row', minHeight: 82, paddingHorizontal: 14, paddingVertical: 12 },
  analysisLegIndex: { color: semanticColors.textQuiet, fontSize: 11, width: 28 },
  analysisLegCopy: { flex: 1, minWidth: 0, paddingRight: 12 },
  analysisEvent: { color: semanticColors.textPrimary, fontSize: 13, fontWeight: '900', lineHeight: 18 },
  analysisSelection: { color: semanticColors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 5 },
  analysisOdds: { color: semanticColors.dataValue, fontSize: 18, fontWeight: '900' },
  analysisSummary: { flexDirection: 'row', flexWrap: 'wrap', padding: 14 },
  analysisMetric: { flex: 1, minWidth: 84 },
  analysisMetricLabel: { color: semanticColors.textQuietRaised, fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  analysisMetricValue: { color: semanticColors.dataValue, fontSize: 12, fontWeight: '800', marginTop: 5 },
  reviewButton: { alignItems: 'center', backgroundColor: semanticColors.signal, flexDirection: 'row', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: 14 },
  reviewButtonText: { color: semanticColors.onSignal, fontSize: 12, fontWeight: '900' },
});
