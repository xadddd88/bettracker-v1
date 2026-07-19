import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '@/ui/theme';

type KineticTypeProps = {
  dark?: boolean;
  label: string;
  reverse?: boolean;
};

export function EditorialBackdrop({ dark = false }: { dark?: boolean }) {
  const progress = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    cancelAnimation(progress);
    progress.value = reduceMotion
      ? 0.35
      : withRepeat(withTiming(1, { duration: 12000, easing: Easing.linear }), -1, true);
    return () => cancelAnimation(progress);
  }, [progress, reduceMotion]);

  const slashStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -70 + progress.value * 110 },
      { rotate: '-18deg' },
    ],
  }));

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, dark ? styles.backdropDark : styles.backdropLight]}
    >
      <Animated.View style={[styles.slash, dark ? styles.slashDark : styles.slashLight, slashStyle]} />
      <View style={[styles.corner, dark ? styles.cornerDark : styles.cornerLight]} />
      <View style={[styles.fineRule, dark ? styles.ruleDark : styles.ruleLight]} />
    </View>
  );
}

export function KineticType({ dark = true, label, reverse = false }: KineticTypeProps) {
  const progress = useSharedValue(reverse ? 1 : 0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    cancelAnimation(progress);
    progress.value = reduceMotion
      ? 0.4
      : withRepeat(
          withTiming(reverse ? 0 : 1, { duration: 9000, easing: Easing.linear }),
          -1,
          true,
        );
    return () => cancelAnimation(progress);
  }, [progress, reduceMotion, reverse]);

  const motion = useAnimatedStyle(() => ({
    transform: [{ translateX: -90 + progress.value * 60 }],
  }));

  return (
    <View accessibilityElementsHidden pointerEvents="none" style={styles.kineticClip}>
      <Animated.Text
        numberOfLines={1}
        style={[styles.kineticText, dark ? styles.kineticOnDark : styles.kineticOnLight, motion]}
      >
        {`${label}  ${label}  ${label}`}
      </Animated.Text>
    </View>
  );
}

export function EditorialRule({ inverted = false, label }: { inverted?: boolean; label?: string }) {
  return (
    <View style={styles.ruleRow}>
      <View style={[styles.ruleLine, inverted && styles.ruleLineInverted]} />
      {label ? <Text style={[styles.ruleLabel, inverted && styles.ruleLabelInverted]}>{label}</Text> : null}
    </View>
  );
}

// Transitional aliases keep older secondary screens source-compatible while the
// product moves from the discarded neon system to the editorial system.
export const TimeWarpBackdrop = EditorialBackdrop;
export function WarpRail() {
  return <EditorialRule />;
}

const styles = StyleSheet.create({
  backdropLight: { backgroundColor: colors.background },
  backdropDark: { backgroundColor: '#050505' },
  slash: { height: 760, position: 'absolute', right: -330, top: -260, width: 260 },
  slashLight: { backgroundColor: '#ECECE7' },
  slashDark: { backgroundColor: '#111111' },
  corner: { height: 118, position: 'absolute', right: 0, top: 0, width: 76 },
  cornerLight: { backgroundColor: '#E8FF00' },
  cornerDark: { backgroundColor: '#E8FF00' },
  fineRule: { bottom: 92, height: StyleSheet.hairlineWidth, left: 0, position: 'absolute', right: 0 },
  ruleLight: { backgroundColor: '#C2C2BC' },
  ruleDark: { backgroundColor: '#333333' },
  kineticClip: { left: 0, overflow: 'hidden', position: 'absolute', right: 0, top: '24%' },
  kineticText: { fontSize: 74, fontWeight: '900', letterSpacing: -4, lineHeight: 78 },
  kineticOnDark: { color: '#1A1A1A' },
  kineticOnLight: { color: '#E4E4DE' },
  ruleRow: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 12 },
  ruleLine: { backgroundColor: colors.text, flex: 1, height: 1 },
  ruleLineInverted: { backgroundColor: '#FFFFFF' },
  ruleLabel: { color: colors.text, fontSize: 8, fontWeight: '700', letterSpacing: 1.4 },
  ruleLabelInverted: { color: '#FFFFFF' },
});
