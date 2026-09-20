/** Zod schemas shared by the auth forms. */
import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required.')
  .email('Enter a valid email address.');

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required.'),
});

export const signUpSchema = z.object({
  email: emailSchema,
  // Mirrors the backend's rule, so the user sees the error before a round trip.
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(128, 'Password must be 128 characters or fewer.'),
});

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;

export const customInterestSchema = z
  .string()
  .trim()
  .min(2, 'Enter at least 2 characters.')
  .max(120, 'Keep it under 120 characters.');
