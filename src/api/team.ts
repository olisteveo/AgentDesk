/**
 * Team management + cost analytics API.
 */

import { apiRequest } from './client';

// ── Types ────────────────────────────────────────────────────

export interface TeamInfo {
  id: string;
  name: string;
  slug: string;
  plan: string;
  max_desks: number;
  monthly_budget_usd: number;
  billing_email: string | null;
  created_at: string;
}

export interface TeamUsage {
  todayCost: number;
  monthCost: number;
  daily: DailyBreakdown[];
  byModel: ModelBreakdown[];
}

export interface DailyBreakdown {
  date: string;
  provider: string;
  model: string;
  total_cost: string;
  total_input: string;
  total_output: string;
  request_count: string;
}

export interface ModelBreakdown {
  model: string;
  provider: string;
  total_cost: string;
  total_input: string;
  total_output: string;
  request_count: string;
}

export interface DeskCostBreakdown {
  desk_id: string;
  agent_name: string;
  desk_name: string;
  total_cost: string;
  total_input: string;
  total_output: string;
  request_count: number;
  models_used: string[];
}

export interface CostAlert {
  id: string;
  alert_type: string;
  cost_usd: number;
  limit_usd: number;
  acknowledged: boolean;
  created_at: string;
}

// ── Endpoints ────────────────────────────────────────────────

/** Get current team info. */
export function getTeam(): Promise<TeamInfo> {
  return apiRequest('/api/team');
}

/** Update team name or billing email. */
export function updateTeam(
  data: Partial<{ name: string; billingEmail: string }>,
): Promise<TeamInfo> {
  return apiRequest('/api/team', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/** Get team-level cost dashboard. */
export function getTeamUsage(): Promise<TeamUsage> {
  return apiRequest('/api/team/usage');
}

/** Get per-desk cost breakdown. */
export function getUsageByDesk(): Promise<DeskCostBreakdown[]> {
  return apiRequest('/api/team/usage/by-desk');
}

/** Get per-user cost breakdown. */
export function getUsageByUser(): Promise<unknown[]> {
  return apiRequest('/api/team/usage/by-user');
}

/** List cost alerts. */
export function getCostAlerts(acknowledged?: boolean): Promise<CostAlert[]> {
  const qs = acknowledged !== undefined ? `?acknowledged=${acknowledged}` : '';
  return apiRequest(`/api/team/alerts${qs}`);
}

/** Acknowledge a single cost alert. */
export function acknowledgeCostAlert(alertId: string): Promise<CostAlert> {
  return apiRequest(`/api/team/alerts/${alertId}`, { method: 'PATCH' });
}

/** Acknowledge all cost alerts. */
export function acknowledgeAllAlerts(): Promise<{ acknowledged: number }> {
  return apiRequest('/api/team/alerts/acknowledge-all', { method: 'PATCH' });
}
