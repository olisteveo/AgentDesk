/**
 * Desk management API — CRUD for AI agent desks and their model assignments.
 */

import { apiRequest } from './client';

// ── Types ────────────────────────────────────────────────────

export interface DeskModel {
  id: string;
  desk_id: string;
  model_id: string;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
}

export interface Desk {
  id: string;
  name: string;
  desk_type: 'mini' | 'standard' | 'power';
  avatar_id: string;
  agent_name: string;
  agent_color: string;
  sort_order: number;
  is_active: boolean;
  description: string | null;
  category: string | null;
  capabilities: string[];
  system_prompt: string | null;
  created_at: string;
  models: DeskModel[];
}

export interface DeskUsage {
  deskId: string;
  deskName: string;
  agentName: string;
  todayCost: number;
  monthCost: number;
  daily: unknown[];
  byModel: unknown[];
}

// ── Endpoints ────────────────────────────────────────────────

/** List all active desks with their model assignments. */
export function listDesks(): Promise<Desk[]> {
  return apiRequest('/api/desks');
}

/** Create a new desk with initial model(s). */
export function createDesk(data: {
  name: string;
  agentName: string;
  agentColor?: string;
  avatarId?: string;
  deskType?: 'mini' | 'standard' | 'power';
  models: string[];
  category?: string;
  capabilities?: string[];
  description?: string;
  systemPrompt?: string;
}): Promise<Desk> {
  return apiRequest('/api/desks', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** Update desk metadata (name, avatar, agent name, colour, type, semantics). */
export function updateDesk(
  deskId: string,
  data: Partial<{
    name: string;
    agentName: string;
    agentColor: string;
    avatarId: string;
    deskType: 'mini' | 'standard' | 'power';
    category: string;
    capabilities: string[];
    description: string;
    systemPrompt: string;
  }>,
): Promise<Desk> {
  return apiRequest(`/api/desks/${deskId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/** Soft-delete a desk. */
export function deleteDesk(
  deskId: string,
): Promise<{ message: string; id: string; name: string }> {
  return apiRequest(`/api/desks/${deskId}`, { method: 'DELETE' });
}

/** Get cost analytics for a single desk. */
export function getDeskUsage(deskId: string): Promise<DeskUsage> {
  return apiRequest(`/api/desks/${deskId}/usage`);
}

/** Batch-update desk sort order. */
export function reorderDesks(
  order: { id: string; sortOrder: number }[],
): Promise<{ message: string }> {
  return apiRequest('/api/desks/reorder', {
    method: 'PATCH',
    body: JSON.stringify({ order }),
  });
}

// ── Model sub-endpoints ──────────────────────────────────────

/** Add a model to a desk. */
export function addModelToDesk(
  deskId: string,
  modelId: string,
): Promise<DeskModel> {
  return apiRequest(`/api/desks/${deskId}/models`, {
    method: 'POST',
    body: JSON.stringify({ modelId }),
  });
}

/** Remove a model from a desk. */
export function removeModelFromDesk(
  deskId: string,
  modelId: string,
): Promise<Desk> {
  return apiRequest(`/api/desks/${deskId}/models/${modelId}`, {
    method: 'DELETE',
  });
}

/** Set a model as the primary model on a desk. */
export function setPrimaryModel(
  deskId: string,
  modelId: string,
): Promise<Desk> {
  return apiRequest(`/api/desks/${deskId}/models/${modelId}/primary`, {
    method: 'PATCH',
  });
}
