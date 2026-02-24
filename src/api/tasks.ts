/**
 * Task management API — create, list, update, and execute tasks via backend AI.
 */

import { apiRequest } from './client';

// ── Types ────────────────────────────────────────────────────

export interface TaskRow {
  id: string;
  team_id: string;
  desk_id: string | null;
  title: string;
  description: string | null;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  cost_usd: number | null;
  model_used: string | null;
  assigned_model_id: string | null;
  priority: number;
  deadline: string | null;
  result: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
  agent_name?: string;
}

export interface TaskRunResult {
  taskId: string;
  status: string;
  model: string;
  agentName: string;
  result: string;
  costUsd: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
}

export interface TaskLogEntry {
  message: string;
  created_at: string;
}

// ── Endpoints ────────────────────────────────────────────────

/** List tasks (filterable). */
export function listTasks(params?: {
  status?: string;
  deskId?: string;
  priority?: number;
  limit?: number;
  offset?: number;
}): Promise<TaskRow[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.deskId) qs.set('deskId', params.deskId);
  if (params?.priority) qs.set('priority', String(params.priority));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  const query = qs.toString();
  return apiRequest(`/api/tasks${query ? `?${query}` : ''}`);
}

/** Create a new task. */
export function createTask(data: {
  title: string;
  description?: string;
  deskId?: string;
  assignedModelId?: string;
  priority?: number;
  deadline?: string;
}): Promise<TaskRow> {
  return apiRequest('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** Update a task (status, priority, assignment, etc.). */
export function updateTask(
  taskId: string,
  data: Partial<{
    status: string;
    priority: number;
    deadline: string | null;
    deskId: string | null;
    assignedModelId: string | null;
    description: string;
  }>,
): Promise<TaskRow> {
  return apiRequest(`/api/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/** Get AI result for a task. */
export function getTaskResult(taskId: string): Promise<TaskRow> {
  return apiRequest(`/api/tasks/${taskId}/result`);
}

/** Execute a task against AI (the desk's model). */
export function runTask(taskId: string): Promise<TaskRunResult> {
  return apiRequest(`/api/tasks/${taskId}/run`, { method: 'POST' });
}

/** Get recent task activity log. */
export function getTaskLog(): Promise<TaskLogEntry[]> {
  return apiRequest('/api/tasks/log');
}
