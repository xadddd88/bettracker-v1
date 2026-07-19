import { type PropsWithChildren, useEffect } from 'react';
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '@/ui/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type MotionPressableProps = PropsWithChildren<
  Omit<PressableProps, 'style'> & {
    glow?: 'cyan' | 'magenta' | 'none';
    style?: StyleProp<ViewStyle>;
  }
>;

export function MotionPressable({
  children,
  disabled,
  glow = 'cyan',
  onPressIn,
  onPressOut,
  style,
  ...props
}: MotionPressableProps) {
  const pressed = useSharedValue(0);
  const pulse = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const glowColor = glow === 'magenta' ? colors.magenta : colors.accent;

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: disabled ? 0.45 : 1,
    transform: [
      { scale: 1 - pressed.value * 0.035 },
      { translateY: pressed.value * 1.5 },
    ],
  }), [disabled]);
  const energyStyle = useAnimatedStyle(() => ({
    opacity: 0.25 + pulse.value * 0.5,
    transform: [{ scaleX: 0.35 + pulse.value * 0.65 }],
  }));

  useEffect(() => {
    cancelAnimation(pulse);

    if (reduceMotion || glow === 'none') {
      pulse.value = 0.5;
      return;
    }

    pulse.value = withRepeat(withTiming(1, { duration: 1500 }), -1, true);
    return () => cancelAnimation(pulse);
  }, [glow, pulse, reduceMotion]);

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={(event) => {
        pressed.value = reduceMotion ? 1 : withTiming(1, { duration: 90 });
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        pressed.value = reduceMotion ? 0 : withSpring(0, { damping: 14, stiffness: 220 });
        onPressOut?.(event);
      }}
      style={[
        style,
        glow !== 'none' && styles.glow,
        glow !== 'none' && { shadowColor: glowColor },
        animatedStyle,
      ]}
    >
      {children}
      {glow !== 'none' ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.energyLine, { backgroundColor: glowColor }, energyStyle]}
        />
      ) : null}
    </AnimatedPressable>
  );
}

const styles = {
  glow: {
    elevation: 3,
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 9,
  },
  energyLine: {
    bottom: 0,
    height: 1,
    left: 10,
    position: 'absolute',
    right: 10,
  },
} satisfies Record<string, ViewStyle>;
