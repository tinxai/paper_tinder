/** Safely open an external paper or PDF link. */
import * as Linking from 'expo-linking';
import { useCallback } from 'react';
import { Alert } from 'react-native';
import { isSafeExternalUrl } from '@/services/paperFormat';

export function useOpenUrl() {
  return useCallback(async (url: string | null | undefined, label = 'link') => {
    // Defence in depth: the backend filters these, but never hand an
    // unvalidated scheme to openURL.
    if (!isSafeExternalUrl(url)) {
      Alert.alert('Cannot open link', `This ${label} is unavailable or invalid.`);
      return;
    }

    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('Cannot open link', `Your device cannot open this ${label}.`);
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Cannot open link', `Something went wrong opening this ${label}.`);
    }
  }, []);
}
