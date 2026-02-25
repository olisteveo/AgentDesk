/**
 * Tier configuration — single source of truth for plan limits on the frontend.
 *
 * These values mirror the backend TIER_LIMITS in types/index.ts.
 * Any change here must be reflected there (and vice-versa).
 */

export type PlanTier = 'free' | 'pro' | 'enterprise';

export interface TierLimitConfig {
  maxDesks: number;
  maxProviders: number;
  maxMembers: number;
  maxWhiteboardTabs: number;
  maxConcurrentTasks: number;
  costHistoryDays: number;       // -1 = unlimited
  dailyBudget: number;
  meetingRoom: boolean;
  avatarSlots: number;
  workflowTemplates: number;     // 0 = linear only, -1 = unlimited
  maxRules: number;              // max active + disabled rules per team
}

export const TIER_LIMITS: Record<PlanTier, TierLimitConfig> = {
  free: {
    maxDesks: 3,
    maxProviders: 3,
    maxMembers: 1,
    maxWhiteboardTabs: 2,
    maxConcurrentTasks: 1,
    costHistoryDays: 7,
    dailyBudget: 5,
    meetingRoom: true,
    avatarSlots: 3,
    workflowTemplates: 0,
    maxRules: 10,
  },
  pro: {
    maxDesks: 6,
    maxProviders: 6,
    maxMembers: 5,
    maxWhiteboardTabs: 6,
    maxConcurrentTasks: 3,
    costHistoryDays: 90,
    dailyBudget: 50,
    meetingRoom: true,
    avatarSlots: 6,
    workflowTemplates: 3,
    maxRules: 50,
  },
  enterprise: {
    maxDesks: 20,
    maxProviders: 99,
    maxMembers: 25,
    maxWhiteboardTabs: 99,
    maxConcurrentTasks: 10,
    costHistoryDays: -1,
    dailyBudget: 9999,
    meetingRoom: true,
    avatarSlots: 12,
    workflowTemplates: -1,
    maxRules: 999,
  },
};

// ── Pricing display ──────────────────────────────────────────

export const TIER_PRICING: Record<PlanTier, { label: string; price: number; period: string }> = {
  free:       { label: 'Free',       price: 0,  period: '' },
  pro:        { label: 'Pro',        price: 19, period: '/mo' },
  enterprise: { label: 'Enterprise', price: 49, period: '/mo' },
};

// ── Helpers ──────────────────────────────────────────────────

export function getLimits(plan: PlanTier): TierLimitConfig {
  return TIER_LIMITS[plan] ?? TIER_LIMITS.free;
}

export function isAtLimit(current: number, max: number): boolean {
  return current >= max;
}

export function limitLabel(current: number, max: number): string {
  return `${current}/${max}`;
}

/** Returns the next tier up, or null if already at the top. */
export function nextTier(plan: PlanTier): PlanTier | null {
  if (plan === 'free') return 'pro';
  if (plan === 'pro') return 'enterprise';
  return null;
}

/** Human-readable upgrade message for a specific limit type. */
export function upgradeMessage(limitType: string, plan: PlanTier): string {
  const next = nextTier(plan);
  if (!next) return 'You are on the highest plan.';

  const nextLabel = TIER_PRICING[next].label;
  const nextPrice = TIER_PRICING[next].price;

  const messages: Record<string, string> = {
    desks: `Need more desks? Upgrade to ${nextLabel} ($${nextPrice}/mo) for up to ${TIER_LIMITS[next].maxDesks} desks.`,
    providers: `Need more providers? Upgrade to ${nextLabel} ($${nextPrice}/mo) for up to ${TIER_LIMITS[next].maxProviders} providers.`,
    concurrentTasks: `Want to run more tasks at once? Upgrade to ${nextLabel} ($${nextPrice}/mo) for up to ${TIER_LIMITS[next].maxConcurrentTasks} concurrent tasks.`,
    whiteboardTabs: `Need more whiteboard tabs? Upgrade to ${nextLabel} ($${nextPrice}/mo) for up to ${TIER_LIMITS[next].maxWhiteboardTabs} tabs.`,
    rules: `Need more rules? Upgrade to ${nextLabel} ($${nextPrice}/mo) for up to ${TIER_LIMITS[next].maxRules} rules.`,
    costHistory: `Want longer cost history? Upgrade to ${nextLabel} ($${nextPrice}/mo) for ${TIER_LIMITS[next].costHistoryDays === -1 ? 'unlimited' : TIER_LIMITS[next].costHistoryDays + ' days'} of history.`,
  };

  return messages[limitType] ?? `Upgrade to ${nextLabel} ($${nextPrice}/mo) to unlock more features.`;
}
