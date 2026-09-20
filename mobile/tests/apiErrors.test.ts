/** Error parsing: every failure shape the backend (or a proxy) can produce. */
import { ApiError, parseApiError, toErrorMessage } from '@/services/errors';

describe('parseApiError', () => {
  it('reads the backend error envelope', () => {
    const error = parseApiError(409, {
      error: { code: 'conflict', message: 'An account with that email already exists.' },
    });

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.code).toBe('conflict');
    expect(error.message).toBe('An account with that email already exists.');
  });

  it('extracts field-level validation errors', () => {
    const error = parseApiError(422, {
      error: {
        code: 'validation_error',
        message: 'Invalid input.',
        details: { fields: { email: 'Enter a valid email address.' } },
      },
    });

    expect(error.fieldErrors).toEqual({ email: 'Enter a valid email address.' });
  });

  it('falls back to a readable message for an empty body', () => {
    // A 502 from a proxy often has no body at all.
    const error = parseApiError(502, null);
    expect(error.message).toMatch(/server is having trouble/i);
    expect(error.message).not.toContain('[object Object]');
  });

  it("handles FastAPI's own {detail} shape", () => {
    const error = parseApiError(404, { detail: 'Paper not found' });
    expect(error.message).toBe('Paper not found');
  });

  it('does not render an HTML error page as the message', () => {
    const html = `<html><body>${'x'.repeat(500)}</body></html>`;
    const error = parseApiError(500, html);
    expect(error.message).not.toContain('<html>');
    expect(error.message).toMatch(/server is having trouble/i);
  });

  it('gives a specific message for 401', () => {
    expect(parseApiError(401, null).message).toMatch(/session has expired/i);
  });

  it('survives a malformed envelope', () => {
    expect(parseApiError(400, { error: 'not an object' }).message).toBeTruthy();
    expect(parseApiError(400, { error: {} }).message).toBeTruthy();
    expect(parseApiError(400, []).message).toBeTruthy();
  });
});

describe('ApiError classification', () => {
  it('treats a status of 0 as a network error', () => {
    const error = new ApiError('Offline', { status: 0 });
    expect(error.isNetworkError).toBe(true);
    expect(error.isRetryable).toBe(true);
  });

  it('marks 503 and 429 retryable', () => {
    expect(new ApiError('x', { status: 503 }).isRetryable).toBe(true);
    expect(new ApiError('x', { status: 429 }).isRetryable).toBe(true);
  });

  it('marks client errors non-retryable', () => {
    // Retrying a 404 or 422 would just delay showing the real error.
    expect(new ApiError('x', { status: 404 }).isRetryable).toBe(false);
    expect(new ApiError('x', { status: 422 }).isRetryable).toBe(false);
  });

  it('flags 401 as unauthorized', () => {
    expect(new ApiError('x', { status: 401 }).isUnauthorized).toBe(true);
  });
});

describe('toErrorMessage', () => {
  it('unwraps ApiError, Error, and anything else', () => {
    expect(toErrorMessage(new ApiError('Specific failure', { status: 400 }))).toBe(
      'Specific failure',
    );
    expect(toErrorMessage(new Error('Plain failure'))).toBe('Plain failure');
    expect(toErrorMessage('a bare string')).toMatch(/went wrong/i);
    expect(toErrorMessage(undefined)).toMatch(/went wrong/i);
  });
});
