/**
 * Non-sensitive preferences in AsyncStorage.
 *
 * Deliberately limited to things that are harmless if read off the device:
 * the chosen theme and whether onboarding was completed. Tokens go to
 * SecureStore (see `tokenStorage.ts`).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants/config';

export type ThemePreference = 'system' | 'light' | 'dark';

export async function getThemePreference(): Promise<ThemePreference> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.themePreference);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // Fall through to the default.
  }
  return 'system';
}

export async function setThemePreference(value: ThemePreference): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.themePreference, value);
  } catch (error) {
    console.warn('Could not save the theme preference.', error);
  }
}

export async function clearPreferences(): Promise<void> {
  try {
    await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
  } catch {
    // Non-critical.
  }
}
