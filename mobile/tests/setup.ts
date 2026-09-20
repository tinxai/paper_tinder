/**
 * Jest setup.
 *
 * Native modules are mocked because they have no JS implementation outside a
 * real device/simulator. Everything else runs for real.
 */

// SecureStore / AsyncStorage: in-memory stand-ins so storage code paths run.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => store.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        store.delete(key);
      }),
      multiRemove: jest.fn(async (keys: string[]) => {
        keys.forEach((key) => store.delete(key));
      }),
    },
  };
});

jest.mock('expo-linking', () => ({
  openURL: jest.fn(async () => true),
  canOpenURL: jest.fn(async () => true),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useSegments: () => [],
  useLocalSearchParams: () => ({}),
  Link: 'Link',
  Stack: { Screen: 'Stack.Screen' },
  Tabs: { Screen: 'Tabs.Screen' },
  Redirect: 'Redirect',
}));

// Reanimated 4 needs no manual mock here: `react-native-worklets/jest/resolver.js`
// (wired up in package.json) keeps Jest off the native-only worklet modules.

// Silence the RN animation-helper warning that the Reanimated mock triggers.
jest
  .spyOn(console, 'warn')
  .mockImplementation((message?: unknown, ...rest: unknown[]) => {
    if (typeof message === 'string' && message.includes('useNativeDriver')) return;
    // eslint-disable-next-line no-console
    console.info(message, ...rest);
  });
