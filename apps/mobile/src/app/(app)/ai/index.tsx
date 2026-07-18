import { Image } from 'expo-image';
import { useNetworkState } from 'expo-network';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  captureFromCamera,
  captureFromLibrary,
  type CaptureOutcome,
  type CaptureSource,
  type PreparedCapture,
} from '@/ai/image-capture';
import { runWithCaptureLock } from '@/ai/capture-lock';
import {
  analysisBodyByteLength,
  MAX_ANALYZE_JSON_BYTES,
  type CaptureMode,
} from '@/ai/image-policy';
import { colors } from '@/ui/theme';

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

const CONTENT_PADDING_TOP = 16;

type Feedback = {
  canOpenSettings?: boolean;
  message: string;
  tone: 'error' | 'info' | 'success';
};

type ActionButtonProps = {
  disabled?: boolean;
  icon: SymbolViewProps['name'];
  label: string;
  onPress: () => void;
  tone?: 'danger' | 'primary' | 'secondary';
};

export default function AiCaptureScreen() {
  const networkState = useNetworkState();
  const safeAreaInsets = useSafeAreaInsets();
  const captureLockRef = useRef(false);
  const [mode, setMode] = useState<CaptureMode>('coupon');
  const [prepared, setPrepared] = useState<PreparedCapture | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const offline =
    networkState.isConnected === false || networkState.isInternetReachable === false;
  const androidTopInset =
    Platform.OS === 'android'
      ? { paddingTop: CONTENT_PADDING_TOP + safeAreaInsets.top }
      : undefined;

  async function handleCapture(source: CaptureSource) {
    if (busy) return;

    const outcome = await runWithCaptureLock(
      captureLockRef,
      async (): Promise<CaptureOutcome> => {
        setBusy(true);
        setFeedback(null);

        try {
          return source === 'camera'
            ? await captureFromCamera(mode)
            : await captureFromLibrary(mode);
        } catch {
          return { status: 'corrupt' };
        } finally {
          setBusy(false);
        }
      },
    );

    if (outcome) {
      applyOutcome(outcome);
    }
  }

  function applyOutcome(outcome: CaptureOutcome) {
    switch (outcome.status) {
      case 'ready':
        setPrepared(outcome.image);
        setFeedback({
          message: `${mode === 'coupon' ? 'Coupon' : 'Event'} image is ready.`,
          tone: 'success',
        });
        return;
      case 'cancelled':
        setFeedback({ message: MESSAGES.cancelled, tone: 'info' });
        return;
      case 'permission-denied':
        setFeedback({
          canOpenSettings: true,
          message: outcome.permission === 'camera' ? MESSAGES.cameraDenied : MESSAGES.photosDenied,
          tone: 'error',
        });
        return;
      case 'oversize':
        setFeedback({ message: MESSAGES.oversize, tone: 'error' });
        return;
      case 'corrupt':
        setFeedback({ message: MESSAGES.corrupt, tone: 'error' });
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

  function removeImage() {
    if (busy) return;
    setPrepared(null);
    setFeedback({ message: 'Image removed.', tone: 'info' });
  }

  function analyze() {
    if (!prepared || busy || offline) return;
    setFeedback({ message: MESSAGES.connectionPending, tone: 'info' });
  }

  async function openSettings() {
    try {
      await Linking.openSettings();
    } catch {
      setFeedback({
        message: 'Settings could not be opened. Open device settings manually.',
        tone: 'error',
      });
    }
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.content, androidTopInset]}
      contentInsetAdjustmentBehavior="automatic"
      style={styles.screen}
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>FOUNDER ANALYZER</Text>
        <Text style={styles.title}>AI capture</Text>
        <Text style={styles.subtitle}>Prepare a coupon or event screenshot on this device.</Text>
      </View>

      <View accessibilityLabel="Capture type" style={styles.modeControl}>
        {MODE_OPTIONS.map((option) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: mode === option.value }}
            disabled={busy}
            key={option.value}
            onPress={() => selectMode(option.value)}
            style={({ pressed }) => [
              styles.modeOption,
              mode === option.value ? styles.modeOptionSelected : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text
              style={[
                styles.modeLabel,
                mode === option.value ? styles.modeLabelSelected : null,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {offline ? (
        <View accessibilityLiveRegion="polite" style={styles.offlineNotice}>
          <SymbolView
            fallback={<Text style={styles.noticeFallback}>!</Text>}
            name={{ android: 'wifi_off', ios: 'wifi.slash', web: 'wifi_off' }}
            size={20}
            tintColor={colors.warning}
          />
          <Text style={styles.offlineText}>{MESSAGES.offline}</Text>
        </View>
      ) : null}

      <View style={styles.captureTool}>
        {prepared ? (
          <>
            <View style={styles.previewFrame}>
              <Image
                accessibilityLabel={`Prepared ${mode} screenshot`}
                cachePolicy="none"
                contentFit="contain"
                source={{ uri: prepared.uri }}
                style={{ height: '100%', width: '100%' }}
              />
            </View>

            <View style={styles.preparedMeta}>
              <Text style={styles.metaPrimary}>
                {mode === 'coupon' ? 'Coupon' : 'Event'} JPEG
              </Text>
              <Text style={styles.metaSecondary}>
                {prepared.width} x {prepared.height}
              </Text>
              <Text style={styles.metaSecondary}>
                {(prepared.bodyBytes / 1_000_000).toFixed(2)} MB body
              </Text>
            </View>

            <View style={styles.actionRow}>
              <ActionButton
                disabled={busy}
                icon={{
                  android: 'refresh',
                  ios: 'arrow.triangle.2.circlepath',
                  web: 'refresh',
                }}
                label="Replace"
                onPress={showReplaceMenu}
              />
              <ActionButton
                disabled={busy}
                icon={{ android: 'delete', ios: 'trash', web: 'delete' }}
                label="Remove"
                onPress={removeImage}
                tone="danger"
              />
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <SymbolView
              fallback={<Text style={styles.emptyFallback}>+</Text>}
              name={{ android: 'image', ios: 'photo', web: 'image' }}
              size={34}
              tintColor={colors.accent}
            />
            <View style={styles.emptyCopy}>
              <Text style={styles.emptyTitle}>Add a {mode} screenshot</Text>
              <Text style={styles.emptyText}>The image is prepared locally as a JPEG.</Text>
            </View>
            <View style={styles.sourceActions}>
              <ActionButton
                disabled={busy}
                icon={{ android: 'camera_alt', ios: 'camera.fill', web: 'camera_alt' }}
                label="Take photo"
                onPress={() => void handleCapture('camera')}
                tone="primary"
              />
              <ActionButton
                disabled={busy}
                icon={{
                  android: 'photo_library',
                  ios: 'photo.on.rectangle',
                  web: 'photo_library',
                }}
                label="Choose photo"
                onPress={() => void handleCapture('library')}
              />
            </View>
          </View>
        )}
      </View>

      {busy ? (
        <View accessibilityLabel="Preparing image" style={styles.processing}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.processingText}>Preparing JPEG...</Text>
        </View>
      ) : null}

      {feedback ? (
        <View
          accessibilityLiveRegion="polite"
          role={feedback.tone === 'error' ? 'alert' : undefined}
          style={[
            styles.feedback,
            feedback.tone === 'error' ? styles.feedbackError : null,
            feedback.tone === 'success' ? styles.feedbackSuccess : null,
          ]}
        >
          <Text
            style={[
              styles.feedbackText,
              feedback.tone === 'error' ? styles.feedbackTextError : null,
              feedback.tone === 'success' ? styles.feedbackTextSuccess : null,
            ]}
          >
            {feedback.message}
          </Text>
          {feedback.canOpenSettings ? (
            <ActionButton
              icon={{ android: 'settings', ios: 'gearshape', web: 'settings' }}
              label="Open settings"
              onPress={() => void openSettings()}
            />
          ) : null}
        </View>
      ) : null}

      <ActionButton
        disabled={!prepared || busy || offline}
        icon={{ android: 'auto_awesome', ios: 'sparkles', web: 'auto_awesome' }}
        label="Analyze"
        onPress={analyze}
        tone="primary"
      />
    </ScrollView>
  );
}

function ActionButton({
  disabled = false,
  icon,
  label,
  onPress,
  tone = 'secondary',
}: ActionButtonProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        tone === 'primary' ? styles.actionButtonPrimary : null,
        tone === 'danger' ? styles.actionButtonDanger : null,
        disabled ? styles.actionButtonDisabled : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <SymbolView
        fallback={<Text style={styles.actionFallback}>+</Text>}
        name={icon}
        size={19}
        tintColor={tone === 'primary' ? colors.background : colors.secondaryText}
      />
      <Text
        style={[
          styles.actionLabel,
          tone === 'primary' ? styles.actionLabelPrimary : null,
          tone === 'danger' ? styles.actionLabelDanger : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    gap: 18,
    paddingBottom: 28,
    paddingHorizontal: 16,
    paddingTop: CONTENT_PADDING_TOP,
  },
  header: {
    gap: 4,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.8,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  modeControl: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderCurve: 'continuous',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  modeOption: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 6,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  modeOptionSelected: {
    backgroundColor: colors.surfaceRaised,
  },
  modeLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  modeLabelSelected: {
    color: colors.accent,
  },
  offlineNotice: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.warning,
    borderCurve: 'continuous',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  noticeFallback: {
    color: colors.warning,
    fontSize: 16,
    fontWeight: '900',
  },
  offlineText: {
    color: colors.secondaryText,
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    minWidth: 0,
  },
  captureTool: {
    gap: 14,
  },
  emptyState: {
    alignItems: 'center',
    borderColor: colors.border,
    borderCurve: 'continuous',
    borderRadius: 8,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: 14,
    justifyContent: 'center',
    minHeight: 280,
    padding: 18,
  },
  emptyFallback: {
    color: colors.accent,
    fontSize: 28,
    fontWeight: '500',
  },
  emptyCopy: {
    alignItems: 'center',
    gap: 5,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  sourceActions: {
    alignItems: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    width: '100%',
  },
  previewFrame: {
    aspectRatio: 0.78,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderCurve: 'continuous',
    borderRadius: 8,
    borderWidth: 1,
    maxHeight: 480,
    minHeight: 260,
    overflow: 'hidden',
    width: '100%',
  },
  preparedMeta: {
    alignItems: 'baseline',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metaPrimary: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  metaSecondary: {
    color: colors.muted,
    fontSize: 12,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderCurve: 'continuous',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 132,
    flexDirection: 'row',
    flexGrow: 1,
    gap: 8,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  actionButtonPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  actionButtonDanger: {
    borderColor: colors.danger,
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  actionFallback: {
    color: colors.secondaryText,
    fontSize: 15,
    fontWeight: '800',
  },
  actionLabel: {
    color: colors.secondaryText,
    fontSize: 14,
    fontWeight: '800',
  },
  actionLabelPrimary: {
    color: colors.background,
  },
  actionLabelDanger: {
    color: colors.danger,
  },
  pressed: {
    opacity: 0.7,
  },
  processing: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 44,
  },
  processingText: {
    color: colors.secondaryText,
    fontSize: 13,
  },
  feedback: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderCurve: 'continuous',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  feedbackError: {
    borderColor: colors.danger,
  },
  feedbackSuccess: {
    borderColor: colors.success,
  },
  feedbackText: {
    color: colors.secondaryText,
    fontSize: 13,
    lineHeight: 19,
  },
  feedbackTextError: {
    color: colors.danger,
  },
  feedbackTextSuccess: {
    color: colors.success,
  },
});
