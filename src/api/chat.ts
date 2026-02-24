/**
 * AI Chat API — routes chat completions through the backend proxy.
 * Replaces the legacy ai.ts that called provider APIs directly from the browser.
 */

import { apiRequest } from './client';

// ── Types ────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  deskId: string;
  agentName: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
}

// ── Endpoints ────────────────────────────────────────────────

/**
 * Send a chat completion request through the backend.
 * The backend resolves the desk's primary model, decrypts the API key,
 * proxies to the correct provider, and records usage + cost.
 */
export function sendChat(
  deskId: string,
  messages: ChatMessage[],
  modelId?: string,
): Promise<ChatResponse> {
  return apiRequest('/api/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ deskId, modelId, messages }),
  });
}
