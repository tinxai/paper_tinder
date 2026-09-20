/** Interest catalogue and the signed-in user's selection. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/services/errors';
import * as apiService from '@/services/paperswipeApi';
import { queryKeys } from './queryKeys';

export function useSuggestedInterests() {
  return useQuery({
    queryKey: queryKeys.suggestedInterests,
    queryFn: () => apiService.fetchSuggestedInterests(),
    // The catalogue barely changes; avoid refetching it on every mount.
    staleTime: 10 * 60_000,
    retry: (count, error) =>
      !(error instanceof ApiError && !error.isRetryable) && count < 2,
  });
}

export function useMyInterests() {
  return useQuery({
    queryKey: queryKeys.myInterests,
    queryFn: () => apiService.fetchMyInterests(),
  });
}

export function useUpdateInterests() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (names: string[]) => apiService.updateMyInterests(names),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.myInterests, data);
      // Interests drive the feed, so the existing feed is now stale.
      void queryClient.invalidateQueries({ queryKey: queryKeys.feed });
      void queryClient.invalidateQueries({ queryKey: queryKeys.currentUser });
    },
  });
}
