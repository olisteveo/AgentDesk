/**
 * Centralized API client with JWT auto-attach and auto-refresh.
 *
 * Every authenticated request reads the access token from localStorage,
 * attaches it as a Bearer header, and — on a 401 — attempts a single
 * token refresh before retrying the original request.
 */

// ── Types ────────────────────────────────────────────────────

export interface ApiError {
  status: number;
  message: string;
  // Tier limit metadata (present on 403 limit-reached responses)
  limitType?: string;
  current?: number;
  max?: number;
  plan?: string;
}

// ── Token helpers ────────────────────────────────────────────

const TOKEN_KEYS = {
  access: 'accessToken',
  refresh: 'refreshToken',
  user: 'user',
} as const;

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEYS.access);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(TOKEN_KEYS.refresh);
}

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(TOKEN_KEYS.access, access);
  localStorage.setItem(TOKEN_KEYS.refresh, refresh);
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEYS.access);
  localStorage.removeItem(TOKEN_KEYS.refresh);
  localStorage.removeItem(TOKEN_KEYS.user);
}

// ── Refresh logic (single in-flight guard) ───────────────────

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  // Deduplicate: if a refresh is already in-flight, wait for it
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) throw createApiError(401, 'No refresh token');

    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      clearTokens();
      throw createApiError(res.status, 'Session expired — please log in again');
    }

    const data = await res.json();
    setTokens(data.accessToken, data.refreshToken);
    return data.accessToken as string;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

// ── Core request function ────────────────────────────────────

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);

  // Always send JSON unless explicitly overridden
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Attach Bearer token if available
  const token = getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(endpoint, { ...options, headers });

  // On 401 → try refresh once → retry original request
  if (res.status === 401 && token) {
    try {
      const newToken = await refreshAccessToken();
      headers.set('Authorization', `Bearer ${newToken}`);
      const retry = await fetch(endpoint, { ...options, headers });
      return handleResponse<T>(retry);
    } catch {
      // Refresh failed — force logout
      clearTokens();
      throw createApiError(401, 'Session expired — please log in again');
    }
  }

  return handleResponse<T>(res);
}

// ── Response parsing ─────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Include details if the backend sent them (e.g. AI provider errors)
    let message = body.error || `Request failed (${res.status})`;
    if (body.details) {
      message += `: ${body.details}`;
    }
    throw createApiError(res.status, message, body);
  }
  // 204 No Content — no body to parse
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Error factory ────────────────────────────────────────────

function createApiError(
  status: number,
  message: string,
  body?: Record<string, unknown>,
): ApiError {
  return {
    status,
    message,
    // Pass through tier limit metadata when present (403 limit-reached)
    limitType: body?.limitType as string | undefined,
    current: body?.current as number | undefined,
    max: body?.max as number | undefined,
    plan: body?.plan as string | undefined,
  };
}
