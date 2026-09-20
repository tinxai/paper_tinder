/**
 * Types mirroring the FastAPI schemas in `backend/app/schemas/`.
 * Keep these in sync with the OpenAPI document at http://localhost:8000/docs.
 */

export type SwipeDirection = 'left' | 'right';

export interface Author {
  author_id: string | null;
  name: string;
}

export interface Paper {
  id: string;
  title: string;
  abstract: string | null;
  year: number | null;
  publication_date: string | null;
  venue: string | null;
  citation_count: number;
  paper_url: string | null;
  pdf_url: string | null;
  authors: Author[];
  fields_of_study: string[];
}

export interface FeedPaper extends Paper {
  score: number | null;
  matched_interests: string[];
}

export interface SavedPaper extends Paper {
  saved_at: string;
}

export interface Page<T> {
  items: T[];
  total: number | null;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface FeedPage extends Page<FeedPaper> {
  /** "cache" means Semantic Scholar was unreachable and these are cached results. */
  source: 'live' | 'cache';
}

export interface User {
  id: string;
  email: string;
  created_at: string;
  has_completed_onboarding: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface Interest {
  id: number;
  name: string;
  normalized_name: string;
  is_suggested: boolean;
}

export interface InterestsResponse {
  items: Interest[];
}

export interface Swipe {
  id: string;
  paper_id: string;
  direction: SwipeDirection;
  created_at: string;
}

/** The error envelope every backend failure uses. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: {
      fields?: Record<string, string>;
      [key: string]: unknown;
    };
  };
}

export type SavedSortOption = 'newest' | 'oldest' | 'citations';
