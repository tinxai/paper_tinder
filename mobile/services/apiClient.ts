/**
 * The single place the app talks to the backend.
 *
 * Responsibilities:
 *   - resolve the base URL from Expo config (never a hardcoded localhost)
 *   - attach the bearer token automatically
 *   - enforce a request timeout
 *   - parse every failure into an ApiError
 *   - notify the app once when a 401 means the session is gone
 */
import { API_BASE_URL, REQUEST_TIMEOUT_MS } from '@/constants/config';
import {
  ApiError,
  NETWORK_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
  parseApiError,
} from './errors';
import { getToken } from './tokenStorage';

type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  /** Skip the Authorization header (register/login). */
  skipAuth?: boolean;
  signal?: AbortSignal;
}

/**
 * Registered by the auth provider. Called when the server rejects our token, so
 * the app can drop the session and route back to sign-in.
 */
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

function buildUrl(path: string, query?: Query): string {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, String(value));
  }
  const queryString = params.toString();
  return queryString ? `${url}?${queryString}` : url;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // Not JSON — a proxy error page, for instance.
    return text;
  }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, skipAuth = false, signal } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (!skipAuth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  // Time out rather than hanging: a wrong LAN IP otherwise spins forever.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abortExternally = () => controller.abort();
  signal?.addEventListener('abort', abortExternally);

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    // A caller-initiated cancel (component unmounted) is not an app error.
    if (signal?.aborted) throw error;
    const timedOut = error instanceof Error && error.name === 'AbortError';
    throw new ApiError(timedOut ? TIMEOUT_ERROR_MESSAGE : NETWORK_ERROR_MESSAGE, {
      status: 0,
      code: timedOut ? 'timeout' : 'network_error',
    });
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abortExternally);
  }

  if (response.status === 204) return undefined as T;

  const payload = await readBody(response);

  if (!response.ok) {
    const apiError = parseApiError(response.status, payload);
    if (apiError.isUnauthorized && !skipAuth) onUnauthorized?.();
    throw apiError;
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) =>
    request<T>(path, { method: 'GET', query, signal }),
  post: <T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>,
  ) => request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
