/**
 * useCostTracker -- Full cost analytics with backend hydration.
 *
 * On mount (when onboardingDone), fetches the complete usage dataset
 * from backend endpoints: today/month costs, 30-day history, per-model
 * and per-desk breakdowns, and budget alerts. During the session,
 * incremental costs are added via updateTodayCost(). On next refresh
 * or manual refreshUsage(), the backend totals replace local accumulation.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  getTeamUsage,
  getUsageByDesk,
  getCostAlerts,
  acknowledgeCostAlert,
} from '../api/team';
import type {
  DailyBreakdown,
  ModelBreakdown,
  DeskCostBreakdown,
  CostAlert,
} from '../api/team';
import { listProviders } from '../api/providers';
import type { ProviderConnection } from '../api/providers';

export interface CostTrackerData {
  todayApiCost: number;
  monthCost: number;
  dailyHistory: DailyBreakdown[];
  byModel: ModelBreakdown[];
  byDesk: DeskCostBreakdown[];
  alerts: CostAlert[];
  connectedProviders: ProviderConnection[];
  isLoading: boolean;
  updateTodayCost: (amount: number) => void;
  refreshUsage: () => Promise<void>;
  acknowledgeAlert: (alertId: string) => Promise<void>;
}

export function useCostTracker(onboardingDone: boolean): CostTrackerData {
  const [todayApiCost, setTodayApiCost] = useState<number>(0);
  const [monthCost, setMonthCost] = useState<number>(0);
  const [dailyHistory, setDailyHistory] = useState<DailyBreakdown[]>([]);
  const [byModel, setByModel] = useState<ModelBreakdown[]>([]);
  const [byDesk, setByDesk] = useState<DeskCostBreakdown[]>([]);
  const [alerts, setAlerts] = useState<CostAlert[]>([]);
  const [connectedProviders, setConnectedProviders] = useState<ProviderConnection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const hasHydrated = useRef(false);

  // Fetch all cost data from backend
  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [usage, deskUsage, costAlerts, providers] = await Promise.allSettled([
        getTeamUsage(),
        getUsageByDesk(),
        getCostAlerts(),
        listProviders(),
      ]);

      if (usage.status === 'fulfilled') {
        setTodayApiCost(usage.value.todayCost);
        setMonthCost(usage.value.monthCost);
        setDailyHistory(usage.value.daily);
        setByModel(usage.value.byModel);
      }

      if (deskUsage.status === 'fulfilled') {
        setByDesk(deskUsage.value);
      }

      if (costAlerts.status === 'fulfilled') {
        setAlerts(costAlerts.value);
      }

      if (providers.status === 'fulfilled') {
        setConnectedProviders(providers.value.filter((p: ProviderConnection) => p.isConnected));
      }
    } catch (err) {
      console.error('Failed to hydrate cost data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Hydrate on mount
  useEffect(() => {
    if (!onboardingDone || hasHydrated.current) return;
    hasHydrated.current = true;
    fetchAll();
  }, [onboardingDone, fetchAll]);

  // Add incremental cost from a completed task
  const updateTodayCost = useCallback((additionalCost: number) => {
    setTodayApiCost(prev => prev + additionalCost);
    setMonthCost(prev => prev + additionalCost);
  }, []);

  // Manual refresh
  const refreshUsage = useCallback(async () => {
    await fetchAll();
  }, [fetchAll]);

  // Acknowledge a single alert
  const handleAcknowledgeAlert = useCallback(async (alertId: string) => {
    try {
      await acknowledgeCostAlert(alertId);
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, acknowledged: true } : a));
    } catch {
      // Non-critical
    }
  }, []);

  return {
    todayApiCost,
    monthCost,
    dailyHistory,
    byModel,
    byDesk,
    alerts,
    connectedProviders,
    isLoading,
    updateTodayCost,
    refreshUsage,
    acknowledgeAlert: handleAcknowledgeAlert,
  };
}
