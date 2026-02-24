/**
 * useActivityLog — Manages the activity log with backend hydration.
 *
 * On mount (when onboardingDone), fetches the last 20 log entries from the
 * backend task_log table. During the session, new entries are prepended
 * via addLogEntry(). On next refresh, the backend is the source of truth.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { getTaskLog } from '../api/tasks';
import type { TaskLogEntry } from '../api/tasks';

const WELCOME_MESSAGE = 'Welcome to Agent Desk...';
const MAX_LOG_ENTRIES = 20;

export function useActivityLog(onboardingDone: boolean) {
  const [taskLog, setTaskLog] = useState<string[]>([WELCOME_MESSAGE]);
  const hasHydrated = useRef(false);

  // Hydrate activity log from backend on mount
  useEffect(() => {
    if (!onboardingDone || hasHydrated.current) return;
    hasHydrated.current = true;

    (async () => {
      try {
        const entries: TaskLogEntry[] = await getTaskLog();
        if (entries.length === 0) return; // keep welcome message for fresh workspaces

        const formatted = entries.map(entry => {
          const time = new Date(entry.created_at).toLocaleTimeString();
          return `[${time}] ${entry.message}`;
        });

        setTaskLog(formatted);
      } catch (err) {
        // Graceful degradation: app works in ephemeral mode if backend is unavailable
        console.error('Failed to hydrate activity log:', err);
      }
    })();
  }, [onboardingDone]);

  // Add a new log entry with current timestamp (prepends, capped at MAX_LOG_ENTRIES)
  const addLogEntry = useCallback((message: string) => {
    const time = new Date().toLocaleTimeString();
    setTaskLog(prev => [`[${time}] ${message}`, ...prev].slice(0, MAX_LOG_ENTRIES));
  }, []);

  return { taskLog, addLogEntry } as const;
}
