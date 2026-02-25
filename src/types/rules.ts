/**
 * Rules type definitions — shared across API client, dashboard, and canvas.
 */

export type RuleScope = 'team' | 'desk';
export type RuleStatus = 'active' | 'disabled' | 'pending' | 'rejected';

export type RuleCategory =
  | 'tone'       // Communication style
  | 'format'     // Output formatting
  | 'safety'     // Safety / compliance
  | 'workflow'   // Process rules
  | 'domain'     // Domain-specific knowledge
  | 'general';   // Catch-all

export interface Rule {
  id: string;
  team_id: string;
  desk_id: string | null;
  scope: RuleScope;
  title: string;
  content: string;
  category: RuleCategory;
  status: RuleStatus;
  sort_order: number;
  created_by: string | null;
  suggested_by_desk_id: string | null;
  suggestion_context: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields from backend:
  desk_agent_name?: string;
  desk_name?: string;
  suggested_by_agent_name?: string;
}

export interface RulesResponse {
  team: Rule[];
  desk: Record<string, Rule[]>;
  pending: Rule[];
  corePreset: {
    id: string;
    name: string;
    description: string;
    emoji: string;
    rules: { title: string; content: string }[];
  } | null;
}

export const RULE_CATEGORIES: { id: RuleCategory; label: string; color: string }[] = [
  { id: 'tone',     label: 'Tone & Style',  color: '#667eea' },
  { id: 'format',   label: 'Format',         color: '#a78bfa' },
  { id: 'safety',   label: 'Safety',         color: '#ff6b6b' },
  { id: 'workflow', label: 'Workflow',        color: '#1dd1a1' },
  { id: 'domain',   label: 'Domain',         color: '#feca57' },
  { id: 'general',  label: 'General',        color: '#aaa' },
];
