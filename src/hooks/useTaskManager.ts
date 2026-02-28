/**
 * useTaskManager — Manages task state and results with backend hydration.
 *
 * On mount (after desks are loaded), fetches the last 50 tasks from the
 * backend and maps them to the frontend Task format. Also hydrates task
 * results for completed tasks. During the session, tasks are added/updated
 * via setTasks and setTaskResults directly from OfficeCanvas callbacks.
 *
 * The assignTask logic stays in OfficeCanvas because it manages agent
 * animation, canvas zones, and desk sync — concerns outside this hook.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { listTasks, deleteTask, clearAllTasks } from '../api/tasks';
import type { TaskRow } from '../api/tasks';
import type { Task, TaskMessage, DeskAssignment } from '../types';
import { MODEL_PRICING } from '../utils/constants';

const MAX_TASKS = 50;

/**
 * Pure mapping function: convert a backend TaskRow to the frontend Task interface.
 * Resolves backend desk_id (UUID) to frontend agent ID (agent-desk1) via deskAssignments.
 */
function mapTaskRowToTask(row: TaskRow, assignments: DeskAssignment[]): Task {
  const assignment = assignments.find(a => a.backendDeskId === row.desk_id);
  const assignee = assignment ? `agent-${assignment.deskId}` : 'unknown';

  return {
    id: row.id,
    name: row.title,
    description: row.description || '',
    assignee,
    status: row.status,
    createdAt: new Date(row.created_at).getTime(),
    cost: row.cost_usd != null ? parseFloat(String(row.cost_usd)) : undefined,
    modelUsed: row.model_used
      ? (MODEL_PRICING[row.model_used]?.name || row.model_used)
      : undefined,
    backendId: row.id,
    isCodeTask: row.is_code_task,
    totalRuns: row.result
      ? (Array.isArray((row.result as Record<string, unknown>).messages)
          ? ((row.result as Record<string, unknown>).messages as TaskMessage[]).filter((m: TaskMessage) => m.role === 'agent').length
          : row.status === 'completed' || row.status === 'review' ? 1 : 0)
      : 0,
    // Backend doesn't store errorMessage separately — failed tasks won't have it from hydration
    // but live-session failures will set it via setTasks in OfficeCanvas
  };
}

export function useTaskManager(opts: {
  deskAssignments: DeskAssignment[];
  onboardingDone: boolean;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskResults, setTaskResults] = useState<Record<string, string>>({});
  const [taskMessages, setTaskMessages] = useState<Record<string, TaskMessage[]>>({});
  const hasHydrated = useRef(false);

  // Hydrate tasks from backend once desks are loaded
  useEffect(() => {
    const { onboardingDone, deskAssignments } = opts;

    // Wait until onboarding is done AND desks have loaded (so we can map desk_id -> agent)
    if (!onboardingDone || deskAssignments.length === 0 || hasHydrated.current) return;
    hasHydrated.current = true;

    (async () => {
      try {
        const rows: TaskRow[] = await listTasks({ limit: MAX_TASKS });
        if (rows.length === 0) return; // fresh workspace, no tasks yet

        // Map backend rows to frontend Task objects
        const hydrated = rows.map(row => mapTaskRowToTask(row, deskAssignments));
        setTasks(hydrated);

        // Hydrate AI results and messages for completed + review tasks
        const results: Record<string, string> = {};
        const messages: Record<string, TaskMessage[]> = {};

        for (const row of rows) {
          if ((row.status === 'completed' || row.status === 'review') && row.result) {
            const r = row.result as Record<string, unknown>;

            // If backend stored a messages array, use it directly
            if (Array.isArray(r.messages)) {
              messages[row.id] = r.messages as TaskMessage[];
              // Also populate taskResults with the last agent message for backward compat
              const lastAgent = (r.messages as TaskMessage[])
                .filter((m: TaskMessage) => m.role === 'agent')
                .pop();
              if (lastAgent) results[row.id] = lastAgent.content;
            } else {
              // Legacy single-result: wrap as one agent message
              const content = (r.content as string) || (r.text as string) || JSON.stringify(row.result);
              results[row.id] = content;
              messages[row.id] = [{
                id: `${row.id}-initial`,
                role: 'agent',
                content,
                timestamp: row.completed_at
                  ? new Date(row.completed_at).getTime()
                  : new Date(row.created_at).getTime(),
                cost: row.cost_usd != null ? parseFloat(String(row.cost_usd)) : undefined,
                modelUsed: row.model_used
                  ? (MODEL_PRICING[row.model_used]?.name || row.model_used)
                  : undefined,
              }];
            }
          }
        }

        if (Object.keys(results).length > 0) {
          setTaskResults(prev => ({ ...prev, ...results }));
        }
        if (Object.keys(messages).length > 0) {
          setTaskMessages(prev => ({ ...prev, ...messages }));
        }
      } catch (err) {
        // Graceful degradation: live feed starts empty, works as before
        console.error('Failed to hydrate tasks:', err);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.onboardingDone, opts.deskAssignments]);

  const removeTask = useCallback(async (taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    setTaskResults(prev => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
    setTaskMessages(prev => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
    try {
      await deleteTask(taskId);
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  }, []);

  const clearTasks = useCallback(async () => {
    setTasks([]);
    setTaskResults({});
    setTaskMessages({});
    try {
      await clearAllTasks();
    } catch (err) {
      console.error('Failed to clear tasks:', err);
    }
  }, []);

  return { tasks, setTasks, taskResults, setTaskResults, taskMessages, setTaskMessages, removeTask, clearTasks } as const;
}
