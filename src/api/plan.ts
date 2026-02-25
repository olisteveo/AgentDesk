/**
 * Plan / tier API — fetches current team plan, limits, and live usage counts.
 */

import { apiRequest } from './client';
import type { PlanTier, TierLimitConfig } from '../utils/tierConfig';

export interface PlanInfo {
  plan: PlanTier;
  limits: TierLimitConfig;
  usage: {
    desks: number;
    providers: number;
    runningTasks: number;
  };
}

/** Fetch the team's current plan, limits, and usage counts. */
export function fetchPlan(): Promise<PlanInfo> {
  return apiRequest<PlanInfo>('/api/team/plan');
}
