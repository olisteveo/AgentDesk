/**
 * RulesDashboard — dedicated modal for managing core presets, team-wide,
 * and per-desk AI agent rules. Rules are injected into every AI system
 * prompt so agents follow them during tasks, chat, and meetings.
 *
 * Tabs: Core | Team | Per Desk | Suggestions
 *
 * Core rules are uneditable presets selected during onboarding.
 * Users can change which preset is active but cannot modify individual rules.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  X, Plus, Pencil, Trash2, Sparkles, Shield,
  Rocket, Briefcase, Palette, Settings, MessageCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  listRules,
  createRule,
  updateRule,
  toggleRule,
  approveRule,
  rejectRule,
  deleteRule,
  changeCorePreset,
} from '../../api/rules';
import { RULE_CATEGORIES } from '../../types/rules';
import { CORE_RULES_PRESETS } from '../../utils/coreRulesPresets';
import type { Rule, RulesResponse, RuleCategory } from '../../types/rules';
import type { CoreRulesPreset } from '../../utils/coreRulesPresets';

// Map iconName strings from presets to actual Lucide components
const PRESET_ICONS: Record<string, LucideIcon> = {
  Rocket, Briefcase, Palette, Settings, MessageCircle,
};
import './RulesDashboard.css';

// ── Types ──────────────────────────────────────────────────

type Tab = 'core' | 'team' | 'desk' | 'suggestions';

interface DeskInfo {
  id: string;
  name: string;
  agentName: string;
}

interface RulesDashboardProps {
  show: boolean;
  onClose: () => void;
  desks: DeskInfo[];
}

// ── Component ──────────────────────────────────────────────

const RulesDashboard: React.FC<RulesDashboardProps> = ({ show, onClose, desks }) => {
  const [activeTab, setActiveTab] = useState<Tab>('core');
  const [data, setData] = useState<RulesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [selectedDesk, setSelectedDesk] = useState('');
  const [changingPreset, setChangingPreset] = useState(false);

  // Form fields
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formScope, setFormScope] = useState<'team' | 'desk'>('team');
  const [formDeskId, setFormDeskId] = useState('');
  const [formCategory, setFormCategory] = useState<RuleCategory>('general');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Load rules ────────────────────────────────────────────

  const loadRules = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await listRules();
      setData(result);
    } catch {
      // Ignore loading errors silently
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (show) {
      loadRules();
      setShowForm(false);
      setEditingRule(null);
    }
  }, [show, loadRules]);

  // ── Handlers ──────────────────────────────────────────────

  const handleToggle = async (rule: Rule) => {
    try {
      await toggleRule(rule.id, rule.status !== 'active');
      await loadRules();
    } catch { /* ignore */ }
  };

  const handleDelete = async (rule: Rule) => {
    try {
      await deleteRule(rule.id);
      await loadRules();
    } catch { /* ignore */ }
  };

  const handleApprove = async (rule: Rule) => {
    try {
      await approveRule(rule.id);
      await loadRules();
    } catch { /* ignore */ }
  };

  const handleReject = async (rule: Rule) => {
    try {
      await rejectRule(rule.id);
      await loadRules();
    } catch { /* ignore */ }
  };

  const handleChangeCorePreset = async (presetId: string) => {
    try {
      await changeCorePreset(presetId);
      await loadRules();
      setChangingPreset(false);
    } catch { /* ignore */ }
  };

  const openCreateForm = (scope: 'team' | 'desk' = 'team') => {
    setEditingRule(null);
    setFormTitle('');
    setFormContent('');
    setFormScope(scope);
    setFormDeskId(desks[0]?.id ?? '');
    setFormCategory('general');
    setFormError('');
    setShowForm(true);
  };

  const openEditForm = (rule: Rule) => {
    setEditingRule(rule);
    setFormTitle(rule.title);
    setFormContent(rule.content);
    setFormScope(rule.scope);
    setFormDeskId(rule.desk_id ?? desks[0]?.id ?? '');
    setFormCategory(rule.category as RuleCategory);
    setFormError('');
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!formTitle.trim() || !formContent.trim()) {
      setFormError('Title and content are required.');
      return;
    }
    if (formScope === 'desk' && !formDeskId) {
      setFormError('Please select a desk for this rule.');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      if (editingRule) {
        await updateRule(editingRule.id, {
          title: formTitle.trim(),
          content: formContent.trim(),
          category: formCategory,
        });
      } else {
        await createRule({
          title: formTitle.trim(),
          content: formContent.trim(),
          scope: formScope,
          deskId: formScope === 'desk' ? formDeskId : undefined,
          category: formCategory,
        });
      }
      setShowForm(false);
      setEditingRule(null);
      await loadRules();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message
        : err && typeof err === 'object' && 'message' in err ? String((err as Record<string, unknown>).message)
        : 'Failed to save rule';
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  // ── Computed data ─────────────────────────────────────────

  if (!show) return null;

  const teamRules = data?.team ?? [];
  const deskRulesMap = data?.desk ?? {};
  const pending = data?.pending ?? [];
  const activeCorePreset: CoreRulesPreset | null = data?.corePreset
    ? CORE_RULES_PRESETS.find(p => p.id === data.corePreset!.id) ?? null
    : null;

  const filteredDeskRules = selectedDesk
    ? deskRulesMap[selectedDesk] ?? []
    : Object.values(deskRulesMap).flat();

  const getCategoryColor = (cat: string) =>
    RULE_CATEGORIES.find(c => c.id === cat)?.color ?? '#888';

  const getCategoryLabel = (cat: string) =>
    RULE_CATEGORIES.find(c => c.id === cat)?.label ?? cat;

  const getDeskName = (rule: Rule) =>
    rule.desk_agent_name || rule.desk_name || desks.find(d => d.id === rule.desk_id)?.agentName || 'Agent';

  // ── Render helpers ────────────────────────────────────────

  const renderRuleCard = (rule: Rule) => (
    <div key={rule.id} className={`rd-rule-card${rule.status === 'disabled' ? ' disabled' : ''}`}>
      <div className="rd-rule-header">
        <label className="rd-toggle">
          <input
            type="checkbox"
            checked={rule.status === 'active'}
            onChange={() => handleToggle(rule)}
          />
          <span className="rd-toggle-slider" />
        </label>
        <span className="rd-rule-title">{rule.title}</span>
        <button className="rd-icon-btn" onClick={() => openEditForm(rule)} title="Edit">
          <Pencil size={14} />
        </button>
        <button className="rd-icon-btn delete" onClick={() => handleDelete(rule)} title="Delete">
          <Trash2 size={14} />
        </button>
      </div>
      <div className="rd-rule-content">{rule.content}</div>
      <div className="rd-rule-meta">
        <span className={`rd-badge scope-${rule.scope}`}>
          {rule.scope === 'team' ? 'Team' : getDeskName(rule)}
        </span>
        <span className="rd-badge cat" style={{ color: getCategoryColor(rule.category) }}>
          {getCategoryLabel(rule.category)}
        </span>
      </div>
    </div>
  );

  const renderSuggestionCard = (rule: Rule) => (
    <div key={rule.id} className="rd-suggestion-card">
      <div className="rd-suggestion-source">
        Suggested by <strong>{rule.suggested_by_agent_name || 'AI Agent'}</strong>
        {rule.suggestion_context && (
          <> after completing &ldquo;{rule.suggestion_context}&rdquo;</>
        )}
      </div>
      <div className="rd-rule-title" style={{ marginBottom: 6 }}>{rule.title}</div>
      <div className="rd-rule-content" style={{ WebkitLineClamp: 'unset' as unknown as number }}>{rule.content}</div>
      <div className="rd-suggestion-actions">
        <button className="rd-approve-btn" onClick={() => handleApprove(rule)}>
          Approve
        </button>
        <button className="rd-secondary-btn" onClick={() => openEditForm(rule)}>
          Edit & Approve
        </button>
        <button className="rd-reject-btn" onClick={() => handleReject(rule)}>
          Reject
        </button>
      </div>
    </div>
  );

  const renderCoreRulesTab = () => {
    if (changingPreset) {
      return (
        <div className="rd-core-picker">
          <p className="rd-core-picker-title">Choose a new core rules preset</p>
          <div className="rd-core-preset-grid">
            {CORE_RULES_PRESETS.map(preset => (
              <button
                key={preset.id}
                className={`rd-core-preset-option${activeCorePreset?.id === preset.id ? ' current' : ''}`}
                onClick={() => handleChangeCorePreset(preset.id)}
              >
                {(() => {
                  const Icon = PRESET_ICONS[preset.iconName];
                  return (
                    <div className="rd-core-icon-wrap">
                      {Icon && <Icon size={18} strokeWidth={1.8} />}
                    </div>
                  );
                })()}
                <span className="rd-core-name">{preset.name}</span>
                {activeCorePreset?.id === preset.id && (
                  <span className="rd-core-current-badge">Current</span>
                )}
              </button>
            ))}
          </div>
          <button className="rd-secondary-btn" onClick={() => setChangingPreset(false)} style={{ marginTop: 12 }}>
            Cancel
          </button>
        </div>
      );
    }

    if (!activeCorePreset) {
      return (
        <div className="rd-empty">
          <Shield size={32} style={{ color: '#667eea', marginBottom: 12 }} />
          <h3>No core rules set</h3>
          <p>Core rules are foundational behaviour guidelines for all agents. Choose a preset to get started.</p>
          <button className="rd-add-btn" onClick={() => setChangingPreset(true)}>
            Choose Core Rules
          </button>
        </div>
      );
    }

    return (
      <>
        <div className="rd-core-header">
          <div className="rd-core-active-preset">
            {(() => {
              const Icon = PRESET_ICONS[activeCorePreset.iconName];
              return (
                <div className="rd-core-icon-wrap lg">
                  {Icon && <Icon size={24} strokeWidth={1.8} />}
                </div>
              );
            })()}
            <div>
              <div className="rd-core-active-name">{activeCorePreset.name}</div>
              <div className="rd-core-active-desc">{activeCorePreset.description}</div>
            </div>
          </div>
          <button className="rd-secondary-btn compact" onClick={() => setChangingPreset(true)}>
            Change Preset
          </button>
        </div>

        <div className="rd-core-rules-list">
          {activeCorePreset.rules.map((rule, i) => (
            <div key={i} className="rd-core-rule-card">
              <div className="rd-core-rule-number">{i + 1}</div>
              <div>
                <div className="rd-core-rule-title">{rule.title}</div>
                <div className="rd-core-rule-content">{rule.content}</div>
              </div>
              <div className="rd-core-lock">
                <Shield size={12} />
              </div>
            </div>
          ))}
        </div>

        <p className="rd-core-footer">
          Core rules cannot be edited. They shape the foundational behaviour of all agents. You can change the active preset at any time.
        </p>
      </>
    );
  };

  const renderForm = () => (
    <div className="rd-form">
      <h3>{editingRule ? 'Edit Rule' : 'New Rule'}</h3>

      <div className="rd-form-group">
        <label>Title</label>
        <input
          value={formTitle}
          onChange={e => setFormTitle(e.target.value)}
          placeholder="e.g. Be Concise"
          maxLength={255}
        />
      </div>

      <div className="rd-form-group">
        <label>Rule Content</label>
        <textarea
          value={formContent}
          onChange={e => setFormContent(e.target.value)}
          placeholder="e.g. Keep responses under 300 words unless the user explicitly asks for detail."
        />
      </div>

      <div className="rd-form-row">
        {!editingRule && (
          <div className="rd-form-group">
            <label>Scope</label>
            <div className="rd-scope-radios">
              <label className="rd-scope-radio">
                <input
                  type="radio"
                  name="scope"
                  checked={formScope === 'team'}
                  onChange={() => setFormScope('team')}
                />
                Team-wide
              </label>
              <label className="rd-scope-radio">
                <input
                  type="radio"
                  name="scope"
                  checked={formScope === 'desk'}
                  onChange={() => setFormScope('desk')}
                />
                Specific Desk
              </label>
            </div>
          </div>
        )}

        <div className="rd-form-group">
          <label>Category</label>
          <select value={formCategory} onChange={e => setFormCategory(e.target.value as RuleCategory)}>
            {RULE_CATEGORIES.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {formScope === 'desk' && !editingRule && (
        <div className="rd-form-group">
          <label>Desk / Agent</label>
          <select value={formDeskId} onChange={e => setFormDeskId(e.target.value)}>
            {desks.map(d => (
              <option key={d.id} value={d.id}>{d.agentName} ({d.name})</option>
            ))}
          </select>
        </div>
      )}

      {formError && (
        <p style={{ color: '#ff6b6b', fontSize: 12, margin: '0 0 8px' }}>{formError}</p>
      )}

      <div className="rd-form-actions">
        <button className="rd-add-btn" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving...' : editingRule ? 'Update Rule' : 'Create Rule'}
        </button>
        <button className="rd-secondary-btn" onClick={() => { setShowForm(false); setEditingRule(null); }}>
          Cancel
        </button>
      </div>
    </div>
  );

  const renderEmpty = (message: string) => (
    <div className="rd-empty">
      <h3>No rules yet</h3>
      <p>{message}</p>
      <button className="rd-add-btn" onClick={() => openCreateForm(activeTab === 'desk' ? 'desk' : 'team')}>
        <Plus size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
        Add Your First Rule
      </button>
    </div>
  );

  // ── Main render ───────────────────────────────────────────

  return (
    <div className="rd-overlay" onClick={onClose}>
      <div className="rd-panel" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="rd-header">
          <h2>Rules</h2>
          <div className="rd-header-actions">
            {!showForm && activeTab !== 'core' && activeTab !== 'suggestions' && (
              <button className="rd-add-btn" onClick={() => openCreateForm(activeTab === 'desk' ? 'desk' : 'team')}>
                <Plus size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                Add Rule
              </button>
            )}
            <button className="rd-close-btn" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="rd-tabs">
          {(['core', 'team', 'desk', 'suggestions'] as Tab[]).map(tab => (
            <button
              key={tab}
              className={`rd-tab${activeTab === tab ? ' active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'core' && (
                <>
                  <Shield size={13} />
                  Core
                </>
              )}
              {tab === 'team' && 'Team'}
              {tab === 'desk' && 'Per Desk'}
              {tab === 'suggestions' && (
                <>
                  <Sparkles size={13} />
                  Suggestions
                  {pending.length > 0 && (
                    <span className="rd-tab-badge">{pending.length}</span>
                  )}
                </>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="rd-body">
          {isLoading ? (
            <div className="rd-loading">
              <div className="rd-spinner" />
              <p style={{ marginTop: 12 }}>Loading rules...</p>
            </div>
          ) : (
            <>
              {showForm && renderForm()}

              {/* Core Rules tab */}
              {activeTab === 'core' && renderCoreRulesTab()}

              {/* Team Rules tab */}
              {activeTab === 'team' && (
                teamRules.length === 0
                  ? renderEmpty('Team rules apply to every agent. Add custom rules on top of your core preset.')
                  : teamRules.map(renderRuleCard)
              )}

              {/* Desk Rules tab */}
              {activeTab === 'desk' && (
                <>
                  {desks.length > 0 && (
                    <div className="rd-desk-filter">
                      <select value={selectedDesk} onChange={e => setSelectedDesk(e.target.value)}>
                        <option value="">All Desks</option>
                        {desks.map(d => (
                          <option key={d.id} value={d.id}>{d.agentName} ({d.name})</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {filteredDeskRules.length === 0
                    ? renderEmpty('Desk rules apply to a specific agent only. Customise individual agent behaviour here.')
                    : filteredDeskRules.map(renderRuleCard)}
                </>
              )}

              {/* Suggestions tab */}
              {activeTab === 'suggestions' && (
                pending.length === 0
                  ? (
                    <div className="rd-empty">
                      <h3>No pending suggestions</h3>
                      <p>When your agents complete tasks, they may suggest new rules to improve future work. Suggestions will appear here for your review.</p>
                    </div>
                  )
                  : pending.map(renderSuggestionCard)
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RulesDashboard;
