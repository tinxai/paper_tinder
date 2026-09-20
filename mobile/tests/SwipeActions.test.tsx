/**
 * Save and Dismiss must be reachable without a gesture.
 *
 * These assert the accessible button path on the deck, which is the part a
 * VoiceOver or motor-impaired user depends on.
 *
 * Two Reanimated primitives are stubbed, because Jest has neither a UI thread
 * nor a frame loop:
 *   - `withTiming` completes immediately, so the completion callback (the thing
 *     that actually reports the swipe) fires at all.
 *   - `runOnJS` becomes the identity function; with no separate UI thread there
 *     is nothing to hop back from.
 * Everything else in Reanimated stays real.
 */

import { fireEvent, screen } from '@testing-library/react-native';
import { useRef } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/Button';
import { SwipeableCard, type SwipeableCardHandle } from '@/components/SwipeableCard';
import { makeFeedPaper, renderWithProviders } from './testUtils';

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return {
    __esModule: true,
    ...actual,
    // Keep the default export (Animated.View et al.) intact — spreading alone
    // drops it and every <Animated.View> renders as undefined.
    default: actual.default,
    withTiming: (
      toValue: number,
      _config?: unknown,
      callback?: (finished: boolean) => void,
    ) => {
      callback?.(true);
      return toValue;
    },
    runOnJS:
      <A extends unknown[]>(fn: (...args: A) => void) =>
      (...args: A) =>
        fn(...args),
  };
});

/** A minimal stand-in for the Discover screen's deck + action buttons. */
function Deck({ onSwipe }: { onSwipe: (direction: 'left' | 'right') => void }) {
  const cardRef = useRef<SwipeableCardHandle>(null);
  return (
    <View>
      <SwipeableCard
        ref={cardRef}
        paper={makeFeedPaper()}
        onSwipe={onSwipe}
        onPress={jest.fn()}
      />
      <Button
        testID="dismiss-button"
        label="Skip"
        onPress={() => cardRef.current?.swipe('left')}
      />
      <Button
        testID="save-button"
        label="Save"
        onPress={() => cardRef.current?.swipe('right')}
      />
    </View>
  );
}

describe('Swipe actions', () => {
  it('renders the card inside the deck', async () => {
    await renderWithProviders(<Deck onSwipe={jest.fn()} />);
    expect(screen.getByTestId('swipeable-card')).toBeTruthy();
    expect(screen.getByText('Attention Is All You Need')).toBeTruthy();
  });

  it('exposes visible Save and Dismiss buttons', async () => {
    await renderWithProviders(<Deck onSwipe={jest.fn()} />);
    // The gesture must never be the only way to decide.
    expect(screen.getByTestId('save-button')).toBeTruthy();
    expect(screen.getByTestId('dismiss-button')).toBeTruthy();
  });

  it('gives both actions a button role and an accessible label', async () => {
    await renderWithProviders(<Deck onSwipe={jest.fn()} />);

    const save = screen.getByTestId('save-button');
    const dismiss = screen.getByTestId('dismiss-button');
    expect(save.props.accessibilityRole).toBe('button');
    expect(save.props.accessibilityLabel).toBe('Save');
    expect(dismiss.props.accessibilityRole).toBe('button');
    expect(dismiss.props.accessibilityLabel).toBe('Skip');
  });

  it('pressing Save triggers a right swipe', async () => {
    const onSwipe = jest.fn();
    await renderWithProviders(<Deck onSwipe={onSwipe} />);

    await fireEvent.press(screen.getByTestId('save-button'));
    // The Reanimated mock resolves the timing callback synchronously.
    expect(onSwipe).toHaveBeenCalledWith('right');
  });

  it('pressing Dismiss triggers a left swipe', async () => {
    const onSwipe = jest.fn();
    await renderWithProviders(<Deck onSwipe={onSwipe} />);

    await fireEvent.press(screen.getByTestId('dismiss-button'));
    expect(onSwipe).toHaveBeenCalledWith('left');
  });

  it('hides the drag stamps from screen readers', async () => {
    // "SAVE"/"SKIP" are visual affordances for the drag; announcing them
    // would just be noise for a VoiceOver user.
    await renderWithProviders(<Deck onSwipe={jest.fn()} />);

    // Rendered...
    expect(screen.queryByText('♥ SAVE', { includeHiddenElements: true })).toBeTruthy();
    // ...but not exposed to assistive technology.
    expect(screen.queryByText('♥ SAVE')).toBeNull();
    expect(screen.queryByText('✕ SKIP')).toBeNull();
  });
});
