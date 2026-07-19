import { Image } from 'expo-image';
import { useNetworkState } from 'expo-network';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { runWithCaptureLock } from '@/ai/capture-lock';
import { captureFromCamera, captureFromLibrary, type CaptureOutcome, type CaptureSource, type PreparedCapture } from '@/ai/image-capture';
import { analysisBodyByteLength, MAX_ANALYZE_JSON_BYTES, type CaptureMode } from '@/ai/image-policy';
import { MotionPressable } from '@/ui/motion';
import { colors } from '@/ui/theme';
import { EditorialBackdrop, EditorialRule, KineticType } from '@/ui/time-warp';

const MESSAGES = {
  cameraDenied: 'Camera access is off. Allow it in device settings to take a photo.',
  cancelled: 'Selection cancelled. Current image unchanged.',
  connectionPending: 'Secure AI connection is being prepared',
  corrupt: 'This image could not be prepared. Choose another image.',
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
  const safeAreaInsets = useSafeAreaInsets();
  const captureLockRef = useRef(false);
  const [mode, setMode] = useState<CaptureMode>('coupon');
  const [prepared, setPrepared] = useState<PreparedCapture | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const offline = networkState.isConnected === false || networkState.isInternetReachable === false;
  const androidTopInset = Platform.OS === 'android' ? { paddingTop: CONTENT_PADDING_TOP + safeAreaInsets.top } : undefined;

  async function handleCapture(source: CaptureSource) {
    if (busy) return;
    const outcome = await runWithCaptureLock(captureLockRef, async (): Promise<CaptureOutcome> => {
      setBusy(true);
      setFeedback(null);
      try {
        return source === 'camera' ? await captureFromCamera(mode) : await captureFromLibrary(mode);
      } catch {
        return { status: 'corrupt' };
      } finally {
        setBusy(false);
      }
    });
    if (outcome) applyOutcome(outcome);
  }

  function applyOutcome(outcome: CaptureOutcome) {
    switch (outcome.status) {
      case 'ready':
        setPrepared(outcome.image);
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
      if (bodyBytes > MAX_ANALYZE_JSON_BYTES) {
        setPrepared(null);
        setFeedback({ message: MESSAGES.oversize, tone: 'error' });
      } else {
        setPrepared({ ...prepared, bodyBytes });
        setFeedback(null);
      }
    }
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
  function removeImage() { if (!busy) { setPrepared(null); setFeedback({ message: 'Image removed.', tone: 'info' }); } }
  function analyze() { if (prepared && !busy && !offline) setFeedback({ message: MESSAGES.connectionPending, tone: 'info' }); }
  async function openSettings() {
    try { await Linking.openSettings(); }
    catch { setFeedback({ message: 'Settings could not be opened. Open device settings manually.', tone: 'error' }); }
  }

  return (
    <ScrollView contentContainerStyle={[styles.content, androidTopInset]} contentInsetAdjustmentBehavior="automatic" style={styles.screen}>
      <Animated.View entering={FadeInDown.duration(380).reduceMotion(ReduceMotion.System)} style={styles.masthead}>
        <Text style={styles.wordmark}>XADDD</Text><Text style={styles.mastheadMeta}>AI CAPTURE / 02</Text>
      </Animated.View>

      <Animated.View entering={FadeIn.duration(420).reduceMotion(ReduceMotion.System)} style={styles.hero}>
        <EditorialBackdrop dark />
        <KineticType label="SCAN" reverse />
        <View style={styles.heroTopline}><Text style={styles.heroMeta}>LOCAL PREPARATION</Text><Text style={styles.heroMeta}>{offline ? 'OFFLINE' : 'READY'}</Text></View>
        <View style={styles.heroCopy}>
          <Text style={styles.title}>SCAN{`\n`}SCREENSHOT</Text>
          <Text style={styles.subtitle}>Scan screenshot. Prepare evidence for a coupon or an event before analysis.</Text>
        </View>
      </Animated.View>

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

      <Animated.View entering={FadeInDown.delay(80).duration(420).reduceMotion(ReduceMotion.System)} style={styles.captureTool}>
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
      </Animated.View>

      {busy ? <View accessibilityLabel="Preparing image" style={styles.processing}><ActivityIndicator color={colors.text} /><Text style={styles.processingText}>PREPARING JPEG</Text></View> : null}
      {feedback ? (
        <View accessibilityLiveRegion="polite" role={feedback.tone === 'error' ? 'alert' : undefined} style={[styles.feedback, feedback.tone === 'error' && styles.feedbackError, feedback.tone === 'success' && styles.feedbackSuccess]}>
          <Text style={styles.feedbackLabel}>{feedback.tone.toUpperCase()}</Text>
          <Text style={styles.feedbackText}>{feedback.message}</Text>
          {feedback.canOpenSettings ? <ActionButton icon={{ android: 'settings', ios: 'gearshape', web: 'settings' }} label="Open settings" onPress={() => void openSettings()} /> : null}
        </View>
      ) : null}
      <EditorialRule label="NO FINANCIAL RECORD IS SAVED AUTOMATICALLY" />
      <ActionButton disabled={!prepared || busy || offline} icon={{ android: 'auto_awesome', ios: 'sparkles', web: 'auto_awesome' }} label="Analyze" onPress={analyze} tone="primary" />
    </ScrollView>
  );
}

function ActionButton({ disabled = false, icon, label, onPress, tone = 'secondary' }: ActionButtonProps) {
  const primary = tone === 'primary';
  return (
    <MotionPressable accessibilityLabel={label} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.actionButton, primary && styles.actionButtonPrimary, tone === 'danger' && styles.actionButtonDanger, disabled && styles.disabled]}>
      <SymbolView fallback={<Text style={[styles.actionFallback, primary && styles.actionTextPrimary]}>+</Text>} name={icon} size={17} tintColor={primary ? '#FFFFFF' : colors.text} />
      <Text style={[styles.actionLabel, primary && styles.actionTextPrimary]}>{label.toUpperCase()}</Text><Text style={[styles.actionArrow, primary && styles.actionTextPrimary]}>→</Text>
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background },
  content: { flexGrow: 1, paddingBottom: 24, paddingHorizontal: 14, paddingTop: 6 },
  masthead: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', minHeight: 42 },
  wordmark: { color: colors.text, fontSize: 15, fontWeight: '900' },
  mastheadMeta: { color: colors.muted, fontSize: 8, fontWeight: '700', letterSpacing: 1, marginLeft: 'auto' },
  hero: { backgroundColor: '#050505', height: 330, marginHorizontal: -14, overflow: 'hidden', padding: 16 },
  heroTopline: { flexDirection: 'row', justifyContent: 'space-between', zIndex: 2 },
  heroMeta: { color: '#FFFFFF', fontSize: 8, fontWeight: '700', letterSpacing: 1.1 },
  heroCopy: { flex: 1, justifyContent: 'flex-end', paddingBottom: 14, zIndex: 2 },
  title: { color: '#FFFFFF', fontSize: 47, fontWeight: '900', letterSpacing: -2.7, lineHeight: 43 },
  subtitle: { color: '#C9C9C4', fontSize: 11, lineHeight: 16, marginTop: 14, maxWidth: 270 },
  modeControl: { borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', marginHorizontal: -14 },
  modeOption: { backgroundColor: colors.surface, flex: 1, minHeight: 72, padding: 12 },
  modeOptionSelected: { backgroundColor: colors.accentMuted },
  modeIndex: { color: colors.muted, fontSize: 8 },
  modeLabel: { color: colors.muted, fontSize: 13, fontWeight: '900', marginTop: 'auto' },
  modeLabelSelected: { color: colors.text },
  offlineNotice: { backgroundColor: colors.warning, marginHorizontal: -14, padding: 13 },
  offlineLabel: { color: '#FFFFFF', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  offlineText: { color: '#FFFFFF', fontSize: 11, lineHeight: 16, marginTop: 5 },
  captureTool: { marginHorizontal: -14 },
  emptyState: { backgroundColor: colors.background, minHeight: 330, padding: 16 },
  emptyTopline: { flexDirection: 'row', justifyContent: 'space-between' },
  emptyIndex: { color: colors.muted, fontSize: 8, fontWeight: '700', letterSpacing: 0.8 },
  emptyPlus: { color: colors.text, fontSize: 92, fontWeight: '200', lineHeight: 100, marginTop: 24 },
  emptyTitle: { color: colors.text, fontSize: 25, fontWeight: '900', letterSpacing: -1 },
  emptyText: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 8 },
  sourceActions: { flexDirection: 'row', gap: 8, marginTop: 22 },
  previewFrame: { aspectRatio: 0.78, backgroundColor: '#050505', maxHeight: 520, minHeight: 300, overflow: 'hidden', width: '100%' },
  previewStamp: { backgroundColor: '#FFFFFF', bottom: 10, left: 10, paddingHorizontal: 9, paddingVertical: 6, position: 'absolute' },
  previewStampText: { color: '#050505', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  preparedMeta: { alignItems: 'baseline', borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', gap: 12, padding: 12 },
  metaPrimary: { color: colors.text, flex: 1, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  metaSecondary: { color: colors.muted, fontSize: 9 },
  actionRow: { flexDirection: 'row' },
  actionButton: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: colors.border, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'flex-start', minHeight: 52, paddingHorizontal: 13 },
  actionButtonPrimary: { backgroundColor: '#050505' },
  actionButtonDanger: { borderColor: colors.danger },
  actionLabel: { color: colors.text, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  actionTextPrimary: { color: '#FFFFFF' },
  actionArrow: { color: colors.text, fontSize: 16, marginLeft: 'auto' },
  actionFallback: { color: colors.text, fontWeight: '900' },
  disabled: { opacity: 0.35 },
  processing: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 52 },
  processingText: { color: colors.text, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  feedback: { borderBottomColor: colors.border, borderBottomWidth: 1, gap: 6, paddingVertical: 14 },
  feedbackError: { borderLeftColor: colors.danger, borderLeftWidth: 5, paddingLeft: 10 },
  feedbackSuccess: { borderLeftColor: colors.success, borderLeftWidth: 5, paddingLeft: 10 },
  feedbackLabel: { color: colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  feedbackText: { color: colors.secondaryText, fontSize: 12, lineHeight: 18 },
});
