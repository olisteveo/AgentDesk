/**
 * Smart Task Routing API — classify tasks and record routing decisions.
 */

import { apiRequest } from './client';

// ── Types ────────────────────────────────────────────────────

export interface RoutingDeskScore {
  deskId: string;
  deskName: string;
  agentName: string;
  modelId: string;
  modelName: string;
  confidence: number;
  reasoning: string;
  estimatedCost: number;
  matchedCategory: string | null;
  matchedRuleIds: string[];
}

export interface ClassifyResponse {
  suggestions: RoutingDeskScore[];
  usedLlm: boolean;
  classifierModel: string | null;
  latencyMs: number;
}

export interface RoutingDecisionData {
  taskId?: string;
  taskTitle: string;
  taskDescription?: string;
  suggestedDeskId?: string;
  suggestedModelId?: string;
  confidence?: number;
  reasoning?: string;
  decision: 'accepted' | 'rejected' | 'modified' | 'skipped';
  finalDeskId?: string;
  finalModelId?: string;
  classifierModel?: string;
  classifierCostUsd?: number;
  classifierLatencyMs?: number;
  matchedRules?: string[];
}

export interface RoutingRule {
  id: string;
  team_id: string;
  rule_type: string;
  source: string;
  condition: Record<string, unknown>;
  action: Record<string, unknown>;
  priority: number;
  is_active: boolean;
  hit_count: number;
  success_count: number;
  created_at: string;
  updated_at: string;
}

// ── Endpoints ────────────────────────────────────────────────

/** Classify a task and get desk/model suggestions. */
export function classifyTask(data: {
  title: string;
  description?: string;
  isCodeTask?: boolean;
  preSelectedDeskId?: string;
}): Promise<ClassifyResponse> {
  return apiRequest('/api/routing/classify', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** Record the user's routing decision (fire-and-forget). */
export function recordRoutingDecision(data: RoutingDecisionData): Promise<{ ok: boolean }> {
  return apiRequest('/api/routing/decision', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** List all routing rules for the team. */
export function listRoutingRules(): Promise<RoutingRule[]> {
  return apiRequest('/api/routing/rules');
}

/** Routing stats for the cost dashboard (last 30 days). */
export interface RoutingStats {
  totalSuggestions: number;
  accepted: number;
  rejected: number;
  modified: number;
  skipped: number;
  acceptanceRate: number;
  totalClassifierCost: number;
  avgConfidence: number;
  topDesks: { desk_name: string; agent_name: string; suggestion_count: number; accepted_count: number }[];
  activeRules: number;
  dailyActivity: { date: string; suggestions: number; accepted: number }[];
}

/** Get routing stats for the dashboard. */
export function getRoutingStats(): Promise<RoutingStats> {
  return apiRequest('/api/routing/stats');
}

// ── Analysis types ──────────────────────────────────────────

export interface AnalysisFinding {
  type: 'cost_saving' | 'routing_pattern' | 'model_mismatch' | 'underused_desk' | 'general';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  estimatedSavingsUsd?: number;
}

export interface AnalysisProposedRule {
  ruleType: string;
  condition: Record<string, unknown>;
  action: Record<string, unknown>;
  reasoning: string;
  confidence: number;
  estimatedImpact: string;
}

export interface AnalysisRun {
  id: string;
  run_type: 'weekly' | 'daily';
  period_start: string;
  period_end: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  analysis_model: string | null;
  analysis_cost_usd: number;
  findings: { findings: AnalysisFinding[]; summary: string; error?: string } | null;
  proposed_rules: AnalysisProposedRule[] | null;
  tasks_analyzed: number;
  total_cost_analyzed: number;
  estimated_savings_usd: number;
  user_reviewed: boolean;
  reviewed_at: string | null;
  created_at: string;
  related_rules?: RoutingRule[] | null;
}

export interface AnalysisListResponse {
  runs: AnalysisRun[];
  total: number;
  limit: number;
  offset: number;
}

export interface TriggerAnalysisResponse {
  runId: string;
  result: {
    findings: AnalysisFinding[];
    proposedRules: AnalysisProposedRule[];
    summary: string;
    totalCostAnalyzed: number;
    estimatedSavingsUsd: number;
    tasksAnalyzed: number;
  } | null;
  error?: string;
}

// ── Analysis endpoints ──────────────────────────────────────

/** List analysis runs for the team (paginated). */
export function listAnalysisRuns(limit = 10, offset = 0): Promise<AnalysisListResponse> {
  return apiRequest(`/api/routing/analysis?limit=${limit}&offset=${offset}`);
}

/** Get a specific analysis run with related rules. */
export function getAnalysisRun(runId: string): Promise<AnalysisRun> {
  return apiRequest(`/api/routing/analysis/${runId}`);
}

/** Manually trigger an analysis run (Pro+ only, 1/day). */
export function triggerAnalysis(): Promise<TriggerAnalysisResponse> {
  return apiRequest('/api/routing/analysis/trigger', {
    method: 'POST',
  });
}

/** Approve a proposed routing rule from an analysis run. */
export function approveAnalysisRule(runId: string, ruleId: string): Promise<RoutingRule> {
  return apiRequest(`/api/routing/analysis/${runId}/approve-rule/${ruleId}`, {
    method: 'POST',
  });
}

/** Reject a proposed routing rule from an analysis run. */
export function rejectAnalysisRule(runId: string, ruleId: string): Promise<{ ok: boolean; deletedRuleId: string }> {
  return apiRequest(`/api/routing/analysis/${runId}/reject-rule/${ruleId}`, {
    method: 'POST',
  });
}