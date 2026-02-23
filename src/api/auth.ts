/**
 * Auth API — typed wrappers for /api/auth endpoints.
 *
 * Response shapes match the backend exactly
 * (see agentDesk_backend/src/routes/auth.ts).
 */

import { apiRequest } from './client';

// ── Request types ────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  teamName: string;
  displayName: string;
  email: string;
  password: string;
}

// ── Response types (match backend) ───────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  emailVerified?: boolean;
  planSelected?: boolean;
  onboardingDone?: boolean;
  avatarId?: string;
}

export interface AuthTeam {
  id: string;
  name: string;
  slug: string;
  plan?: string;
}

export interface AuthResponse {
  user: AuthUser;
  team: AuthTeam;
  accessToken: string;
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

// ── API functions ────────────────────────────────────────────

export function login(data: LoginRequest): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function register(data: RegisterRequest): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function logout(): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('/api/auth/logout', {
    method: 'POST',
  });
}

export function refresh(refreshToken: string): Promise<RefreshResponse> {
  return apiRequest<RefreshResponse>('/api/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
}

export function verifyEmail(token: string): Promise<{ message: string; email: string }> {
  return apiRequest<{ message: string; email: string }>('/api/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function resendVerification(): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('/api/auth/resend-verification', {
    method: 'POST',
  });
}

export function googleAuth(credential: string): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  });
}

export function selectPlan(
  plan: 'free' | 'pro',
): Promise<{ message: string; plan: string; maxDesks: number; monthlyBudget: number }> {
  return apiRequest('/api/auth/select-plan', {
    method: 'PATCH',
    body: JSON.stringify({ plan }),
  });
}

export function completeOnboarding(
  displayName: string,
  avatarId: string,
): Promise<{ message: string; displayName: string; avatarId: string }> {
  return apiRequest('/api/auth/onboarding', {
    method: 'PATCH',
    body: JSON.stringify({ displayName, avatarId }),
  });
}

export function deleteAccount(password?: string): Promise<{ message: string }> {
  return apiRequest('/api/auth/account', {
    method: 'DELETE',
    ...(password ? { body: JSON.stringify({ password }) } : {}),
  });
}
