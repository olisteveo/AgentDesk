import React, { useState, useMemo } from 'react';
import { X, RefreshCw, TrendingUp, BarChart3, Bot, Users, Bell, Check } from 'lucide-react';
import { MODEL_PRICING, PROVIDERS_LIST } from '../utils/constants';
import type { DailyBreakdown, ModelBreakdown, DeskCostBreakdown, CostAlert } from '../api/team';
import type { ProviderConnection } from '../api/providers';
import './CostDashboard.css';

// ── Props ────────────────────────────────────────────────────

interface CostDashboardProps {
  show: boolean;
  onClose: () => void;
  todayApiCost: number;
  monthCost: number;
  dailyHistory: DailyBreakdown[];
  byModel: ModelBreakdown[];
  byDesk: DeskCostBreakdown[];
  alerts: CostAlert[];
  connectedProviders: ProviderConnection[];
  isLoading: boolean;
  onRefresh: () => Promise<void>;
  onAcknowledgeAlert: (alertId: string) => Promise<void>;
}

// ── Helpers ──────────────────────────────────────────────────

const PROVIDER_COLORS: Record<string, string> = {
  openai: '#10a37f',
  anthropic: '#d4a574',
  moonshot: '#9b59b6',
  google: '#4285f4',
};

function aggregateDailyTotals(daily: DailyBreakdown[]): { date: string; total: number; byProvider: Record<string, number> }[] {
  const map = new Map<string, { total: number; byProvider: Record<string, number> }>();

  for (const entry of daily) {
    const dateKey = entry.date.split('T')[0];
    const existing = map.get(dateKey) || { total: 0, byProvider: {} };
    const cost = parseFloat(entry.total_cost) || 0;
    existing.total += cost;
    existing.byProvider[entry.provider] = (existing.byProvider[entry.provider] || 0) + cost;
    map.set(dateKey, existing);
  }

  return Array.from(map.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatCost(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (num === 0) return '$0.00';
  if (num < 0.01) return `$${num.toFixed(4)}`;
  return `$${num.toFixed(2)}`;
}

function formatTokens(value: number | string): string {
  const num = typeof value === 'string' ? parseInt(value) : value;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

// ── Component ────────────────────────────────────────────────

const CostDashboard: React.FC<CostDashboardProps> = ({
  show,
  onClose,
  todayApiCost,
  monthCost,
  dailyHistory,
  byModel,
  byDesk,
  alerts,
  connectedProviders,
  isLoading,
  onRefresh,
  onAcknowledgeAlert,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'agents' | 'models'>('overview');
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  // Aggregate daily data for chart
  const dailyTotals = useMemo(() => aggregateDailyTotals(dailyHistory), [dailyHistory]);
  const maxDailyCost = useMemo(() => Math.max(...dailyTotals.map(d => d.total), 0.001), [dailyTotals]);

  // Connected model IDs
  const connectedModelIds = useMemo(() => {
    const providerIds = connectedProviders.map(p => p.provider);
    return PROVIDERS_LIST
      .filter(p => providerIds.includes(p.id))
      .flatMap(p => p.models);
  }, [connectedProviders]);

  // Active (unacknowledged) alerts
  const activeAlerts = useMemo(() => alerts.filter(a => !a.acknowledged), [alerts]);

  // Budget percentage (assume $50 default if not available)
  const budgetLimit = 50;
  const budgetPct = Math.min((monthCost / budgetLimit) * 100, 100);
  const budgetColor = budgetPct >= 90 ? '#ff6b6b' : budgetPct >= 70 ? '#feca57' : '#1dd1a1';

  // Max desk cost for agent bar scaling
  const maxDeskCost = useMemo(() => {
    return Math.max(...byDesk.map(d => parseFloat(d.total_cost) || 0), 0.001);
  }, [byDesk]);

  if (!show) return null;

  return (
    <div className="cd-overlay" onClick={onClose}>
      <div className="cd-panel" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="cd-header">
          <h2><BarChart3 size={20} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />Cost Dashboard</h2>
          <div className="cd-header-actions">
            <button className="cd-refresh-btn" onClick={onRefresh} disabled={isLoading}>
              <RefreshCw size={14} className={isLoading ? 'cd-spin' : ''} />
            </button>
            <button className="close-btn" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        {/* Tabs */}
        <div className="cd-tabs">
          {([
            { id: 'overview', label: 'Overview', icon: <TrendingUp size={14} /> },
            { id: 'history', label: 'History', icon: <BarChart3 size={14} /> },
            { id: 'agents', label: 'By Agent', icon: <Users size={14} /> },
            { id: 'models', label: 'Models', icon: <Bot size={14} /> },
          ] as const).map(tab => (
            <button
              key={tab.id}
              className={`cd-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              {tab.label}
              {tab.id === 'overview' && activeAlerts.length > 0 && (
                <span className="cd-tab-badge">{activeAlerts.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="cd-body">
          {/* ── Overview Tab ─────────────────────────────── */}
          {activeTab === 'overview' && (
            <div className="cd-tab-content">
              <div className="cd-overview-cards">
                <div className="cd-card today">
                  <div className="cd-card-label">Today</div>
                  <div className="cd-card-value">{formatCost(todayApiCost)}</div>
                  <div className="cd-card-sub">API costs</div>
                </div>
                <div className="cd-card month">
                  <div className="cd-card-label">This Month</div>
                  <div className="cd-card-value">{formatCost(monthCost)}</div>
                  <div className="cd-card-sub">Total spend</div>
                </div>
                <div className="cd-card providers">
                  <div className="cd-card-label">Providers</div>
                  <div className="cd-card-value">{connectedProviders.length}</div>
                  <div className="cd-card-sub">Connected</div>
                </div>
              </div>

              {/* Budget Bar */}
              <div className="cd-budget-section">
                <div className="cd-budget-header">
                  <span className="cd-budget-label">Monthly Budget</span>
                  <span className="cd-budget-numbers">{formatCost(monthCost)} / {formatCost(budgetLimit)}</span>
                </div>
                <div className="cd-budget-bar">
                  <div
                    className="cd-budget-fill"
                    style={{ width: `${budgetPct}%`, background: budgetColor }}
                  />
                </div>
                <div className="cd-budget-pct" style={{ color: budgetColor }}>
                  {budgetPct.toFixed(1)}% used
                </div>
              </div>

              {/* Mini sparkline chart for last 7 days */}
              <div className="cd-sparkline-section">
                <h3>Last 7 Days</h3>
                <div className="cd-sparkline">
                  {dailyTotals.slice(-7).map((day, i) => {
                    const height = Math.max((day.total / maxDailyCost) * 100, 2);
                    return (
                      <div key={i} className="cd-sparkline-bar-wrap">
                        <div
                          className="cd-sparkline-bar"
                          style={{ height: `${height}%` }}
                          title={`${formatDate(day.date)}: ${formatCost(day.total)}`}
                        />
                        <span className="cd-sparkline-label">{formatDate(day.date).split(' ')[1]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Alerts */}
              {activeAlerts.length > 0 && (
                <div className="cd-alerts-section">
                  <h3><Bell size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />Alerts</h3>
                  {activeAlerts.map(alert => (
                    <div key={alert.id} className="cd-alert-item">
                      <div className="cd-alert-info">
                        <span className={`cd-alert-type ${alert.alert_type}`}>
                          {alert.alert_type === 'daily_budget_exceeded' ? 'Budget Exceeded' : 'Budget Warning'}
                        </span>
                        <span className="cd-alert-detail">
                          {formatCost(alert.cost_usd)} / {formatCost(alert.limit_usd)} limit
                        </span>
                        <span className="cd-alert-time">
                          {new Date(alert.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <button className="cd-alert-dismiss" onClick={() => onAcknowledgeAlert(alert.id)}>
                        <Check size={12} /> Dismiss
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── History Tab ──────────────────────────────── */}
          {activeTab === 'history' && (
            <div className="cd-tab-content">
              <h3>30-Day Cost History</h3>
              {dailyTotals.length === 0 ? (
                <div className="cd-empty">No usage data yet. Costs will appear here after running tasks.</div>
              ) : (
                <>
                  {/* Bar Chart */}
                  <div className="cd-chart-container">
                    <div className="cd-chart-y-axis">
                      <span>{formatCost(maxDailyCost)}</span>
                      <span>{formatCost(maxDailyCost / 2)}</span>
                      <span>$0</span>
                    </div>
                    <div className="cd-chart">
                      {dailyTotals.map((day, i) => {
                        const heightPct = Math.max((day.total / maxDailyCost) * 100, 1);
                        const providers = Object.entries(day.byProvider);
                        return (
                          <div
                            key={i}
                            className={`cd-bar-wrap ${hoveredBar === i ? 'hovered' : ''}`}
                            onMouseEnter={() => setHoveredBar(i)}
                            onMouseLeave={() => setHoveredBar(null)}
                          >
                            <div className="cd-bar-stack" style={{ height: `${heightPct}%` }}>
                              {providers.map(([provider, cost]) => {
                                const segPct = (cost / day.total) * 100;
                                return (
                                  <div
                                    key={provider}
                                    className="cd-bar-segment"
                                    style={{
                                      height: `${segPct}%`,
                                      background: PROVIDER_COLORS[provider] || '#667eea',
                                    }}
                                  />
                                );
                              })}
                            </div>
                            {i % Math.max(Math.floor(dailyTotals.length / 6), 1) === 0 && (
                              <span className="cd-bar-date">{formatDate(day.date)}</span>
                            )}
                            {/* Tooltip */}
                            {hoveredBar === i && (
                              <div className="cd-bar-tooltip">
                                <div className="cd-tooltip-date">{formatDate(day.date)}</div>
                                <div className="cd-tooltip-total">{formatCost(day.total)}</div>
                                {providers.map(([p, c]) => (
                                  <div key={p} className="cd-tooltip-row">
                                    <span className="cd-tooltip-dot" style={{ background: PROVIDER_COLORS[p] || '#667eea' }} />
                                    {p}: {formatCost(c)}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Provider legend */}
                  <div className="cd-chart-legend">
                    {Object.entries(PROVIDER_COLORS).map(([name, color]) => (
                      <span key={name} className="cd-legend-item">
                        <span className="cd-legend-dot" style={{ background: color }} />
                        {name.charAt(0).toUpperCase() + name.slice(1)}
                      </span>
                    ))}
                  </div>

                  {/* Per-model table */}
                  <h3 style={{ marginTop: 28 }}>Model Usage This Month</h3>
                  {byModel.length === 0 ? (
                    <div className="cd-empty">No model usage this month</div>
                  ) : (
                    <div className="cd-model-table">
                      <div className="cd-model-table-header">
                        <span>Model</span>
                        <span>Requests</span>
                        <span>Tokens</span>
                        <span>Cost</span>
                      </div>
                      {byModel.map((m, i) => (
                        <div key={i} className="cd-model-table-row">
                          <span className="cd-model-name">
                            <span className="cd-provider-dot" style={{ background: PROVIDER_COLORS[m.provider] || '#667eea' }} />
                            {MODEL_PRICING[m.model]?.name || m.model}
                          </span>
                          <span className="cd-model-requests">{m.request_count}</span>
                          <span className="cd-model-tokens">
                            {formatTokens(m.total_input)} in / {formatTokens(m.total_output)} out
                          </span>
                          <span className="cd-model-cost">{formatCost(m.total_cost)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── By Agent Tab ─────────────────────────────── */}
          {activeTab === 'agents' && (
            <div className="cd-tab-content">
              <h3>Cost by Agent</h3>
              {byDesk.length === 0 ? (
                <div className="cd-empty">No agent usage data yet. Costs will appear here after agents complete tasks.</div>
              ) : (
                <div className="cd-agent-list">
                  {byDesk
                    .sort((a, b) => (parseFloat(b.total_cost) || 0) - (parseFloat(a.total_cost) || 0))
                    .map((desk, i) => {
                      const cost = parseFloat(desk.total_cost) || 0;
                      const barWidth = (cost / maxDeskCost) * 100;
                      return (
                        <div key={i} className="cd-agent-row">
                          <div className="cd-agent-header">
                            <div className="cd-agent-info">
                              <span className="cd-agent-avatar">
                                {(desk.agent_name || 'A').charAt(0).toUpperCase()}
                              </span>
                              <div className="cd-agent-details">
                                <span className="cd-agent-name">{desk.agent_name || desk.desk_name || 'Unknown'}</span>
                                <span className="cd-agent-meta">
                                  {desk.request_count} requests
                                  {desk.models_used?.length > 0 && ` -- ${desk.models_used.map(m => MODEL_PRICING[m]?.name || m).join(', ')}`}
                                </span>
                              </div>
                            </div>
                            <span className="cd-agent-cost">{formatCost(cost)}</span>
                          </div>
                          <div className="cd-agent-bar-track">
                            <div
                              className="cd-agent-bar-fill"
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                          <div className="cd-agent-token-row">
                            <span>{formatTokens(desk.total_input)} input tokens</span>
                            <span>{formatTokens(desk.total_output)} output tokens</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* ── Models Tab ────────────────────────────────── */}
          {activeTab === 'models' && (
            <div className="cd-tab-content">
              <h3>Connected Models</h3>
              {connectedProviders.length === 0 ? (
                <div className="cd-empty">
                  No providers connected yet. Add an API key via the Hire Agent wizard to see your models here.
                </div>
              ) : (
                <>
                  {PROVIDERS_LIST
                    .filter(provider => connectedProviders.some(cp => cp.provider === provider.id))
                    .map(provider => {
                      const models = provider.models.filter(m => connectedModelIds.includes(m));
                      return (
                        <div key={provider.id} className="cd-provider-group">
                          <div className="cd-provider-header">
                            <span className="cd-provider-dot-lg" style={{ background: PROVIDER_COLORS[provider.id] || '#667eea' }} />
                            <span className="cd-provider-name">{provider.name}</span>
                            <span className="cd-provider-count">{models.length} models</span>
                          </div>
                          <div className="cd-models-grid">
                            {models.map(modelId => {
                              const pricing = MODEL_PRICING[modelId];
                              const usage = byModel.find(m => m.model === modelId);
                              if (!pricing) return null;
                              return (
                                <div key={modelId} className="cd-model-card">
                                  <div className="cd-model-card-name">{pricing.name}</div>
                                  <div className="cd-model-card-pricing">
                                    <div className="cd-model-price-row">
                                      <span className="cd-price-label">Input</span>
                                      <span className="cd-price-value input">${(pricing.input * 1000).toFixed(4)}/1K</span>
                                    </div>
                                    <div className="cd-model-price-row">
                                      <span className="cd-price-label">Output</span>
                                      <span className="cd-price-value output">${(pricing.output * 1000).toFixed(4)}/1K</span>
                                    </div>
                                  </div>
                                  {usage && (
                                    <div className="cd-model-card-usage">
                                      <span>{usage.request_count} requests</span>
                                      <span>{formatCost(usage.total_cost)} spent</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CostDashboard;
