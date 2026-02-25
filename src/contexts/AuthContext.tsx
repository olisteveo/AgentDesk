/**
 * AuthContext — single source of truth for authentication state.
 *
 * Wraps the entire app via <AuthProvider>. Components access auth
 * state through the useAuth() hook.
 *
 * Token storage:
 *   localStorage.accessToken  — short-lived JWT (15 min)
 *   localStorage.refreshToken — long-lived JWT (7 days)
 *   localStorage.user         — serialised user object
 *
 * On mount the provider checks localStorage for an existing session
 * and restores it (avoiding a flash of the login page on refresh).
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';

import * as authApi from '../api/auth';
import { setTokens, clearTokens, getAccessToken } from '../api/client';
import type { AuthResponse, LoginRequest, RegisterRequest } from '../api/auth';

// ── User type ────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  teamId: string;
  teamName: string;
  plan: string;
  emailVerified: boolean;
  planSelected: boolean;
  onboardingDone: boolean;
  avatarId: string;
  hasPassword: boolean;
}

// ── Context type ─────────────────────────────────────────────

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  googleLogin: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
  markEmailVerified: () => void;
  markOnboardingDone: (displayName: string, avatarId: string) => void;
  updateUser: (partial: Partial<AuthUser>) => void;
  /** Re-fetch the user's profile from the server and update local state. */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ── Provider ─────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session from localStorage on mount
  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        setUser(JSON.parse(stored));
      }
    } catch {
      clearTokens();
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Persist user + tokens from an auth response
  const persistSession = useCallback((res: AuthResponse) => {
    setTokens(res.accessToken, res.refreshToken);

    const userData: AuthUser = {
      id: res.user.id,
      email: res.user.email,
      displayName: res.user.displayName,
      role: res.user.role,
      teamId: res.team.id,
      teamName: res.team.name,
      plan: res.team.plan ?? 'free',
      emailVerified: res.user.emailVerified ?? true,
      planSelected: res.user.planSelected ?? true,
      onboardingDone: res.user.onboardingDone ?? false,
      avatarId: res.user.avatarId ?? 'avatar1',
      hasPassword: res.user.hasPassword ?? true,
    };

    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  }, []);

  const login = useCallback(
    async (data: LoginRequest) => {
      const res = await authApi.login(data);
      persistSession(res);
    },
    [persistSession],
  );

  const register = useCallback(
    async (data: RegisterRequest) => {
      const res = await authApi.register(data);
      persistSession(res);
    },
    [persistSession],
  );

  const googleLogin = useCallback(
    async (credential: string) => {
      const res = await authApi.googleAuth(credential);
      persistSession(res);
    },
    [persistSession],
  );

  const markEmailVerified = useCallback(() => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, emailVerified: true };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const markOnboardingDone = useCallback((displayName: string, avatarId: string) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, onboardingDone: true, displayName, avatarId };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const updateUser = useCallback((partial: Partial<AuthUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...partial };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const refreshUser = useCallback(async () => {
    const res = await authApi.fetchMe();
    const userData: AuthUser = {
      id: res.user.id,
      email: res.user.email,
      displayName: res.user.displayName,
      role: res.user.role,
      teamId: res.team.id,
      teamName: res.team.name,
      plan: res.team.plan ?? 'free',
      emailVerified: res.user.emailVerified ?? true,
      planSelected: res.user.planSelected ?? true,
      onboardingDone: res.user.onboardingDone ?? false,
      avatarId: res.user.avatarId ?? 'avatar1',
      hasPassword: res.user.hasPassword ?? true,
    };
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore errors — we clear locally regardless
    } finally {
      clearTokens();
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        isLoading,
        login,
        register,
        googleLogin,
        logout,
        markEmailVerified,
        markOnboardingDone,
        updateUser,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
