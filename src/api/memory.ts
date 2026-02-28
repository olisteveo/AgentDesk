/**
 * Memory API — agent memory management (episodic + semantic).
 */

import { apiRequest } from './client';

// ── Types ────────────────────────────────────────────────────

export interface EpisodicMemoryItem {
  id: string;
  source: 'chat' | 'task' | 'meeting';
  sourceId: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  interactionAt: string;
  createdAt: string;
}

export interface SemanticFactItem {
  id: string;
  fact: string;
  category: string;
  confidence: number;
  sourceCount: number;
  lastRefreshed: string;
  createdAt: string;
  updatedAt: string;
}

interface MemoryListResponse {
  memories: EpisodicMemoryItem[];
  total: number;
  limit: number;
  offset: number;
}

interface FactListResponse {
  facts: SemanticFactItem[];
}

// ── Endpoints ────────────────────────────────────────────────

/** Fetch episodic memories for an agent desk (decrypted, paginated). */
export async function getAgentMemories(
  deskId: string,
  limit = 50,
  offset = 0,
): Promise<MemoryListResponse> {
  return apiRequest<MemoryListResponse>(
    `/api/memory/${deskId}?limit=${limit}&offset=${offset}`,
  );
}

/** Fetch semantic facts for an agent desk (decrypted). */
export async function getAgentFacts(
  deskId: string,
): Promise<SemanticFactItem[]> {
  const res = await apiRequest<FactListResponse>(`/api/memory/${deskId}/facts`);
  return res.facts;
}

/** Delete a single memory (episodic or semantic). */
export function deleteMemory(
  deskId: string,
  memoryId: string,
): Promise<{ success: boolean }> {
  return apiRequest(`/api/memory/${deskId}/${memoryId}`, {
    method: 'DELETE',
  });
}

/** Wipe all memories for an agent desk. */
export function wipeAgentMemory(
  deskId: string,
): Promise<{ success: boolean; message: string }> {
  return apiRequest(`/api/memory/${deskId}`, {
    method: 'DELETE',
  });
}

/** Signal the end of a chat session to trigger memory generation. */
export function signalChatSessionEnd(
  deskId: string,
): Promise<{ ok: boolean; memoryGenerated: boolean }> {
  return apiRequest(`/api/chat-history/${deskId}/end-session`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
