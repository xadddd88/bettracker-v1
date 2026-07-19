import { type PropsWithChildren } from 'react';
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

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
  onPressIn,
  onPressOut,
  style,
  ...props
}: MotionPressableProps) {
  const pressed = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: disabled ? 0.4 : 1,
    transform: [
      { scale: 1 - pressed.value * 0.018 },
      { translateY: pressed.value * 2 },
    ],
  }), [disabled]);
  const wipeStyle = useAnimatedStyle(() => ({
    opacity: pressed.value * 0.12,
    transform: [{ scaleX: pressed.value }],
  }));

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={(event) => {
        pressed.set(reduceMotion ? 1 : withTiming(1, { duration: 80 }));
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        pressed.set(reduceMotion ? 0 : withSpring(0, { damping: 15, stiffness: 260 }));
        onPressOut?.(event);
      }}
      style={[style, animatedStyle]}
    >
      {children}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.wipe, wipeStyle]} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  wipe: {
    backgroundColor: '#FFFFFF',
  },
});
