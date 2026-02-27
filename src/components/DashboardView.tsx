/**
 * DashboardView — Power Mode alternative to the pixel office.
 * Three-column layout: Agents | Task Queue | Stats & Log.
 * Full feature parity with office view: cost panel, task results, feed panel.
 * Supports dark/light theme toggle.
 */

import React, { useState, useEffect } from 'react';
import { AVAILABLE_MODELS, MODEL_PRICING } from '../utils/constants';
import type { Agent, Task, DeskAssignment } from '../types';
import {
  MessageCircle, Plus, Zap, DollarSign, Trash2,
  Eye, AlertTriangle, Sun, Moon, BarChart3,
} from 'lucide-react';
import './DashboardView.css';

interface DashboardViewProps {
  agents: Agent[];
  tasks: Task[];
  deskAssignments: DeskAssignment[];
  todayApiCost: number;
  taskLog: string[];
  taskResults: Record<string, string>;
  onAgentClick: (agent: Agent) => void;
  onCreateTask: () => void;
  onOpenCostPanel: () => void;
  onViewTaskResult: (taskId: string) => void;
  onViewFailedTask: (taskId: string) => void;
  onRemoveTask: (taskId: string) => void;
}

const DashboardView: React.FC<DashboardViewProps> = ({
  agents,
  tasks,
  deskAssignments,
  todayApiCost,
  taskLog,
  taskResults,
  onAgentClick,
  onCreateTask,
  onOpenCostPanel,
  onViewTaskResult,
  onViewFailedTask,
  onRemoveTask,
}) => {
  const [taskFilter, setTaskFilter] = useState<'all' | 'in-progress' | 'completed' | 'failed'>('all');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('dv-theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    localStorage.setItem('dv-theme', theme);
  }, [theme]);

  const teamAgents = agents.filter(a => a.id !== 'ceo' && a.id !== 'ops');

  const filteredTasks = tasks
    .filter(t => taskFilter === 'all' || t.status === taskFilter)
    .sort((a, b) => (b.completedAt ?? b.createdAt) - (a.completedAt ?? a.createdAt));

  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const activeCount = tasks.filter(t => t.status === 'in-progress').length;
  const failedCount = tasks.filter(t => t.status === 'failed').length;

  const monthCost = tasks
    .filter(t => t.cost && t.cost > 0)
    .reduce((sum, t) => sum + (t.cost || 0), 0);

  const avgTaskCost = completedCount > 0
    ? tasks.filter(t => t.status === 'completed' && t.cost).reduce((s, t) => s + (t.cost || 0), 0) / completedCount
    : 0;

  const getModelName = (agentId: string) => {
    const deskId = agentId.replace('agent-', '');
    const assignment = deskAssignments.find(a => a.deskId === deskId);
    if (!assignment) return '';
    const model = AVAILABLE_MODELS.find(m => m.id === assignment.modelId);
    return model?.name || assignment.modelId;
  };

  const getAgentForTask = (task: Task) => {
    return teamAgents.find(a => a.name === task.assignee);
  };

  const handleTaskClick = (task: Task) => {
    if (task.status === 'failed') {
      onViewFailedTask(task.id);
    } else if (task.status === 'completed' && taskResults[task.id]) {
      onViewTaskResult(task.id);
    }
  };

  return (
    <div className={`dv-container ${theme === 'light' ? 'dv-light' : ''}`}>
      {/* ── Left: Agent Cards ──────────────────────────────── */}
      <div className="dv-left">
        <div className="dv-section-header">
          <h3>Agents</h3>
          <span className="dv-count">{teamAgents.length}</span>
        </div>

        {teamAgents.length === 0 && (
          <div className="dv-empty-card">
            <Zap size={20} />
            <p>No agents yet. Hire your first agent to get started.</p>
          </div>
        )}

        {teamAgents.map(agent => {
          const agentTasks = tasks.filter(t => t.assignee === agent.name);
          const agentCompleted = agentTasks.filter(t => t.status === 'completed').length;
          const agentCost = agentTasks.reduce((s, t) => s + (t.cost || 0), 0);
          const lastTask = agentTasks
            .filter(t => t.status === 'completed' || t.status === 'failed')
            .sort((a, b) => (b.completedAt ?? b.createdAt) - (a.completedAt ?? a.createdAt))[0];

          return (
            <div
              key={agent.id}
              className={`dv-agent-card${agent.isWorking ? ' working' : ''}`}
              onClick={() => onAgentClick(agent)}>
              <div className="dv-agent-top">
                <div className="dv-agent-avatar">
                  {agent.name.charAt(0).toUpperCase()}
                </div>
                <div className="dv-agent-info">
                  <div className="dv-agent-name">{agent.name}</div>
                  <div className="dv-agent-model">{getModelName(agent.id)}</div>
                </div>
                <div className={`dv-status-dot${agent.isWorking ? ' active' : ''}`} />
              </div>
              <div className="dv-agent-stats-row">
                <span>{agentCompleted} tasks</span>
                <span>${agentCost.toFixed(4)}</span>
              </div>
              {lastTask && (
                <div className="dv-agent-last-task">
                  Last: {lastTask.name.substring(0, 40)}{lastTask.name.length > 40 ? '...' : ''}
                </div>
              )}
              <div className="dv-agent-chat-hint">
                <MessageCircle size={10} /> Chat
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Center: Task Queue ─────────────────────────────── */}
      <div className="dv-center">
        <div className="dv-section-header">
          <h3>Tasks</h3>
          <button className="dv-create-btn" onClick={onCreateTask}>
            <Plus size={14} /> New Task
          </button>
        </div>

        {/* Filter tabs */}
        <div className="dv-task-filters">
          {(['all', 'in-progress', 'completed', 'failed'] as const).map(f => (
            <button
              key={f}
              className={`dv-filter-btn${taskFilter === f ? ' active' : ''}`}
              onClick={() => setTaskFilter(f)}>
              {f === 'all' ? 'All' : f === 'in-progress' ? 'Active' : f === 'completed' ? 'Done' : 'Failed'}
              {f === 'all' && <span className="dv-filter-count">{tasks.length}</span>}
              {f === 'in-progress' && activeCount > 0 && <span className="dv-filter-count">{activeCount}</span>}
              {f === 'completed' && completedCount > 0 && <span className="dv-filter-count">{completedCount}</span>}
              {f === 'failed' && failedCount > 0 && <span className="dv-filter-count">{failedCount}</span>}
            </button>
          ))}
        </div>

        <div className="dv-task-list">
          {filteredTasks.length === 0 && (
            <div className="dv-empty-card">
              <p>No tasks {taskFilter !== 'all' ? `with status "${taskFilter}"` : 'yet'}.</p>
            </div>
          )}

          {filteredTasks.map(task => {
            const assignedAgent = getAgentForTask(task);
            const hasResult = !!taskResults[task.id];
            const isClickable = task.status === 'failed' || (task.status === 'completed' && hasResult);
            return (
              <div
                key={task.id}
                className={`dv-task-card status-${task.status}${isClickable ? ' clickable' : ''}`}
                onClick={() => handleTaskClick(task)}>
                <div className="dv-task-top">
                  <span className={`dv-task-status ${task.status}`}>
                    {task.status === 'in-progress' ? 'Active' : task.status === 'completed' ? 'Done' : task.status === 'failed' ? 'Failed' : 'Pending'}
                  </span>
                  <div className="dv-task-actions">
                    {task.cost != null && task.cost > 0 && (
                      <span className="dv-task-cost">${task.cost.toFixed(4)}</span>
                    )}
                    {isClickable && (
                      <span className="dv-task-view-hint">
                        {task.status === 'failed' ? <AlertTriangle size={11} /> : <Eye size={11} />}
                      </span>
                    )}
                    <button
                      className="dv-task-delete"
                      onClick={(e) => { e.stopPropagation(); onRemoveTask(task.id); }}
                      title="Remove task">
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
                <div className="dv-task-name">{task.name}</div>
                {task.status === 'failed' && (
                  <div className="dv-task-error">
                    {(task as any).errorMessage || 'Something went wrong. Check your API key and billing.'}
                  </div>
                )}
                {task.description && task.status !== 'failed' && (
                  <div className="dv-task-desc">{task.description.substring(0, 100)}{task.description.length > 100 ? '...' : ''}</div>
                )}
                <div className="dv-task-meta">
                  {assignedAgent && <span className="dv-task-agent">{assignedAgent.name}</span>}
                  {task.modelUsed && (
                    <span className="dv-task-model">{MODEL_PRICING[task.modelUsed]?.name || task.modelUsed}</span>
                  )}
                  <span className="dv-task-time">
                    {task.status === 'in-progress'
                      ? `${Math.round((Date.now() - task.createdAt) / 1000)}s`
                      : new Date(task.completedAt ?? task.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right: Stats & Log ─────────────────────────────── */}
      <div className="dv-right">
        <div className="dv-section-header">
          <h3>Stats</h3>
          <button
            className="dv-theme-toggle"
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>

        <div className="dv-stats-grid">
          <div className="dv-stat-card dv-stat-clickable" onClick={onOpenCostPanel}>
            <div className="dv-stat-icon"><DollarSign size={14} /></div>
            <div className="dv-stat-value">${todayApiCost.toFixed(4)}</div>
            <div className="dv-stat-label">Today's Cost</div>
          </div>
          <div className="dv-stat-card dv-stat-clickable" onClick={onOpenCostPanel}>
            <div className="dv-stat-icon"><BarChart3 size={14} /></div>
            <div className="dv-stat-value">${monthCost.toFixed(4)}</div>
            <div className="dv-stat-label">Total Spend</div>
          </div>
          <div className="dv-stat-card">
            <div className="dv-stat-value">{completedCount}</div>
            <div className="dv-stat-label">Completed</div>
          </div>
          <div className="dv-stat-card">
            <div className="dv-stat-value">{teamAgents.length}</div>
            <div className="dv-stat-label">Agents</div>
          </div>
          <div className="dv-stat-card">
            <div className="dv-stat-value">{activeCount}</div>
            <div className="dv-stat-label">Active</div>
          </div>
          <div className="dv-stat-card">
            <div className="dv-stat-value">${avgTaskCost.toFixed(4)}</div>
            <div className="dv-stat-label">Avg / Task</div>
          </div>
        </div>

        {/* Cost Centre Quick Access */}
        <button className="dv-cost-panel-btn" onClick={onOpenCostPanel}>
          <DollarSign size={14} />
          Cost Centre
          <span className="dv-cost-panel-arrow">&rarr;</span>
        </button>

        <div className="dv-section-header" style={{ marginTop: '16px' }}>
          <h3>Activity</h3>
        </div>
        <div className="dv-log-list">
          {taskLog.slice(0, 30).map((entry, i) => (
            <div key={i} className="dv-log-entry">{entry}</div>
          ))}
          {taskLog.length === 0 && (
            <div className="dv-log-empty">No activity yet</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardView;
