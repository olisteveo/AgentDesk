/**
 * Rules API client — CRUD operations for the Rules Dashboard.
 */

import { apiRequest } from './client';
import type { Rule, RulesResponse } from '../types/rules';

/** Fetch all rules for the team (grouped by scope + pending). */
export function listRules(params?: {
  scope?: 'team' | 'desk';
  deskId?: string;
  status?: string;
}): Promise<RulesResponse> {
  const qs = new URLSearchParams();
  if (params?.scope) qs.set('scope', params.scope);
  if (params?.deskId) qs.set('deskId', params.deskId);
  if (params?.status) qs.set('status', params.status);
  const query = qs.toString();
  return apiRequest(`/api/rules${query ? `?${query}` : ''}`);
}

/** Create a new rule. */
export function createRule(data: {
  title: string;
  content: string;
  scope: 'team' | 'desk';
  deskId?: string;
  category?: string;
}): Promise<Rule> {
  return apiRequest('/api/rules', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** Update a rule's fields. */
export function updateRule(
  ruleId: string,
  data: Partial<{ title: string; content: string; category: string }>,
): Promise<Rule> {
  return apiRequest(`/api/rules/${ruleId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/** Toggle a rule active/disabled. */
export function toggleRule(ruleId: string, enabled: boolean): Promise<Rule> {
  return apiRequest(`/api/rules/${ruleId}/toggle`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
}

/** Approve a pending AI suggestion. */
export function approveRule(
  ruleId: string,
  edits?: { title?: string; content?: string },
): Promise<Rule> {
  return apiRequest(`/api/rules/${ruleId}/approve`, {
    method: 'PATCH',
    body: JSON.stringify(edits || {}),
  });
}

/** Reject a pending AI suggestion. */
export function rejectRule(ruleId: string): Promise<Rule> {
  return apiRequest(`/api/rules/${ruleId}/reject`, { method: 'PATCH' });
}

/** Bulk reorder rules. */
export function reorderRules(
  rules: { id: string; sortOrder: number }[],
): Promise<void> {
  return apiRequest('/api/rules/reorder', {
    method: 'PUT',
    body: JSON.stringify({ rules }),
  });
}

/** Delete a rule permanently. */
export function deleteRule(ruleId: string): Promise<void> {
  return apiRequest(`/api/rules/${ruleId}`, { method: 'DELETE' });
}

/** Change the team's core rules preset. */
export function changeCorePreset(presetId: string): Promise<{ message: string; corePreset: unknown }> {
  return apiRequest('/api/rules/core-preset', {
    method: 'PATCH',
    body: JSON.stringify({ presetId }),
  });
}
