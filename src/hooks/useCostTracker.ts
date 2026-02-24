/**
 * useCostTracker — Manages today's API cost with backend hydration.
 *
 * On mount (when onboardingDone), fetches the cumulative cost for today
 * from the backend team usage endpoint. During the session, incremental
 * costs are added via updateTodayCost(). On next refresh, the backend
 * total replaces the local accumulation (no double-counting).
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { getTeamUsage } from '../api/team';

export function useCostTracker(onboardingDone: boolean) {
  const [todayApiCost, setTodayApiCost] = useState<number>(0);
  const hasHydrated = useRef(false);

  // Hydrate today's cost from backend on mount
  useEffect(() => {
    if (!onboardingDone || hasHydrated.current) return;
    hasHydrated.current = true;

    (async () => {
      try {
        const usage = await getTeamUsage();
        setTodayApiCost(usage.todayCost);
      } catch (err) {
        // Graceful degradation: cost shows 0 until first task in this session
        console.error('Failed to hydrate cost data:', err);
      }
    })();
  }, [onboardingDone]);

  // Add incremental cost from a completed task (additive on top of hydrated total)
  const updateTodayCost = useCallback((additionalCost: number) => {
    setTodayApiCost(prev => prev + additionalCost);
  }, []);

  return { todayApiCost, updateTodayCost } as const;
}
