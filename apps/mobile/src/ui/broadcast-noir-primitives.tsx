import type { PropsWithChildren } from 'react';
import {
  Platform,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  View,
  type ViewProps,
} from 'react-native';

import { geometry, semanticColors, typography } from '@/ui/theme';

export function BroadcastPanel({ children, style, ...props }: PropsWithChildren<ViewProps>) {
  return <View {...props} style={[styles.panel, style]}>{children}</View>;
}

type BroadcastButtonProps = PressableProps & {
  label: string;
  tone?: 'primary' | 'secondary' | 'destructive';
};

export function BroadcastButton({ label, style, tone = 'primary', ...props }: BroadcastButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      style={({ pressed }) => [
        styles.button,
        tone === 'primary' && styles.buttonPrimary,
        tone === 'secondary' && styles.buttonSecondary,
        tone === 'destructive' && styles.buttonDestructive,
        pressed && styles.buttonPressed,
        typeof style === 'function' ? style({ pressed }) : style,
      ]}
    >
      <Text style={[
        styles.buttonText,
        tone === 'primary' && styles.buttonTextPrimary,
        tone === 'destructive' && styles.buttonTextDestructive,
      ]}>{label}</Text>
    </Pressable>
  );
}

type Status = 'success' | 'review' | 'negative' | 'neutral';
const statusSymbols: Record<Status, string> = { success: '✓', review: '!', negative: '×', neutral: '•' };

export function BroadcastStatus({ label, status }: { label: string; status: Status }) {
  return (
    <View accessibilityLabel={`${status}: ${label}`} style={[styles.status, styles[`status_${status}`]]}>
      <Text aria-hidden style={[styles.statusIcon, styles[`statusText_${status}`]]}>{statusSymbols[status]}</Text>
      <Text style={[styles.statusText, styles[`statusText_${status}`]]}>{label}</Text>
    </View>
  );
}

export function BroadcastDataValue({ children }: PropsWithChildren) {
  return <Text style={styles.dataValue}>{children}</Text>;
}

const touchMinimum = Platform.select({
  android: geometry.androidTouchMinimum,
  ios: geometry.iosTouchMinimum,
  default: geometry.webTouchMinimum,
});

const styles = StyleSheet.create({
  panel: {
    backgroundColor: semanticColors.field,
    borderColor: semanticColors.borderStrong,
    borderRadius: geometry.radiusControl,
    borderWidth: 1,
    padding: 16,
  },
  button: {
    alignItems: 'center',
    borderRadius: geometry.radiusControl,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: touchMinimum,
    paddingHorizontal: 16,
  },
  buttonPrimary: { backgroundColor: semanticColors.signal, borderColor: semanticColors.signal },
  buttonSecondary: { backgroundColor: semanticColors.field, borderColor: semanticColors.borderStrong },
  buttonDestructive: { backgroundColor: semanticColors.field, borderColor: semanticColors.negative },
  buttonPressed: { opacity: 0.82 },
  buttonText: { color: semanticColors.textPrimary, fontSize: 12, fontWeight: '900' },
  buttonTextPrimary: { color: semanticColors.onSignal },
  buttonTextDestructive: { color: semanticColors.negative },
  status: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: geometry.radiusControl,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 9,
  },
  status_success: { borderColor: semanticColors.success },
  status_review: { borderColor: semanticColors.review },
  status_negative: { borderColor: semanticColors.negative },
  status_neutral: { borderColor: semanticColors.borderStrong },
  statusIcon: { fontSize: typography.metadataPreferred.fontSize, fontWeight: '900' },
  statusText: { fontSize: typography.metadataPreferred.fontSize, fontWeight: '800' },
  statusText_success: { color: semanticColors.success },
  statusText_review: { color: semanticColors.review },
  statusText_negative: { color: semanticColors.negative },
  statusText_neutral: { color: semanticColors.textMuted },
  dataValue: { color: semanticColors.dataValue, fontVariant: ['tabular-nums'], fontWeight: '800' },
});
