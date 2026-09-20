/**
 * Auth token persistence.
 *
 * SecureStore (Keychain on iOS / EncryptedSharedPreferences on Android) — NOT
 * AsyncStorage, which is plain unencrypted files. AsyncStorage is used only for
 * non-sensitive preferences (see `preferences.ts`).
 */
import * as SecureStore from 'expo-secure-store';
import { SECURE_KEYS } from '@/constants/config';

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SECURE_KEYS.accessToken);
  } catch {
    // SecureStore is unavailable on web and can fail on a locked device.
    // A missing token just means "signed out".
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(SECURE_KEYS.accessToken, token);
  } catch (error) {
    console.warn('Could not persist the auth token securely.', error);
  }
}

export async function clearToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SECURE_KEYS.accessToken);
  } catch {
    // Already gone — nothing to do.
  }
}
