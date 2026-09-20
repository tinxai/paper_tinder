/** Every React Query key in one place, so invalidation cannot drift. */
import type { SavedPapersQuery } from '@/services/paperswipeApi';

export const queryKeys = {
  feed: ['feed'] as const,
  savedPapers: (query: SavedPapersQuery = {}) => ['saved-papers', query] as const,
  savedPapersAll: ['saved-papers'] as const,
  paper: (paperId: string) => ['paper', paperId] as const,
  myInterests: ['interests', 'mine'] as const,
  suggestedInterests: ['interests', 'suggested'] as const,
  currentUser: ['auth', 'me'] as const,
};
