/**
 * Provider management API — connects to backend endpoints for
 * encrypted API key storage, validation, and model discovery.
 */

import { apiRequest } from './client';

// ── Types ────────────────────────────────────────────────────

export interface ProviderConnection {
  id: string;
  provider: string;
  isConnected: boolean;
  apiKeyMasked: string;
  lastUsedAt: string | null;
  createdAt: string;
  warning?: string;
}

export interface ValidateResult {
  valid: boolean;
  provider: string;
  models?: ProviderModel[];
  error?: string;
  warning?: string;
}

export interface DetectResult {
  valid: boolean;
  provider: string | null;
  models: ProviderModel[];
  confidence: 'certain' | 'trial';
  error?: string;
  warning?: string;
}

export interface ProviderModel {
  id: string;
  name: string;
}

export interface ModelDiscoveryResult {
  provider: string;
  models: ProviderModel[];
}

// ── Endpoints ────────────────────────────────────────────────

/** List all connected providers (keys are masked). */
export function listProviders(): Promise<ProviderConnection[]> {
  return apiRequest('/api/providers');
}

/** Auto-detect provider from a raw API key, validate, and return models. */
export function detectProvider(
  apiKey: string,
): Promise<DetectResult> {
  return apiRequest('/api/providers/detect', {
    method: 'POST',
    body: JSON.stringify({ apiKey }),
  });
}

/** Validate an API key before saving it (no storage). */
export function validateKey(
  provider: string,
  apiKey: string,
): Promise<ValidateResult> {
  return apiRequest('/api/providers/validate', {
    method: 'POST',
    body: JSON.stringify({ provider, apiKey }),
  });
}

/** Save (or upsert) an API key for a provider. Optionally stores a validation warning. */
export function connectProvider(
  provider: string,
  apiKey: string,
  warning?: string,
): Promise<ProviderConnection> {
  return apiRequest('/api/providers', {
    method: 'POST',
    body: JSON.stringify({ provider, apiKey, warning }),
  });
}

/** Soft-delete (deactivate) a provider credential. */
export function disconnectProvider(
  credentialId: string,
): Promise<{ message: string; id: string; provider: string }> {
  return apiRequest(`/api/providers/${credentialId}`, {
    method: 'DELETE',
  });
}

/** Test an already-stored API key. */
export function testProvider(
  credentialId: string,
): Promise<{ valid: boolean; error?: string; warning?: string }> {
  return apiRequest(`/api/providers/${credentialId}/test`, {
    method: 'POST',
  });
}

/** Discover available models for a connected provider. */
export function discoverModels(
  credentialId: string,
): Promise<ModelDiscoveryResult> {
  return apiRequest(`/api/providers/${credentialId}/models`);
}

/** Update (rotate) the API key for an existing credential. */
export function rotateKey(
  credentialId: string,
  apiKey: string,
): Promise<ProviderConnection> {
  return apiRequest(`/api/providers/${credentialId}`, {
    method: 'PATCH',
    body: JSON.stringify({ apiKey }),
  });
}
