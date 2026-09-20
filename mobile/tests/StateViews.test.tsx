/** Loading, empty, error and offline states. */
import { fireEvent, screen } from '@testing-library/react-native';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  NoticeBanner,
} from '@/components/StateViews';
import { ApiError } from '@/services/errors';
import { renderWithProviders } from './testUtils';

describe('LoadingState', () => {
  it('renders a spinner and message', async () => {
    await renderWithProviders(<LoadingState message="Finding papers…" />);
    expect(screen.getByTestId('loading-state')).toBeTruthy();
    expect(screen.getByText('Finding papers…')).toBeTruthy();
  });
});

describe('EmptyState', () => {
  it('renders the title and message', async () => {
    await renderWithProviders(
      <EmptyState title="Nothing saved yet" message="Swipe right to save a paper." />,
    );
    expect(screen.getByText('Nothing saved yet')).toBeTruthy();
    expect(screen.getByText('Swipe right to save a paper.')).toBeTruthy();
  });

  it('fires the optional action', async () => {
    const onAction = jest.fn();
    await renderWithProviders(
      <EmptyState title="T" message="M" actionLabel="Refresh" onAction={onAction} />,
    );

    await fireEvent.press(screen.getByText('Refresh'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('omits the action when none is given', async () => {
    await renderWithProviders(<EmptyState title="T" message="M" />);
    expect(screen.queryByText('Refresh')).toBeNull();
  });
});

describe('ErrorState', () => {
  it('shows the API error message', async () => {
    const error = new ApiError('Paper search is busy right now.', {
      status: 503,
      code: 'upstream_rate_limited',
    });
    await renderWithProviders(<ErrorState error={error} />);

    expect(screen.getByTestId('error-state')).toBeTruthy();
    expect(screen.getByText('Paper search is busy right now.')).toBeTruthy();
  });

  it('presents a network failure as being offline', async () => {
    const error = new ApiError('Could not reach the server.', { status: 0 });
    await renderWithProviders(<ErrorState error={error} />);
    expect(screen.getByText("You're offline")).toBeTruthy();
  });

  it('offers a retry action that fires', async () => {
    const onRetry = jest.fn();
    await renderWithProviders(
      <ErrorState error={new ApiError('Failed', { status: 503 })} onRetry={onRetry} />,
    );

    await fireEvent.press(screen.getByTestId('retry-button'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omits retry when no handler is given', async () => {
    await renderWithProviders(<ErrorState error={new Error('x')} />);
    expect(screen.queryByTestId('retry-button')).toBeNull();
  });

  it('renders a readable message for a non-Error value', async () => {
    // Both the heading and the body say "went wrong" here; assert the exact
    // body copy so this never passes on the heading alone.
    await renderWithProviders(<ErrorState error={{ weird: true }} />);
    expect(screen.getByText('Something went wrong. Please try again.')).toBeTruthy();
    expect(screen.queryByText('[object Object]')).toBeNull();
  });
});

describe('NoticeBanner', () => {
  it('renders an inline notice', async () => {
    await renderWithProviders(
      <NoticeBanner message="Showing saved results" tone="warning" />,
    );
    expect(screen.getByText('Showing saved results')).toBeTruthy();
  });
});
