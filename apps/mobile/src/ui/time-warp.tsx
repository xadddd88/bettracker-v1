import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
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

const HORIZONTAL_LINES = [0, 1, 2, 3, 4] as const;
const VERTICAL_LINES = [0, 1, 2, 3] as const;

export function TimeWarpBackdrop() {
  const phase = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    cancelAnimation(phase);

    if (reduceMotion) {
      phase.value = 0.5;
      return;
    }

    phase.value = withRepeat(
      withTiming(1, { duration: 7200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(phase);
  }, [phase, reduceMotion]);

  const cyanMotion = useAnimatedStyle(() => ({
    opacity: 0.08 + phase.value * 0.08,
    transform: [
      { translateX: phase.value * 42 },
      { translateY: phase.value * 26 },
      { scale: 0.92 + phase.value * 0.12 },
    ],
  }));
  const magentaMotion = useAnimatedStyle(() => ({
    opacity: 0.04 + (1 - phase.value) * 0.08,
    transform: [
      { translateX: phase.value * -34 },
      { translateY: phase.value * -22 },
      { scale: 1.04 - phase.value * 0.1 },
    ],
  }));
  const horizonMotion = useAnimatedStyle(() => ({
    opacity: 0.08 + phase.value * 0.12,
    transform: [{ scaleX: 0.8 + phase.value * 0.32 }],
  }));

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.cyanGlow, cyanMotion]} />
      <Animated.View style={[styles.magentaGlow, magentaMotion]} />
      <View style={styles.cyanOrbit} />
      <View style={styles.magentaOrbit} />
      <View style={styles.grid}>
        {HORIZONTAL_LINES.map((line) => <View key={`h-${line}`} style={[styles.horizontal, { top: `${line * 25}%` }]} />)}
        {VERTICAL_LINES.map((line) => <View key={`v-${line}`} style={[styles.vertical, { left: `${line * 33.333}%` }]} />)}
      </View>
      <Animated.View style={[styles.horizon, horizonMotion]} />
    </View>
  );
}

export function WarpRail() {
  return (
    <View accessibilityElementsHidden pointerEvents="none" style={styles.rail}>
      <View style={styles.railCyan} />
      <View style={styles.railMagenta} />
    </View>
  );
}

const styles = StyleSheet.create({
  cyanGlow: {
    backgroundColor: colors.accent,
    borderRadius: 180,
    height: 310,
    position: 'absolute',
    right: -205,
    top: -115,
    width: 310,
  },
  magentaGlow: {
    backgroundColor: colors.magenta,
    borderRadius: 150,
    height: 250,
    left: -190,
    position: 'absolute',
    top: 260,
    width: 250,
  },
  cyanOrbit: {
    borderColor: colors.accent,
    borderRadius: 260,
    borderWidth: StyleSheet.hairlineWidth,
    height: 340,
    opacity: 0.12,
    position: 'absolute',
    right: -230,
    top: -140,
    transform: [{ rotate: '-18deg' }],
    width: 340,
  },
  magentaOrbit: {
    borderColor: colors.magenta,
    borderRadius: 210,
    borderWidth: StyleSheet.hairlineWidth,
    height: 270,
    left: -205,
    opacity: 0.09,
    position: 'absolute',
    top: 260,
    transform: [{ rotate: '14deg' }],
    width: 270,
  },
  grid: {
    bottom: 0,
    height: 180,
    left: 0,
    opacity: 0.055,
    position: 'absolute',
    right: 0,
    transform: [{ perspective: 240 }, { rotateX: '58deg' }, { scale: 1.35 }],
  },
  horizontal: { backgroundColor: colors.accent, height: StyleSheet.hairlineWidth, left: 0, position: 'absolute', right: 0 },
  vertical: { backgroundColor: colors.ultraviolet, bottom: 0, position: 'absolute', top: 0, width: StyleSheet.hairlineWidth },
  horizon: { backgroundColor: colors.magenta, bottom: 156, height: StyleSheet.hairlineWidth, left: '28%', opacity: 0.14, position: 'absolute', right: '28%' },
  rail: { flexDirection: 'row', gap: 4, height: 2, overflow: 'hidden', width: 54 },
  railCyan: { backgroundColor: colors.accent, flex: 3 },
  railMagenta: { backgroundColor: colors.magenta, flex: 1 },
});
