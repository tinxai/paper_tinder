/**
 * Runtime configuration, read from Expo's environment.
 *
 * The base URL is resolved ONCE here so no screen or service hardcodes a host.
 * See `mobile/.env.example` for how to point a physical iPhone at your Mac.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

function resolveApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');

  // No EXPO_PUBLIC_API_URL set. In dev, infer the host from the Metro bundler
  // address — that is already reachable from whatever device is running the
  // app, which makes a physical iPhone work without any manual IP entry.
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants.manifest2 as any)?.extra?.expoGo?.developer?.host;

  if (__DEV__ && typeof hostUri === 'string' && hostUri.length > 0) {
    const host = hostUri.split(':')[0];
    if (host) return `http://${host}:8000`;
  }

  // Last resort. Works on an iOS simulator; an Android emulator needs 10.0.2.2.
  return Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000';
}

export const API_BASE_URL = resolveApiBaseUrl();

/** Fail a request rather than letting the UI hang forever. */
export const REQUEST_TIMEOUT_MS = 15000;

/** Fetch the next page once the visible queue drops to this many cards. */
export const FEED_PREFETCH_THRESHOLD = 4;

export const FEED_PAGE_SIZE = 10;
export const SAVED_PAGE_SIZE = 20;

/** Storage keys. Tokens live in SecureStore; only these go in AsyncStorage. */
export const STORAGE_KEYS = {
  themePreference: 'paperswipe.theme-preference',
  onboardingComplete: 'paperswipe.onboarding-complete',
} as const;

export const SECURE_KEYS = {
  accessToken: 'paperswipe.access-token',
} as const;
