/**
 * Drag-to-decide card, built directly on Gesture Handler + Reanimated rather
 * than a prebuilt swiper package, so the behavior stays inspectable.
 *
 * How it works:
 *   - A Pan gesture writes the finger offset into shared values.
 *   - An animated style maps that offset to translation + a slight rotation
 *     (rotation proportional to horizontal distance is what makes the drag
 *     feel physical).
 *   - Releasing past SWIPE_THRESHOLD flings the card off-screen and calls back;
 *     otherwise it springs home.
 *   - Two overlay stamps ("SAVE" / "SKIP") fade in with drag distance.
 *
 * The animation state is owned here rather than passed in, and the Save/Dismiss
 * buttons drive the identical fling through the imperative `swipe()` handle. A
 * parent that mutated shared values it passed down would be mutating props,
 * which the React Compiler rules (correctly) reject.
 *
 * Everything on the UI thread runs in a worklet, so the drag never depends on
 * the JS thread being free. `runOnJS` marks the two hand-offs back to React.
 */
import { forwardRef, useCallback, useImperativeHandle } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { radius, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { FeedPaper } from '@/types/api';
import { PaperCard } from './PaperCard';

const SCREEN_WIDTH = Dimensions.get('window').width;

/** How far the card must travel before release counts as a decision. */
export const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.28;

/** A fast flick decides even if it did not travel far. */
const VELOCITY_THRESHOLD = 800;

/** Where the card flies to on the way out. */
const OFF_SCREEN_X = SCREEN_WIDTH * 1.6;

/** Max card tilt, in degrees, at full drag. */
const MAX_ROTATION_DEG = 10;

const EXIT_DURATION_MS = 220;
const SPRING = { damping: 18, stiffness: 180, mass: 0.6 } as const;

export type SwipeDecision = 'left' | 'right';

export interface SwipeableCardHandle {
  /** Fling the card out as if it had been dragged. Used by the action buttons. */
  swipe: (direction: SwipeDecision) => void;
}

interface SwipeableCardProps {
  paper: FeedPaper;
  onSwipe: (direction: SwipeDecision) => void;
  onPress: () => void;
}

export const SwipeableCard = forwardRef<SwipeableCardHandle, SwipeableCardProps>(
  function SwipeableCard({ paper, onSwipe, onPress }, ref) {
    const { colors } = useTheme();

    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);

    const handleDecision = useCallback(
      (direction: SwipeDecision) => {
        onSwipe(direction);
      },
      [onSwipe],
    );

    /** Shared by the gesture release and the buttons, so both look identical. */
    const flingOut = useCallback(
      (direction: SwipeDecision, extraDrop: number) => {
        translateX.value = withTiming(
          direction === 'right' ? OFF_SCREEN_X : -OFF_SCREEN_X,
          { duration: EXIT_DURATION_MS },
          (finished) => {
            if (finished) runOnJS(handleDecision)(direction);
          },
        );
        translateY.value = withTiming(translateY.value + extraDrop, {
          duration: EXIT_DURATION_MS,
        });
      },
      [handleDecision, translateX, translateY],
    );

    useImperativeHandle(ref, () => ({ swipe: (direction) => flingOut(direction, 0) }), [
      flingOut,
    ]);

    const panGesture = Gesture.Pan()
      // Ignore tiny movements so a tap still registers as a tap.
      .activeOffsetX([-12, 12])
      .failOffsetY([-24, 24])
      .onUpdate((event) => {
        translateX.value = event.translationX;
        // Damped vertical follow — the card should not slide freely up and down.
        translateY.value = event.translationY * 0.35;
      })
      .onEnd((event) => {
        const passedDistance = Math.abs(translateX.value) > SWIPE_THRESHOLD;
        const passedVelocity = Math.abs(event.velocityX) > VELOCITY_THRESHOLD;

        if (passedDistance || passedVelocity) {
          runOnJS(flingOut)(translateX.value > 0 ? 'right' : 'left', 40);
          return;
        }

        // Not far enough — spring back.
        translateX.value = withSpring(0, SPRING);
        translateY.value = withSpring(0, SPRING);
      });

    const tapGesture = Gesture.Tap()
      .maxDuration(300)
      .onEnd((_event, success) => {
        if (success) runOnJS(onPress)();
      });

    // Race, not Simultaneous: a drag must not also fire a tap.
    const gesture = Gesture.Race(panGesture, tapGesture);

    const cardStyle = useAnimatedStyle(() => {
      const rotate = interpolate(
        translateX.value,
        [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
        [-MAX_ROTATION_DEG, 0, MAX_ROTATION_DEG],
        'clamp',
      );
      return {
        transform: [
          { translateX: translateX.value },
          { translateY: translateY.value },
          { rotate: `${rotate}deg` },
        ],
      };
    });

    const saveStampStyle = useAnimatedStyle(() => ({
      opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, 1], 'clamp'),
      transform: [
        { scale: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0.8, 1], 'clamp') },
      ],
    }));

    const skipStampStyle = useAnimatedStyle(() => ({
      opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD, 0], [1, 0], 'clamp'),
      transform: [
        {
          scale: interpolate(translateX.value, [-SWIPE_THRESHOLD, 0], [1, 0.8], 'clamp'),
        },
      ],
    }));

    return (
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.container, cardStyle]} testID="swipeable-card">
          <PaperCard paper={paper} />

          {/* Stamps carry a word and an icon, never color alone. */}
          <Animated.View
            style={[
              styles.stamp,
              styles.stampLeft,
              { borderColor: colors.save },
              saveStampStyle,
            ]}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text style={[styles.stampText, { color: colors.save }]}>♥ SAVE</Text>
          </Animated.View>

          <Animated.View
            style={[
              styles.stamp,
              styles.stampRight,
              { borderColor: colors.dismiss },
              skipStampStyle,
            ]}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text style={[styles.stampText, { color: colors.dismiss }]}>✕ SKIP</Text>
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    );
  },
);

/** A dimmed, slightly scaled card peeking out behind the active one. */
export function StackedCard({ paper, depth }: { paper: FeedPaper; depth: number }) {
  return (
    <View
      style={[
        styles.container,
        styles.stacked,
        { transform: [{ scale: 1 - depth * 0.04 }, { translateY: depth * 10 }] },
      ]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <PaperCard paper={paper} testID={`stacked-card-${depth}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  stacked: { opacity: 0.55 },
  stamp: {
    position: 'absolute',
    top: spacing.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 3,
    borderRadius: radius.md,
    backgroundColor: 'transparent',
  },
  stampLeft: { left: spacing.xl, transform: [{ rotate: '-12deg' }] },
  stampRight: { right: spacing.xl, transform: [{ rotate: '12deg' }] },
  stampText: { ...typography.heading, letterSpacing: 1.5 },
});
