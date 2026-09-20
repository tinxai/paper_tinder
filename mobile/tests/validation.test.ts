/** Auth form validation rules (Zod schemas shared with the backend's rules). */
import { customInterestSchema, signInSchema, signUpSchema } from '@/services/validation';

describe('signUpSchema', () => {
  it('accepts a valid email and password', () => {
    const result = signUpSchema.safeParse({
      email: 'researcher@university.edu',
      password: 'sup3rsecret!',
    });
    expect(result.success).toBe(true);
  });

  it.each([
    ['not-an-email', 'missing @'],
    ['missing@domain', 'no TLD'],
    ['@example.com', 'no local part'],
    ['', 'empty'],
  ])('rejects %s (%s)', (email) => {
    const result = signUpSchema.safeParse({ email, password: 'sup3rsecret!' });
    expect(result.success).toBe(false);
  });

  it('requires at least 8 characters, matching the backend', () => {
    const result = signUpSchema.safeParse({ email: 'a@b.com', password: 'short' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/at least 8 characters/i);
    }
  });

  it('rejects an over-long password rather than letting the server 422', () => {
    const result = signUpSchema.safeParse({
      email: 'a@b.com',
      password: 'x'.repeat(200),
    });
    expect(result.success).toBe(false);
  });

  it('trims surrounding whitespace from the email', () => {
    const result = signUpSchema.safeParse({
      email: '  spaced@example.com  ',
      password: 'sup3rsecret!',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('spaced@example.com');
  });
});

describe('signInSchema', () => {
  it('accepts any non-empty password', () => {
    // Sign-in must not enforce the sign-up length rule: an existing account
    // could predate it, and the failure belongs to the server anyway.
    const result = signInSchema.safeParse({ email: 'a@b.com', password: 'x' });
    expect(result.success).toBe(true);
  });

  it('still requires a password', () => {
    expect(signInSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(
      false,
    );
  });
});

describe('customInterestSchema', () => {
  it('accepts a reasonable topic', () => {
    expect(customInterestSchema.safeParse('Neurosymbolic reasoning').success).toBe(true);
  });

  it('rejects blank and over-long values', () => {
    expect(customInterestSchema.safeParse('   ').success).toBe(false);
    expect(customInterestSchema.safeParse('a').success).toBe(false);
    expect(customInterestSchema.safeParse('x'.repeat(200)).success).toBe(false);
  });

  it('trims the value', () => {
    const result = customInterestSchema.safeParse('  Robotics  ');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('Robotics');
  });
});
