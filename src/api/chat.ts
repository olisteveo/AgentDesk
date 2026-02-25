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

// ── Chat History (persisted 1-on-1 conversations) ──────────

export interface PersistedMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model: string | null;
  cost_usd: string;
  created_at: string;
}

/** Fetch persisted chat history for a desk (newest 50). */
export async function getChatHistory(
  deskId: string,
): Promise<PersistedMessage[]> {
  const res = await apiRequest<{ messages: PersistedMessage[] }>(
    `/api/chat-history/${deskId}`,
  );
  return res.messages;
}

/** Save a user+assistant message pair and auto-prune beyond cap. */
export function saveChatMessages(
  deskId: string,
  userContent: string,
  assistantContent: string,
  model?: string,
  costUsd?: number,
): Promise<{ ok: boolean }> {
  return apiRequest(`/api/chat-history/${deskId}`, {
    method: 'POST',
    body: JSON.stringify({ userContent, assistantContent, model, costUsd }),
  });
}

/** Clear all chat history for a desk. */
export function clearChatHistory(
  deskId: string,
): Promise<{ ok: boolean }> {
  return apiRequest(`/api/chat-history/${deskId}`, {
    method: 'DELETE',
  });
}
