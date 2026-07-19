import { StyleSheet, View } from 'react-native';

import { colors } from '@/ui/theme';

const HORIZONTAL_LINES = [0, 1, 2, 3, 4] as const;
const VERTICAL_LINES = [0, 1, 2, 3] as const;

export function TimeWarpBackdrop() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.cyanOrbit} />
      <View style={styles.magentaOrbit} />
      <View style={styles.grid}>
        {HORIZONTAL_LINES.map((line) => <View key={`h-${line}`} style={[styles.horizontal, { top: `${line * 25}%` }]} />)}
        {VERTICAL_LINES.map((line) => <View key={`v-${line}`} style={[styles.vertical, { left: `${line * 33.333}%` }]} />)}
      </View>
      <View style={styles.horizon} />
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
