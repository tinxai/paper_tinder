/**
 * TanStack Query hooks for the paper data.
 *
 * The swipe mutation is optimistic: the card leaves the deck the instant the
 * gesture ends, and the feed cache is rolled back if the request fails.
 */
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { FEED_PAGE_SIZE, SAVED_PAGE_SIZE } from '@/constants/config';
import { ApiError } from '@/services/errors';
import * as apiService from '@/services/paperswipeApi';
import type { SavedPapersQuery } from '@/services/paperswipeApi';
import type { FeedPage, Page, SavedPaper, SwipeDirection } from '@/types/api';
import { queryKeys } from './queryKeys';

/**
 * Never retry a 4xx — a 401 or 404 will fail identically every time, and
 * retrying just delays the error state the user needs to see.
 */
function retryPolicy(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && !error.isRetryable) return false;
  return failureCount < 2;
}

// --- feed ---------------------------------------------------------------

export function useFeed() {
  return useInfiniteQuery<FeedPage, ApiError>({
    queryKey: queryKeys.feed,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => apiService.fetchFeed(pageParam as number, FEED_PAGE_SIZE),
    getNextPageParam: (lastPage) =>
      lastPage.has_more ? lastPage.offset + lastPage.limit : undefined,
    retry: retryPolicy,
    // Feed results are expensive (an upstream call); keep them briefly.
    staleTime: 60_000,
  });
}

export function usePaper(paperId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.paper(paperId ?? ''),
    queryFn: () => apiService.fetchPaper(paperId as string),
    enabled: Boolean(paperId),
    retry: retryPolicy,
  });
}

// --- saved --------------------------------------------------------------

export function useSavedPapers(query: SavedPapersQuery = {}) {
  return useInfiniteQuery<Page<SavedPaper>, ApiError>({
    queryKey: queryKeys.savedPapers(query),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      apiService.fetchSavedPapers({
        ...query,
        offset: pageParam as number,
        limit: SAVED_PAGE_SIZE,
      }),
    getNextPageParam: (lastPage) =>
      lastPage.has_more ? lastPage.offset + lastPage.limit : undefined,
    retry: retryPolicy,
  });
}

// --- swiping ------------------------------------------------------------

interface SwipeVariables {
  paperId: string;
  direction: SwipeDirection;
}

/**
 * Record a swipe, removing the card from the feed immediately.
 *
 * The optimistic update matters here: without it the top card would sit on
 * screen until the network round trip finished, which reads as a frozen app.
 */
export function useSwipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ paperId, direction }: SwipeVariables) =>
      apiService.createSwipe(paperId, direction),

    onMutate: async ({ paperId }) => {
      // Stop an in-flight refetch from clobbering the optimistic state.
      await queryClient.cancelQueries({ queryKey: queryKeys.feed });

      const previousFeed = queryClient.getQueryData<InfiniteData<FeedPage>>(
        queryKeys.feed,
      );

      queryClient.setQueryData<InfiniteData<FeedPage>>(queryKeys.feed, (current) => {
        if (!current) return current;
        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            items: page.items.filter((paper) => paper.id !== paperId),
          })),
        };
      });

      return { previousFeed };
    },

    onError: (_error, _variables, context) => {
      // Put the card back so the user can retry rather than silently losing it.
      if (context?.previousFeed) {
        queryClient.setQueryData(queryKeys.feed, context.previousFeed);
      }
    },

    onSuccess: (_data, { direction }) => {
      // A right swipe changes Saved; a left swipe does not.
      if (direction === 'right') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.savedPapersAll });
      }
    },
  });
}

/** Remove a paper from Saved. Used by the saved list and the detail screen. */
export function useRemoveSwipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (paperId: string) => apiService.deleteSwipe(paperId),

    onMutate: async (paperId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.savedPapersAll });

      const snapshots = queryClient.getQueriesData<InfiniteData<Page<SavedPaper>>>({
        queryKey: queryKeys.savedPapersAll,
      });

      for (const [key, data] of snapshots) {
        if (!data) continue;
        queryClient.setQueryData<InfiniteData<Page<SavedPaper>>>(key, {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.filter((paper) => paper.id !== paperId),
            total: page.total === null ? null : Math.max(0, page.total - 1),
          })),
        });
      }

      return { snapshots };
    },

    onError: (_error, _paperId, context) => {
      for (const [key, data] of context?.snapshots ?? []) {
        queryClient.setQueryData(key, data);
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.savedPapersAll });
    },
  });
}
