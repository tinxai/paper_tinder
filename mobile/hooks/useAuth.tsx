/**
 * Authentication state.
 *
 * The token lives in SecureStore, so "stay signed in" works across app
 * restarts: on mount we read it back and revalidate it against /auth/me.
 */
import { useQueryClient } from '@tanstack/react-query';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { setUnauthorizedHandler } from '@/services/apiClient';
import * as apiService from '@/services/paperswipeApi';
import { clearPreferences } from '@/services/preferences';
import { clearToken, getToken, setToken } from '@/services/tokenStorage';
import type { User } from '@/types/api';

interface AuthContextValue {
  user: User | null;
  /** True until the stored token has been read and checked. */
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  const clearSession = useCallback(async () => {
    await clearToken();
    setUser(null);
    // Drop every cached query so the next user never sees the previous one's data.
    queryClient.clear();
  }, [queryClient]);

  // Restore the session on cold start.
  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const token = await getToken();
        if (!token) return;

        // The token may be expired or the account deleted — verify it.
        const currentUser = await apiService.fetchCurrentUser();
        if (active) setUser(currentUser);
      } catch {
        await clearToken();
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  // A 401 from anywhere means the session is gone; drop it once, centrally.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void clearSession();
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  const applyToken = useCallback(
    async (response: { access_token: string; user: User }) => {
      await setToken(response.access_token);
      setUser(response.user);
      queryClient.clear();
    },
    [queryClient],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      await applyToken(await apiService.login(email, password));
    },
    [applyToken],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      await applyToken(await apiService.register(email, password));
    },
    [applyToken],
  );

  const signOut = useCallback(async () => {
    await clearSession();
  }, [clearSession]);

  const deleteAccount = useCallback(async () => {
    await apiService.deleteAccount();
    await clearSession();
    await clearPreferences();
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    try {
      setUser(await apiService.fetchCurrentUser());
    } catch {
      // The API client's 401 handler already clears the session if needed.
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      signIn,
      signUp,
      signOut,
      deleteAccount,
      refreshUser,
    }),
    [user, isLoading, signIn, signUp, signOut, deleteAccount, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider.');
  return context;
}
