/**
 * The swipe deck.
 *
 * Only the top card is interactive; two cards behind it are rendered static to
 * give the stack depth. Cards leave the deck optimistically (see `useSwipe`),
 * and the next page is fetched before the queue runs dry.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  NoticeBanner,
} from '@/components/StateViews';
import {
  StackedCard,
  SwipeableCard,
  type SwipeableCardHandle,
  type SwipeDecision,
} from '@/components/SwipeableCard';
import { FEED_PREFETCH_THRESHOLD } from '@/constants/config';
import { spacing, typography } from '@/constants/theme';
import { useFeed, useSwipe } from '@/hooks/usePapers';
import { useTheme } from '@/hooks/useTheme';
import type { FeedPaper } from '@/types/api';

export default function DiscoverScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const feed = useFeed();
  const swipe = useSwipe();

  // Lets the Save/Dismiss buttons play the same fling the gesture does.
  const cardRef = useRef<SwipeableCardHandle>(null);

  const papers: FeedPaper[] = useMemo(
    () => feed.data?.pages.flatMap((page) => page.items) ?? [],
    [feed.data],
  );

  const servedFromCache =
    feed.data?.pages.some((page) => page.source === 'cache') ?? false;

  // Keep the queue topped up before it empties, so the deck never stalls.
  useEffect(() => {
    if (
      papers.length <= FEED_PREFETCH_THRESHOLD &&
      feed.hasNextPage &&
      !feed.isFetchingNextPage
    ) {
      void feed.fetchNextPage();
    }
  }, [papers.length, feed]);

  const recordSwipe = useCallback(
    (paper: FeedPaper, direction: SwipeDecision) => {
      // The card is keyed on paper.id, so the next one mounts with a fresh
      // (zeroed) animation state — nothing to reset here.
      swipe.mutate({ paperId: paper.id, direction });
    },
    [swipe],
  );

  // --- states ---
  if (feed.isLoading) {
    return (
      <Screen testID="discover-screen">
        <LoadingState message="Finding papers for you…" />
      </Screen>
    );
  }

  if (feed.isError && papers.length === 0) {
    return (
      <Screen testID="discover-screen">
        <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />
      </Screen>
    );
  }

  if (papers.length === 0) {
    return (
      <Screen testID="discover-screen">
        <EmptyState
          icon="🎉"
          title="You're all caught up"
          message="You've seen every paper we found for your interests. Add more topics in Settings, or check back later for new work."
          actionLabel="Refresh"
          onAction={() => void feed.refetch()}
          testID="feed-empty-state"
        />
      </Screen>
    );
  }

  const [topPaper, ...rest] = papers;
  if (!topPaper) return null;
  const behind = rest.slice(0, 2);

  return (
    <Screen testID="discover-screen">
      {servedFromCache ? (
        <NoticeBanner
          tone="warning"
          message="Showing saved results — live search is temporarily unavailable."
        />
      ) : null}

      <View style={styles.deck}>
        {/* Render back-to-front so the top card sits above the stack. */}
        {behind
          .map((paper, index) => (
            <StackedCard key={paper.id} paper={paper} depth={behind.length - index} />
          ))
          .reverse()}

        <SwipeableCard
          key={topPaper.id}
          ref={cardRef}
          paper={topPaper}
          onSwipe={(direction) => recordSwipe(topPaper, direction)}
          onPress={() => router.push(`/paper/${topPaper.id}`)}
        />
      </View>

      {/* Visible buttons: the gesture must never be the only way to decide. */}
      <View style={styles.actions}>
        <Button
          testID="dismiss-button"
          label="Skip"
          variant="secondary"
          size="large"
          style={styles.actionButton}
          leading={<Text style={{ color: colors.dismiss, fontSize: 17 }}>✕</Text>}
          onPress={() => cardRef.current?.swipe('left')}
          accessibilityHint="Dismisses this paper and shows the next one"
        />
        <Button
          testID="save-button"
          label="Save"
          variant="secondary"
          size="large"
          style={styles.actionButton}
          leading={<Text style={{ color: colors.save, fontSize: 17 }}>♥</Text>}
          onPress={() => cardRef.current?.swipe('right')}
          accessibilityHint="Saves this paper to your Saved list"
        />
      </View>

      <Text style={[styles.hint, { color: colors.textMuted }]}>
        Swipe right to save · left to skip · tap for details
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  deck: { flex: 1, marginTop: spacing.md, marginBottom: spacing.lg },
  actions: { flexDirection: 'row', gap: spacing.md },
  actionButton: { flex: 1 },
  hint: { ...typography.caption, textAlign: 'center', paddingVertical: spacing.md },
});
