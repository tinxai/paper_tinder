/**
 * Root layout: providers, then a gate that routes by auth + onboarding state.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LoadingState } from '@/components/StateViews';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { ThemeProvider, useTheme } from '@/hooks/useTheme';
import { ApiError } from '@/services/errors';

void SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden — not a failure worth surfacing.
});

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // A 4xx will fail the same way every time; retrying only delays the
        // error the user needs to see.
        retry: (failureCount, error) => {
          if (error instanceof ApiError && !error.isRetryable) return false;
          return failureCount < 2;
        },
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  });
}

/** Sends the user to the right stack once auth state is known. */
function NavigationGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  // A latch, not render state: hiding the splash changes nothing we draw.
  const splashHidden = useRef(false);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/welcome');
    } else if (isAuthenticated && !user?.has_completed_onboarding && !inOnboarding) {
      // Signed in but no interests yet — onboarding is mandatory, because the
      // feed cannot rank anything without them.
      router.replace('/onboarding');
    } else if (isAuthenticated && user?.has_completed_onboarding && inAuthGroup) {
      router.replace('/(tabs)/discover');
    }
  }, [isAuthenticated, isLoading, user?.has_completed_onboarding, segments, router]);

  useEffect(() => {
    if (!isLoading && !splashHidden.current) {
      splashHidden.current = true;
      void SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [isLoading]);

  if (isLoading) return <LoadingState message="Signing you in…" />;
  return <>{children}</>;
}

function RootStack() {
  const { colors, scheme } = useTheme();

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '600' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="onboarding"
          options={{ title: 'Your interests', headerBackVisible: false }}
        />
        <Stack.Screen name="paper/[id]" options={{ title: 'Paper' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(makeQueryClient);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AuthProvider>
              <NavigationGate>
                <RootStack />
              </NavigationGate>
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
