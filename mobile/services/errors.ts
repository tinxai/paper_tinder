/**
 * One error type for everything the API layer can produce, so screens have a
 * single shape to render.
 */
import type { ApiErrorBody } from '@/types/api';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Field-level validation messages, keyed by field name. */
  readonly fieldErrors: Record<string, string>;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      fieldErrors?: Record<string, string>;
    } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status ?? 0;
    this.code = options.code ?? 'unknown_error';
    this.fieldErrors = options.fieldErrors ?? {};
  }

  /** True when the request never reached the server (airplane mode, wrong IP). */
  get isNetworkError(): boolean {
    return this.status === 0;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** Upstream is down or rate-limited — a retry may well succeed. */
  get isRetryable(): boolean {
    return this.isNetworkError || this.status === 503 || this.status === 429;
  }
}

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

export const NETWORK_ERROR_MESSAGE =
  'Could not reach the server. Check your connection and that the backend is running.';

export const TIMEOUT_ERROR_MESSAGE =
  'The server took too long to respond. Please try again.';

/**
 * Turn any backend response body into an ApiError.
 *
 * Tolerates a body that is not our envelope at all — a proxy's HTML error page,
 * an empty 502, FastAPI's own `{detail: ...}` — because those genuinely happen
 * and must not surface as "[object Object]".
 */
export function parseApiError(status: number, body: unknown): ApiError {
  if (body && typeof body === 'object' && 'error' in body) {
    const envelope = (body as ApiErrorBody).error;
    if (envelope && typeof envelope === 'object') {
      const fields = envelope.details?.fields;
      return new ApiError(
        typeof envelope.message === 'string' && envelope.message
          ? envelope.message
          : FALLBACK_MESSAGE,
        {
          status,
          code: typeof envelope.code === 'string' ? envelope.code : 'unknown_error',
          fieldErrors:
            fields && typeof fields === 'object'
              ? (fields as Record<string, string>)
              : undefined,
        },
      );
    }
  }

  // FastAPI's default shape, e.g. from a middleware that bypasses our handlers.
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string' && detail) {
      return new ApiError(detail, { status });
    }
  }

  if (typeof body === 'string' && body.trim() && body.length < 200) {
    return new ApiError(body.trim(), { status });
  }

  return new ApiError(statusFallbackMessage(status), { status });
}

function statusFallbackMessage(status: number): string {
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'You do not have access to this.';
  if (status === 404) return 'Not found.';
  if (status === 429) return 'Too many requests. Please wait a moment.';
  if (status >= 500) return 'The server is having trouble. Please try again shortly.';
  return FALLBACK_MESSAGE;
}

/** Best-effort user-facing message for anything thrown anywhere in the app. */
export function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return FALLBACK_MESSAGE;
}
