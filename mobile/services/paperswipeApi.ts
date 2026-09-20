/** Typed wrappers for every backend endpoint. */
import { FEED_PAGE_SIZE, SAVED_PAGE_SIZE } from '@/constants/config';
import type {
  FeedPage,
  InterestsResponse,
  Page,
  Paper,
  SavedPaper,
  SavedSortOption,
  Swipe,
  SwipeDirection,
  TokenResponse,
  User,
} from '@/types/api';
import { api } from './apiClient';

const V1 = '/api/v1';

// --- auth ---------------------------------------------------------------

export function register(email: string, password: string): Promise<TokenResponse> {
  return api.post<TokenResponse>(
    `${V1}/auth/register`,
    { email, password },
    { skipAuth: true },
  );
}

export function login(email: string, password: string): Promise<TokenResponse> {
  return api.post<TokenResponse>(
    `${V1}/auth/login`,
    { email, password },
    { skipAuth: true },
  );
}

export function fetchCurrentUser(): Promise<User> {
  return api.get<User>(`${V1}/auth/me`);
}

export function deleteAccount(): Promise<void> {
  return api.delete<void>(`${V1}/auth/me`);
}

// --- interests ----------------------------------------------------------

export function fetchSuggestedInterests(): Promise<InterestsResponse> {
  return api.get<InterestsResponse>(`${V1}/interests`);
}

export function fetchMyInterests(): Promise<InterestsResponse> {
  return api.get<InterestsResponse>(`${V1}/users/me/interests`);
}

export function updateMyInterests(names: string[]): Promise<InterestsResponse> {
  return api.put<InterestsResponse>(`${V1}/users/me/interests`, { names });
}

// --- papers -------------------------------------------------------------

export function fetchFeed(offset = 0, limit = FEED_PAGE_SIZE): Promise<FeedPage> {
  return api.get<FeedPage>(`${V1}/papers/feed`, { offset, limit });
}

export function fetchPaper(paperId: string): Promise<Paper> {
  return api.get<Paper>(`${V1}/papers/${encodeURIComponent(paperId)}`);
}

export interface SavedPapersQuery {
  offset?: number;
  limit?: number;
  q?: string;
  year?: number;
  sort?: SavedSortOption;
}

export function fetchSavedPapers(
  query: SavedPapersQuery = {},
): Promise<Page<SavedPaper>> {
  const { offset = 0, limit = SAVED_PAGE_SIZE, q, year, sort = 'newest' } = query;
  return api.get<Page<SavedPaper>>(`${V1}/papers/saved`, {
    offset,
    limit,
    q,
    year,
    sort,
  });
}

// --- swipes -------------------------------------------------------------

export function createSwipe(paperId: string, direction: SwipeDirection): Promise<Swipe> {
  return api.post<Swipe>(`${V1}/swipes`, { paper_id: paperId, direction });
}

export function deleteSwipe(paperId: string): Promise<void> {
  return api.delete<void>(`${V1}/swipes/${encodeURIComponent(paperId)}`);
}
