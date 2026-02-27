/**
 * RoutingInsightsModal — displays routing analysis results, proposed rules,
 * and allows Pro+ users to trigger manual analysis runs.
 *
 * Accessible from the office toolbar (Sparkles icon).
 * Gated to Pro+ plans (routingAnalysis !== 'none').
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  X, Sparkles, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle, XCircle, Play, Loader2, DollarSign,
  BarChart3, Zap, Search, ArrowRight,
} from 'lucide-react';
import {
  listAnalysisRuns,
  getAnalysisRun,
  triggerAnalysis,
  approveAnalysisRule,
  rejectAnalysisRule,
} from '../../api/routing';
import type {
  AnalysisRun,
  AnalysisFinding,
  AnalysisProposedRule,
  RoutingRule,
} from '../../api/routing';
import './RoutingInsightsModal.css';

// ── Types ────────────────────────────────────────────────────

interface RoutingInsightsModalProps {
  show: boolean;
  onClose: () => void;
}

type Tab = 'overview' | 'findings' | 'rules';

// ── Impact badge colors ──────────────────────────────────────

const IMPACT_COLORS: Record<string, string> = {
  high: '#ff6b6b',
  medium: '#ffa502',
  low: '#1dd1a1',
};

const FINDING_ICONS: Record<string, React.ReactNode> = {
  cost_saving: <DollarSign size={16} />,
  routing_pattern: <BarChart3 size={16} />,
  model_mismatch: <AlertTriangle size={16} />,
  underused_desk: <Search size={16} />,
  general: <Zap size={16} />,
};

// ── Component ────────────────────────────────────────────────

const RoutingInsightsModal: React.FC<RoutingInsightsModalProps> = ({ show, onClose }) => {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [runs, setRuns] = useState<AnalysisRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<AnalysisRun | null>(null);
  const [relatedRules, setRelatedRules] = useState<RoutingRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ── Load runs ──────────────────────────────────────────────

  const loadRuns = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const result = await listAnalysisRuns(10);
      const runsList = Array.isArray(result?.runs) ? result.runs : [];
      setRuns(runsList);
      // Auto-select the latest completed run
      const latestCompleted = runsList.find(r => r.status === 'completed');
      if (latestCompleted) {
        await selectRun(latestCompleted.id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load analysis runs';
      setLoadError(msg);
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const selectRun = async (runId: string) => {
    try {
      const run = await getAnalysisRun(runId);
      if (run) {
        setSelectedRun(run);
        setRelatedRules(Array.isArray(run.related_rules) ? run.related_rules : []);
      }
    } catch {
      // Ignore individual run load errors
    }
  };

  useEffect(() => {
    if (show) {
      setSelectedRun(null);
      setRelatedRules([]);
      setRuns([]);
      loadRuns();
      setActiveTab('overview');
      setTriggerError('');
      setLoadError('');
    }
  }, [show, loadRuns]);

  // ── Handlers ───────────────────────────────────────────────

  const handleTriggerAnalysis = async () => {
    setTriggering(true);
    setTriggerError('');
    try {
      const result = await triggerAnalysis();
      if (result.error) {
        setTriggerError(result.error);
      } else {
        await loadRuns();
        if (result.runId) {
          await selectRun(result.runId);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to trigger analysis';
      setTriggerError(msg);
    } finally {
      setTriggering(false);
    }
  };

  const handleApproveRule = async (ruleId: string) => {
    if (!selectedRun) return;
    setActionLoading(ruleId);
    try {
      await approveAnalysisRule(selectedRun.id, ruleId);
      await selectRun(selectedRun.id);
    } catch {
      // Ignore
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectRule = async (ruleId: string) => {
    if (!selectedRun) return;
    setActionLoading(ruleId);
    try {
      await rejectAnalysisRule(selectedRun.id, ruleId);
      await selectRun(selectedRun.id);
    } catch {
      // Ignore
    } finally {
      setActionLoading(null);
    }
  };

  // ── Derived data ───────────────────────────────────────────

  const findings: AnalysisFinding[] = Array.isArray(selectedRun?.findings?.findings) ? selectedRun!.findings!.findings : [];
  const proposedRules: AnalysisProposedRule[] =
    Array.isArray(selectedRun?.proposed_rules) ? selectedRun!.proposed_rules as unknown as AnalysisProposedRule[] : [];
  const summary = selectedRun?.findings?.summary || '';
  const pendingRules = relatedRules.filter(r => !r.is_active);
  const activeRules = relatedRules.filter(r => r.is_active);

  // Safe number accessor — prevents .toFixed() crashes on null/undefined
  const safeNum = (val: unknown): number => {
    if (typeof val === 'number' && !isNaN(val)) return val;
    if (typeof val === 'string') { const n = parseFloat(val); return isNaN(n) ? 0 : n; }
    return 0;
  };

  if (!show) return null;

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="ri-overlay" onClick={onClose}>
      <div className="ri-panel" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ri-header">
          <h2><Sparkles size={20} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8, color: '#ffa502' }} />Routing Insights</h2>
          <div className="ri-header-actions">
            <button
              className="ri-trigger-btn"
              onClick={handleTriggerAnalysis}
              disabled={triggering}
            >
              {triggering ? (
                <><Loader2 size={14} className="ri-spin" /> Analyzing...</>
              ) : (
                <><Play size={14} /> Run Analysis</>
              )}
            </button>
            <button className="ri-close-btn" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        {triggerError && (
          <div className="ri-error-bar">
            <AlertTriangle size={14} /> {triggerError}
          </div>
        )}

        {/* Tabs */}
        <div className="ri-tabs">
          {(['overview', 'findings', 'rules'] as Tab[]).map(tab => (
            <button
              key={tab}
              className={`ri-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'overview' && <TrendingUp size={14} />}
              {tab === 'findings' && <BarChart3 size={14} />}
              {tab === 'rules' && <Zap size={14} />}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === 'rules' && pendingRules.length > 0 && (
                <span className="ri-badge">{pendingRules.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="ri-content">
          {loading ? (
            <div className="ri-loading">
              <Loader2 size={24} className="ri-spin" />
              <span>Loading insights...</span>
            </div>
          ) : loadError ? (
            <div className="ri-empty">
              <AlertTriangle size={32} style={{ color: '#ff6b6b', marginBottom: 12 }} />
              <p>Couldn't load analysis data</p>
              <p style={{ fontSize: 12, color: '#888' }}>
                {loadError}
              </p>
              <p style={{ fontSize: 11, color: '#666', marginTop: 8 }}>
                You may need to run database migrations (017_routing_analysis.sql). Click "Run Analysis" to generate your first report.
              </p>
            </div>
          ) : !selectedRun ? (
            <div className="ri-empty">
              <Sparkles size={32} style={{ color: '#ffa502', marginBottom: 12 }} />
              <p>No analysis runs yet.</p>
              <p style={{ fontSize: 12, color: '#888' }}>
                Click "Run Analysis" to analyze your routing patterns and get optimization suggestions.
              </p>
            </div>
          ) : (
            <>
              {/* ── Overview Tab ─────────────────────────────── */}
              {activeTab === 'overview' && (
                <div className="ri-overview">
                  {/* Summary */}
                  <div className="ri-summary-card">
                    <p className="ri-summary-text">{summary}</p>
                  </div>

                  {/* Stats Row */}
                  <div className="ri-stats-row">
                    <div className="ri-stat-card">
                      <span className="ri-stat-value">{selectedRun.tasks_analyzed ?? 0}</span>
                      <span className="ri-stat-label">Tasks Analyzed</span>
                    </div>
                    <div className="ri-stat-card">
                      <span className="ri-stat-value" style={{ color: '#1dd1a1' }}>
                        ${safeNum(selectedRun.estimated_savings_usd).toFixed(4)}
                      </span>
                      <span className="ri-stat-label">Est. Savings</span>
                    </div>
                    <div className="ri-stat-card">
                      <span className="ri-stat-value">${safeNum(selectedRun.total_cost_analyzed).toFixed(4)}</span>
                      <span className="ri-stat-label">Total Cost</span>
                    </div>
                    <div className="ri-stat-card">
                      <span className="ri-stat-value">{findings.length}</span>
                      <span className="ri-stat-label">Findings</span>
                    </div>
                  </div>

                  {/* Quick findings preview */}
                  {findings.length > 0 && (
                    <div className="ri-findings-preview">
                      <h4>Top Findings</h4>
                      {findings.slice(0, 3).map((f, i) => (
                        <div key={i} className="ri-finding-preview-item">
                          <span className="ri-finding-icon" style={{ color: IMPACT_COLORS[f.impact] }}>
                            {FINDING_ICONS[f.type] || <Zap size={16} />}
                          </span>
                          <span className="ri-finding-title">{f.title}</span>
                          <span className="ri-impact-badge" style={{ background: IMPACT_COLORS[f.impact] + '20', color: IMPACT_COLORS[f.impact] }}>
                            {f.impact}
                          </span>
                        </div>
                      ))}
                      {findings.length > 3 && (
                        <button className="ri-see-all" onClick={() => setActiveTab('findings')}>
                          See all {findings.length} findings <ArrowRight size={12} />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Pending rules preview */}
                  {pendingRules.length > 0 && (
                    <div className="ri-rules-preview">
                      <h4>Proposed Rules ({pendingRules.length} pending)</h4>
                      <button className="ri-see-all" onClick={() => setActiveTab('rules')}>
                        Review rules <ArrowRight size={12} />
                      </button>
                    </div>
                  )}

                  {/* Run history */}
                  <div className="ri-history">
                    <h4>Analysis History</h4>
                    <div className="ri-history-list">
                      {runs.map(run => (
                        <div
                          key={run.id}
                          className={`ri-history-item ${selectedRun?.id === run.id ? 'selected' : ''}`}
                          onClick={() => selectRun(run.id)}
                        >
                          <span className="ri-history-type">{run.run_type}</span>
                          <span className="ri-history-date">
                            {new Date(run.created_at).toLocaleDateString()}
                          </span>
                          <span className={`ri-history-status status-${run.status}`}>
                            {run.status}
                          </span>
                          {safeNum(run.estimated_savings_usd) > 0 && (
                            <span className="ri-history-savings">
                              <TrendingDown size={10} /> ${safeNum(run.estimated_savings_usd).toFixed(4)}
                            </span>
                          )}
                        </div>
                      ))}
                      {runs.length === 0 && (
                        <p className="ri-no-data">No analysis history yet.</p>
                      )}
                    </div>
                  </div>

                  {/* Analysis cost footer */}
                  {safeNum(selectedRun.analysis_cost_usd) > 0 && (
                    <div className="ri-analysis-cost">
                      Analysis cost: ${safeNum(selectedRun.analysis_cost_usd).toFixed(6)} ({selectedRun.analysis_model || 'unknown'})
                    </div>
                  )}
                </div>
              )}

              {/* ── Findings Tab ─────────────────────────────── */}
              {activeTab === 'findings' && (
                <div className="ri-findings-tab">
                  {findings.length === 0 ? (
                    <div className="ri-empty">
                      <p>No findings in this analysis run.</p>
                    </div>
                  ) : (
                    findings.map((f, i) => (
                      <div key={i} className={`ri-finding-card impact-${f.impact}`}>
                        <div className="ri-finding-header">
                          <span className="ri-finding-icon" style={{ color: IMPACT_COLORS[f.impact] }}>
                            {FINDING_ICONS[f.type] || <Zap size={16} />}
                          </span>
                          <span className="ri-finding-title">{f.title}</span>
                          <span className="ri-impact-badge" style={{ background: IMPACT_COLORS[f.impact] + '20', color: IMPACT_COLORS[f.impact] }}>
                            {f.impact}
                          </span>
                        </div>
                        <p className="ri-finding-desc">{f.description}</p>
                        {safeNum(f.estimatedSavingsUsd) > 0 && (
                          <div className="ri-finding-savings">
                            <TrendingDown size={12} /> Estimated savings: <strong>${safeNum(f.estimatedSavingsUsd).toFixed(4)}</strong>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ── Rules Tab ─────────────────────────────────── */}
              {activeTab === 'rules' && (
                <div className="ri-rules-tab">
                  {/* Pending rules */}
                  {pendingRules.length > 0 && (
                    <div className="ri-rules-section">
                      <h4>Pending Approval</h4>
                      {pendingRules.map(rule => {
                        const proposedMatch = proposedRules.find(
                          pr => JSON.stringify(pr.condition) === JSON.stringify(rule.condition)
                        );
                        return (
                          <div key={rule.id} className="ri-rule-card pending">
                            <div className="ri-rule-header">
                              <span className="ri-rule-type">{rule.rule_type.replace(/_/g, ' ')}</span>
                              {proposedMatch && (
                                <span className="ri-rule-confidence">
                                  {Math.round(proposedMatch.confidence * 100)}% confidence
                                </span>
                              )}
                            </div>
                            <div className="ri-rule-condition">
                              <strong>When:</strong> {formatCondition(rule.condition)}
                            </div>
                            <div className="ri-rule-action">
                              <strong>Then:</strong> {formatAction(rule.action)}
                            </div>
                            {proposedMatch && (
                              <>
                                <p className="ri-rule-reasoning">{proposedMatch.reasoning}</p>
                                <div className="ri-rule-impact">{proposedMatch.estimatedImpact}</div>
                              </>
                            )}
                            <div className="ri-rule-actions">
                              <button
                                className="ri-approve-btn"
                                onClick={() => handleApproveRule(rule.id)}
                                disabled={actionLoading === rule.id}
                              >
                                {actionLoading === rule.id ? (
                                  <Loader2 size={14} className="ri-spin" />
                                ) : (
                                  <CheckCircle size={14} />
                                )}
                                Approve
                              </button>
                              <button
                                className="ri-reject-btn"
                                onClick={() => handleRejectRule(rule.id)}
                                disabled={actionLoading === rule.id}
                              >
                                <XCircle size={14} />
                                Reject
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Active rules from analysis */}
                  {activeRules.length > 0 && (
                    <div className="ri-rules-section">
                      <h4>Active Rules (from Analysis)</h4>
                      {activeRules.map(rule => (
                        <div key={rule.id} className="ri-rule-card active">
                          <div className="ri-rule-header">
                            <span className="ri-rule-type">{rule.rule_type.replace(/_/g, ' ')}</span>
                            <span className="ri-rule-stats">
                              {rule.hit_count} hits, {rule.success_count} successes
                            </span>
                          </div>
                          <div className="ri-rule-condition">
                            <strong>When:</strong> {formatCondition(rule.condition)}
                          </div>
                          <div className="ri-rule-action">
                            <strong>Then:</strong> {formatAction(rule.action)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {pendingRules.length === 0 && activeRules.length === 0 && (
                    <div className="ri-empty">
                      <p>No routing rules from analysis yet.</p>
                      <p style={{ fontSize: 12, color: '#888' }}>
                        Run an analysis to get rule proposals based on your usage patterns.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Helpers ──────────────────────────────────────────────────

function formatCondition(condition: Record<string, unknown>): string {
  if (condition.keywords && Array.isArray(condition.keywords)) {
    return `Task contains: "${(condition.keywords as string[]).join('", "')}"`;
  }
  if (condition.category) {
    return `Task category is "${condition.category}"`;
  }
  return JSON.stringify(condition);
}

function formatAction(action: Record<string, unknown>): string {
  const parts: string[] = [];
  if (action.desk_id || action.prefer_desk) {
    parts.push(`Route to desk ${action.desk_id || action.prefer_desk}`);
  }
  if (action.prefer_model) {
    parts.push(`Use model ${action.prefer_model}`);
  }
  if (parts.length === 0) return JSON.stringify(action);
  return parts.join(', ');
}

export default RoutingInsightsModal;
