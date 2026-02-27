import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { AVAILABLE_MODELS, MODEL_PRICING, PROVIDERS_LIST, ROLE_ARCHETYPES, MODEL_FRIENDLY_LABELS } from '../../utils/constants';
import type { RoleArchetype, ModelTier } from '../../utils/constants';
import {
  listProviders,
  connectProvider,
  disconnectProvider,
  type ProviderConnection,
  type ProviderModel,
} from '../../api/providers';
import ApiKeyDetectInput from '../ui/ApiKeyDetectInput';
import type { DetectedProvider } from '../ui/ApiKeyDetectInput';
import type { Zone, DeskType, DeskAssignment } from '../../types';
import { validateName } from '../../utils/profanityFilter';
import { ChevronDown } from 'lucide-react';
import './HireWizard.css';

const DESK_OPTIONS: { key: DeskType; label: string; asset: string }[] = [
  { key: 'mini',     label: 'Starter',  asset: '/assets/desk-mini.png' },
  { key: 'standard', label: 'Standard', asset: '/assets/desk-standard.png' },
  { key: 'power',    label: 'Executive', asset: '/assets/desk-boss.png' },
];

interface HireWizardProps {
  desks: Zone[];
  deskAssignments: DeskAssignment[];
  onComplete: (data: {
    model: string;
    agentName: string;
    avatar: 'avatar1' | 'avatar2' | 'avatar3';
    deskName: string;
    deskType: DeskType;
    deskCategory?: string;
    deskCapabilities?: string[];
    deskDescription?: string;
    systemPrompt?: string;
  }) => void;
  onClose: () => void;
  onDeskRemoved: (deskId: string) => void;
  /** Cascading disconnect: removes provider + all affected desks/agents */
  onProviderDisconnected: (providerId: string, affectedDeskIds: string[]) => void;
  /** Edit an existing desk's settings */
  onDeskEdited: (deskId: string, changes: {
    deskName?: string;
    agentName?: string;
    avatar?: 'avatar1' | 'avatar2' | 'avatar3';
    modelId?: string;
    deskType?: DeskType;
  }) => void;
  /** Pre-loaded provider from onboarding — skips Step 1 (auto-saves + starts at model selection) */
  preloadedProvider?: DetectedProvider | null;
}

type Mode = 'hire' | 'manage';

// ── Tier badge helper ─────────────────────────────────────
const tierColor = (tier: ModelTier): string => {
  if (tier === 'premium') return '#ffd700';
  if (tier === 'balanced') return '#667eea';
  return '#1dd1a1';
};

const tierLabel = (tier: ModelTier): string => {
  if (tier === 'premium') return 'Premium';
  if (tier === 'balanced') return 'Balanced';
  return 'Budget';
};

const HireWizard: React.FC<HireWizardProps> = ({
  desks,
  deskAssignments,
  onComplete,
  onClose,
  onDeskRemoved,
  onProviderDisconnected,
  onDeskEdited,
  preloadedProvider,
}) => {
  const [mode, setMode] = useState<Mode>('hire');
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Provider connections from backend
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(true);

  // Step 1 — archetype selection
  const [selectedArchetype, setSelectedArchetype] = useState<RoleArchetype | null>(null);

  // Step 2 — provider + model
  const [useExisting, setUseExisting] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState('');
  const [detectedResult, setDetectedResult] = useState<DetectedProvider | null>(null);
  const [detectedModels, setDetectedModels] = useState<ProviderModel[]>([]);
  const [savingDetected, setSavingDetected] = useState(false);
  const [model, setModel] = useState('');

  // Step 3 — personalize
  const [agentName, setAgentName] = useState('');
  const [agentNameError, setAgentNameError] = useState('');
  const [avatar, setAvatar] = useState<'avatar1' | 'avatar2' | 'avatar3'>('avatar1');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [showPersonality, setShowPersonality] = useState(false);

  // Manage tab state
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  // Disconnect confirmation dialog state
  const [disconnectConfirm, setDisconnectConfirm] = useState<{
    credId: string;
    providerId: string;
    providerName: string;
    affectedDesks: { deskId: string; label: string; modelName: string }[];
  } | null>(null);

  // Edit desk inline form state
  const [editingDeskId, setEditingDeskId] = useState<string | null>(null);
  const [editDeskName, setEditDeskName] = useState('');
  const [editAgentName, setEditAgentName] = useState('');
  const [editNameError, setEditNameError] = useState('');
  const [editAvatar, setEditAvatar] = useState<'avatar1' | 'avatar2' | 'avatar3'>('avatar1');
  const [editModel, setEditModel] = useState('');
  const [editDeskType, setEditDeskType] = useState<DeskType>('mini');

  // Track provider warnings persistently (provider -> warning message)
  const [providerWarnings, setProviderWarnings] = useState<Record<string, string>>({});

  // Load connections from backend on mount
  useEffect(() => {
    loadConnections();
  }, []);

  // Handle pre-loaded provider from onboarding — auto-save and skip to model selection
  useEffect(() => {
    if (!preloadedProvider) return;

    const bootstrap = async () => {
      setDetectedResult(preloadedProvider);
      setDetectedModels(preloadedProvider.models);
      if (preloadedProvider.warning) {
        setProviderWarnings(prev => ({ ...prev, [preloadedProvider.provider]: preloadedProvider.warning! }));
      }

      try {
        const saved = await connectProvider(preloadedProvider.provider, preloadedProvider.apiKey, preloadedProvider.warning);
        setConnections(prev => {
          const filtered = prev.filter(c => c.provider !== preloadedProvider.provider);
          return [...filtered, saved];
        });
        setUseExisting(true);
        setSelectedConnection(saved.id);
      } catch {
        // Still advance
      }

      // Jump to Step 2 (model selection) — archetype defaults to general
      setSelectedArchetype(ROLE_ARCHETYPES.find(a => a.id === 'general') || ROLE_ARCHETYPES[5]);
      setStep(2);
    };

    bootstrap();
  }, [preloadedProvider]);

  const loadConnections = async () => {
    setLoadingConnections(true);
    try {
      const result = await listProviders();
      const active = result.filter(c => c.isConnected);
      setConnections(active);

      const warnings: Record<string, string> = {};
      for (const conn of active) {
        if (conn.warning) {
          warnings[conn.provider] = conn.warning;
        }
      }
      if (Object.keys(warnings).length > 0) {
        setProviderWarnings(prev => ({ ...prev, ...warnings }));
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingConnections(false);
    }
  };

  const handleDetected = useCallback(async (result: DetectedProvider) => {
    setDetectedResult(result);
    setDetectedModels(result.models);

    if (result.warning) {
      setProviderWarnings(prev => ({ ...prev, [result.provider]: result.warning! }));
    }

    setSavingDetected(true);
    try {
      const saved = await connectProvider(result.provider, result.apiKey, result.warning);
      setConnections(prev => {
        const filtered = prev.filter(c => c.provider !== result.provider);
        return [...filtered, saved];
      });
      setUseExisting(true);
      setSelectedConnection(saved.id);
    } catch {
      // Connection saved in detect, just couldn't persist
    } finally {
      setSavingDetected(false);
    }
  }, []);

  // Manage tab: auto-detect callback (just save, don't advance)
  const handleManageDetected = useCallback(async (result: DetectedProvider) => {
    if (result.warning) {
      setProviderWarnings(prev => ({ ...prev, [result.provider]: result.warning! }));
    }

    try {
      const saved = await connectProvider(result.provider, result.apiKey, result.warning);
      setConnections(prev => {
        const filtered = prev.filter(c => c.provider !== result.provider);
        return [...filtered, saved];
      });
    } catch {
      // Silent fail
    }
  }, []);

  const handleDisconnect = async (credId: string) => {
    setDisconnecting(credId);
    try {
      await disconnectProvider(credId);
      setConnections(prev => prev.filter(c => c.id !== credId));
    } catch {
      // Show error inline
    } finally {
      setDisconnecting(null);
    }
  };

  const handleDisconnectClick = (credId: string, providerId: string) => {
    const provInfo = PROVIDERS_LIST.find(p => p.id === providerId);
    const providerModelIds = new Set(provInfo?.models || []);

    const affected = deskAssignments
      .filter(a => providerModelIds.has(a.modelId))
      .map(a => {
        const desk = desks.find(d => d.id === a.deskId);
        const modelInfo = AVAILABLE_MODELS.find(m => m.id === a.modelId);
        return {
          deskId: a.deskId,
          label: desk?.label || a.customName || a.deskId,
          modelName: modelInfo?.name || a.modelId,
        };
      });

    setDisconnectConfirm({
      credId,
      providerId,
      providerName: provInfo?.name || providerId,
      affectedDesks: affected,
    });
  };

  const confirmDisconnect = async () => {
    if (!disconnectConfirm) return;
    const { credId, providerId, affectedDesks } = disconnectConfirm;

    if (affectedDesks.length > 0) {
      onProviderDisconnected(providerId, affectedDesks.map(d => d.deskId));
    }

    await handleDisconnect(credId);
    setDisconnectConfirm(null);
  };

  // ── Edit desk helpers ─────────────────────────────────────
  const openEditForm = (deskId: string) => {
    const assignment = deskAssignments.find(a => a.deskId === deskId);
    const desk = desks.find(d => d.id === deskId);

    setEditingDeskId(deskId);
    setEditDeskName(desk?.label || assignment?.customName || '');
    setEditAgentName(assignment?.agentName || '');
    setEditAvatar((assignment?.avatarId as 'avatar1' | 'avatar2' | 'avatar3') || 'avatar1');
    setEditModel(assignment?.modelId || '');
    setEditDeskType(assignment?.deskType || 'mini');
  };

  const saveEdit = () => {
    if (!editingDeskId) return;
    if (editDeskName.trim()) {
      const deskIssue = validateName(editDeskName);
      if (deskIssue) { setEditNameError(deskIssue); return; }
    }
    if (editAgentName.trim()) {
      const nameIssue = validateName(editAgentName);
      if (nameIssue) { setEditNameError(nameIssue); return; }
    }
    onDeskEdited(editingDeskId, {
      deskName: editDeskName || undefined,
      agentName: editAgentName || undefined,
      avatar: editAvatar,
      modelId: editModel || undefined,
      deskType: editDeskType,
    });
    setEditingDeskId(null);
    setEditNameError('');
  };

  // All models from connected providers (for edit form dropdown)
  const allConnectedModels = useMemo(() => {
    const connectedProviderIds = connections.map(c => c.provider);
    return AVAILABLE_MODELS.filter(m =>
      connectedProviderIds.includes(m.provider)
    );
  }, [connections]);

  // ── Step 2: available models sorted by tier match ──────
  const providerModels = useMemo(() => {
    if (detectedModels.length > 0 && !useExisting) {
      return detectedModels.map(m => m.id);
    }
    const provId = useExisting
      ? connections.find(c => c.id === selectedConnection)?.provider
      : detectedResult?.provider;
    return PROVIDERS_LIST.find(p => p.id === provId)?.models || [];
  }, [useExisting, selectedConnection, detectedResult, detectedModels, connections]);

  // Sort models: matching tier first, then by price ascending
  const sortedModels = useMemo(() => {
    const archetypeTier = selectedArchetype?.modelTier || 'budget';
    return [...providerModels].sort((a, b) => {
      const tierA = MODEL_FRIENDLY_LABELS[a]?.tier || 'balanced';
      const tierB = MODEL_FRIENDLY_LABELS[b]?.tier || 'balanced';
      const matchA = tierA === archetypeTier ? 0 : 1;
      const matchB = tierB === archetypeTier ? 0 : 1;
      if (matchA !== matchB) return matchA - matchB;
      // Then sort by price
      const priceA = MODEL_PRICING[a] ? MODEL_PRICING[a].input + MODEL_PRICING[a].output : 999;
      const priceB = MODEL_PRICING[b] ? MODEL_PRICING[b].input + MODEL_PRICING[b].output : 999;
      return priceA - priceB;
    });
  }, [providerModels, selectedArchetype]);

  // Auto-select cheapest matching tier model when provider changes
  useEffect(() => {
    if (step !== 2 || sortedModels.length === 0 || model) return;
    setModel(sortedModels[0]);
  }, [step, sortedModels, model]);

  const hasProvider = connections.length > 0;

  const isStepValid = useMemo(() => {
    switch (step) {
      case 1:
        return !!selectedArchetype;
      case 2:
        return !!model && (useExisting ? !!selectedConnection : !!detectedResult?.provider);
      case 3:
        return !!agentName.trim();
      default:
        return false;
    }
  }, [step, selectedArchetype, model, useExisting, selectedConnection, detectedResult, agentName]);

  // When archetype is selected, pre-fill system prompt
  useEffect(() => {
    if (selectedArchetype) {
      setSystemPrompt(selectedArchetype.defaultSystemPrompt);
    }
  }, [selectedArchetype]);

  const handleComplete = () => {
    const issue = validateName(agentName);
    if (issue) { setAgentNameError(issue); return; }

    const archetype = selectedArchetype!;
    const deskName = `${archetype.title} Desk`;

    onComplete({
      model,
      agentName,
      avatar,
      deskName,
      deskType: 'mini',
      deskCategory: archetype.category,
      deskCapabilities: archetype.defaultCapabilities,
      systemPrompt: systemPrompt || undefined,
    });
  };

  const connectedProviders = connections;
  const userDesks = desks.filter(d => d.id?.startsWith('desk'));

  const stepLabels = ['Pick Role', 'Connect AI', 'Personalize'];

  return (
    <div className="hire-wizard-overlay" onClick={onClose}>
      <div className="hire-wizard" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <form autoComplete="off" onSubmit={e => e.preventDefault()} style={{ display: 'contents' }}>
        <div className="hire-wizard-header">
          <h2>{mode === 'hire' ? 'Hire Agent' : 'Manage'}</h2>
          <button className="close-btn" onClick={onClose}>x</button>
        </div>

        {/* Mode tabs */}
        <div className="wizard-mode-tabs">
          <button
            className={`wizard-mode-tab${mode === 'hire' ? ' active' : ''}`}
            onClick={() => setMode('hire')}>
            + Hire Agent
          </button>
          <button
            className={`wizard-mode-tab${mode === 'manage' ? ' active' : ''}`}
            onClick={() => setMode('manage')}>
            Manage
          </button>
        </div>

        {/* ========== HIRE MODE ========== */}
        {mode === 'hire' && (
          <>
            <div className="hire-wizard-progress">
              {[1, 2, 3].map(s => (
                <div key={s} className={`progress-step${s <= step ? ' active' : ''}`} />
              ))}
            </div>

            <div className="hire-wizard-step-label">
              Step {step} of 3: {stepLabels[step - 1]}
            </div>

            <div className="hire-wizard-body">
              {/* ── Step 1: Pick Role ────────────────────────────── */}
              {step === 1 && (
                <div>
                  <p className="wizard-hint">Who do you want to hire?</p>
                  <div className="archetype-grid">
                    {ROLE_ARCHETYPES.map(arch => (
                      <button
                        key={arch.id}
                        type="button"
                        className={`archetype-card${selectedArchetype?.id === arch.id ? ' selected' : ''}`}
                        onClick={() => setSelectedArchetype(arch)}>
                        <span className="archetype-icon">{arch.icon}</span>
                        <span className="archetype-title">{arch.title}</span>
                        <span className="archetype-tagline">{arch.tagline}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Step 2: Connect AI + Pick Model ──────────────── */}
              {step === 2 && (
                <div>
                  {/* Provider section: show if no provider connected */}
                  {!hasProvider && (
                    <div style={{ marginBottom: '20px' }}>
                      <p className="wizard-hint">Connect an AI provider to get started:</p>
                      <ApiKeyDetectInput
                        onDetected={handleDetected}
                        showHints
                        placeholder="Paste any API key \u2014 we'll detect the provider"
                      />
                      {savingDetected && (
                        <div className="wizard-hint" style={{ textAlign: 'center', marginTop: '8px' }}>
                          Saving connection...
                        </div>
                      )}
                    </div>
                  )}

                  {/* Provider connected: show existing connections + model picker */}
                  {hasProvider && (
                    <>
                      {/* Compact connected provider indicator */}
                      {connectedProviders.length > 0 && !useExisting && (
                        <div style={{ marginBottom: '12px' }}>
                          {connectedProviders.map(conn => {
                            const hasWarning = !!providerWarnings[conn.provider];
                            return (
                              <div key={conn.id}
                                className={`wizard-card compact-provider${useExisting && selectedConnection === conn.id ? ' selected' : ''}`}
                                onClick={() => {
                                  setUseExisting(true);
                                  setSelectedConnection(conn.id);
                                  setDetectedResult(null);
                                  setDetectedModels([]);
                                  setModel('');
                                }}>
                                <strong>{PROVIDERS_LIST.find(p => p.id === conn.provider)?.name || conn.provider}</strong>
                                {hasWarning ? (
                                  <span className="warning-badge">Low Credits</span>
                                ) : (
                                  <span className="connected-badge">Connected</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {connectedProviders.length > 0 && useExisting && !selectedConnection && (
                        <div style={{ marginBottom: '12px' }}>
                          <label className="wizard-label">Use existing connection:</label>
                          {connectedProviders.map(conn => {
                            const hasWarning = !!providerWarnings[conn.provider];
                            return (
                              <div key={conn.id}
                                className={`wizard-card${selectedConnection === conn.id ? ' selected' : ''}`}
                                onClick={() => {
                                  setSelectedConnection(conn.id);
                                  setModel('');
                                }}>
                                <strong>{PROVIDERS_LIST.find(p => p.id === conn.provider)?.name || conn.provider}</strong>
                                {hasWarning ? (
                                  <span className="warning-badge">Low Credits</span>
                                ) : (
                                  <span className="connected-badge">Connected</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Model selection */}
                      {(useExisting && selectedConnection) || detectedResult ? (
                        <div>
                          <p className="wizard-hint">Pick a model for your {selectedArchetype?.title || 'agent'}:</p>
                          <div className="model-grid">
                            {sortedModels.map(modelId => {
                              const info = AVAILABLE_MODELS.find(m => m.id === modelId);
                              const label = MODEL_FRIENDLY_LABELS[modelId];
                              const pricing = MODEL_PRICING[modelId];
                              const isRecommended = label?.tier === selectedArchetype?.modelTier;
                              return (
                                <div key={modelId}
                                  className={`model-card${model === modelId ? ' selected' : ''}${isRecommended ? ' recommended' : ''}`}
                                  onClick={() => setModel(modelId)}>
                                  <div className="model-card-top">
                                    <span className="model-card-name">{info?.name || modelId}</span>
                                    {label && (
                                      <span className="model-tier-badge" style={{ color: tierColor(label.tier), borderColor: tierColor(label.tier) }}>
                                        {tierLabel(label.tier)}
                                      </span>
                                    )}
                                  </div>
                                  <div className="model-card-tagline">{label?.tagline || ''}</div>
                                  {pricing && (
                                    <div className="model-card-price">
                                      ${(pricing.input * 1_000_000).toFixed(2)}/M in &middot; ${(pricing.output * 1_000_000).toFixed(2)}/M out
                                    </div>
                                  )}
                                  {isRecommended && <div className="model-recommended-tag">Recommended</div>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      {/* Add another provider */}
                      {!detectedResult && connectedProviders.length > 0 && (
                        <div style={{ marginTop: '16px' }}>
                          <div className="wizard-divider">-- or connect a new provider --</div>
                          <ApiKeyDetectInput
                            onDetected={handleDetected}
                            compact
                            placeholder="Paste any API key to add a provider"
                          />
                        </div>
                      )}
                    </>
                  )}

                  {loadingConnections && !hasProvider && (
                    <div className="wizard-hint" style={{ textAlign: 'center' }}>Loading providers...</div>
                  )}
                </div>
              )}

              {/* ── Step 3: Personalize ──────────────────────────── */}
              {step === 3 && (
                <div>
                  <div className="wizard-field">
                    <label className="wizard-label">Name your agent</label>
                    <input
                      type="text"
                      className="wizard-input"
                      value={agentName}
                      onChange={e => { setAgentName(e.target.value); setAgentNameError(''); }}
                      placeholder={selectedArchetype?.suggestedNames[Math.floor(Math.random() * selectedArchetype.suggestedNames.length)] || 'Agent name'}
                      maxLength={30}
                      autoFocus
                    />
                    {agentNameError && (
                      <p style={{ color: '#ff6b6b', fontSize: 12, margin: '6px 0 0' }}>{agentNameError}</p>
                    )}
                  </div>

                  <div className="wizard-field">
                    <label className="wizard-label">Pick Avatar</label>
                    <div className="sprite-picker">
                      {(['avatar1', 'avatar2', 'avatar3'] as const).map((key, i) => (
                        <button key={key}
                          type="button"
                          className={`sprite-option${avatar === key ? ' selected' : ''}`}
                          onClick={() => setAvatar(key)}>
                          <img
                            src={`/assets/avatar-0${i + 1}.png`}
                            alt={`Avatar ${i + 1}`}
                            width={72} height={72}
                            style={{ imageRendering: 'pixelated' }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Collapsible personality editor */}
                  <div className="wizard-field">
                    <button
                      type="button"
                      className="personality-toggle"
                      onClick={() => setShowPersonality(!showPersonality)}>
                      <ChevronDown
                        size={14}
                        style={{
                          transform: showPersonality ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s',
                        }}
                      />
                      <span>Edit personality</span>
                    </button>
                    {showPersonality && (
                      <textarea
                        className="wizard-input wizard-textarea personality-textarea"
                        value={systemPrompt}
                        onChange={e => setSystemPrompt(e.target.value)}
                        placeholder="Describe this agent's personality and approach..."
                        maxLength={2000}
                        rows={4}
                      />
                    )}
                  </div>

                  {/* Summary */}
                  <div className="wizard-summary">
                    <div className="wizard-summary-title">Summary</div>
                    <div className="wizard-summary-grid">
                      <div><span className="wizard-summary-label">Role: </span>
                        <span className="wizard-summary-value">{selectedArchetype?.icon} {selectedArchetype?.title}</span>
                      </div>
                      <div><span className="wizard-summary-label">Model: </span>
                        <span className="wizard-summary-value">{AVAILABLE_MODELS.find(m => m.id === model)?.name || model}</span>
                      </div>
                      <div><span className="wizard-summary-label">Agent: </span>
                        <span className="wizard-summary-value">{agentName || '(enter name above)'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="hire-wizard-nav">
              <div>
                {step > 1 && (
                  <button className="wizard-btn secondary" onClick={() => setStep((step - 1) as 1 | 2 | 3)}>
                    Back
                  </button>
                )}
              </div>
              <div>
                {step < 3 ? (
                  <button
                    className={`wizard-btn primary${!isStepValid ? ' disabled' : ''}`}
                    onClick={() => {
                      if (step === 1 && selectedArchetype) {
                        // Auto-select provider if only one
                        if (connections.length === 1 && !useExisting) {
                          setUseExisting(true);
                          setSelectedConnection(connections[0].id);
                        } else if (connections.length > 0 && !useExisting) {
                          setUseExisting(true);
                          setSelectedConnection(connections[0].id);
                        }
                      }
                      setStep((step + 1) as 1 | 2 | 3);
                    }}
                    disabled={!isStepValid || savingDetected}>
                    {savingDetected ? 'Saving...' : 'Next'}
                  </button>
                ) : (
                  <button
                    className={`wizard-btn confirm${!isStepValid ? ' disabled' : ''}`}
                    onClick={handleComplete}
                    disabled={!isStepValid}>
                    Hire Agent
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {/* ========== MANAGE MODE ========== */}
        {mode === 'manage' && (
          <div className="hire-wizard-body">
            {/* Providers Section */}
            <div className="manage-section">
              <h3 className="manage-section-title">AI Providers</h3>
              <p className="wizard-hint">API keys are encrypted at rest and never exposed.</p>

              {loadingConnections && (
                <div className="wizard-hint" style={{ textAlign: 'center' }}>Loading...</div>
              )}

              {!loadingConnections && connectedProviders.length === 0 && (
                <div className="manage-empty">No providers connected yet.</div>
              )}

              {connectedProviders.map(conn => {
                const hasWarning = !!providerWarnings[conn.provider];
                return (
                  <div key={conn.id} className="wizard-card" style={{ borderColor: hasWarning ? '#feca57' : '#1dd1a1' }}>
                    <div className="wizard-card-row">
                      <div>
                        <strong>{PROVIDERS_LIST.find(p => p.id === conn.provider)?.name || conn.provider}</strong>
                        {hasWarning ? (
                          <span className="warning-badge">Low Credits</span>
                        ) : (
                          <span className="connected-badge">Connected</span>
                        )}
                      </div>
                      <button
                        className="manage-disconnect-btn"
                        onClick={() => handleDisconnectClick(conn.id, conn.provider)}
                        disabled={disconnecting === conn.id}>
                        {disconnecting === conn.id ? '...' : 'Disconnect'}
                      </button>
                    </div>
                    <div className="wizard-card-sub">Key: {conn.apiKeyMasked}</div>
                    <div className="wizard-card-sub">
                      Models: {PROVIDERS_LIST.find(p => p.id === conn.provider)?.models
                        .map(m => AVAILABLE_MODELS.find(am => am.id === m)?.name || m).join(', ')}
                    </div>
                    {hasWarning && (
                      <div className="provider-warning-msg">
                        {providerWarnings[conn.provider]}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add new provider via auto-detect */}
              <div style={{ marginTop: '16px' }}>
                <label className="wizard-label">Add Provider:</label>
                <ApiKeyDetectInput
                  onDetected={handleManageDetected}
                  compact
                  placeholder="Paste any API key to add a provider"
                />
              </div>
            </div>

            {/* Desks Section */}
            <div className="manage-section">
              <h3 className="manage-section-title">Desks & Agents</h3>
              <p className="wizard-hint">{userDesks.length} desks active.</p>

              {userDesks.length === 0 && (
                <div className="manage-empty">No desks yet. Hire an agent to create your first desk.</div>
              )}

              {userDesks.map(desk => {
                const assignment = deskAssignments.find(a => a.deskId === desk.id);
                const modelInfo = assignment ? AVAILABLE_MODELS.find(m => m.id === assignment.modelId) : null;
                const isEditing = editingDeskId === desk.id;

                return (
                  <div key={desk.id} className="wizard-card">
                    {!isEditing ? (
                      /* ── View mode ── */
                      <div className="wizard-card-row">
                        <div>
                          <strong style={{ color: desk.color }}>{desk.label}</strong>
                          {assignment?.agentName && (
                            <span className="wizard-card-sub" style={{ marginLeft: '8px' }}>
                              {assignment.agentName}
                            </span>
                          )}
                          {modelInfo && (
                            <span className="wizard-card-sub" style={{ marginLeft: '8px' }}>
                              {modelInfo.name}
                            </span>
                          )}
                        </div>
                        <div className="manage-desk-actions">
                          <button className="manage-edit-btn" onClick={() => openEditForm(desk.id!)}>
                            Edit
                          </button>
                          <button className="manage-remove-btn" onClick={() => onDeskRemoved(desk.id!)}>
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── Edit mode ── */
                      <div className="desk-edit-form">
                        <div className="wizard-field">
                          <label className="wizard-label">Desk Name</label>
                          <input
                            type="text"
                            className="wizard-input"
                            value={editDeskName}
                            onChange={e => { setEditDeskName(e.target.value); setEditNameError(''); }}
                            placeholder="Desk name"
                            maxLength={24}
                            autoFocus
                          />
                        </div>

                        <div className="wizard-field">
                          <label className="wizard-label">Agent Name</label>
                          <input
                            type="text"
                            className="wizard-input"
                            value={editAgentName}
                            onChange={e => { setEditAgentName(e.target.value); setEditNameError(''); }}
                            placeholder="Agent name"
                            maxLength={30}
                          />
                          {editNameError && (
                            <p style={{ color: '#ff6b6b', fontSize: 12, margin: '6px 0 0' }}>{editNameError}</p>
                          )}
                        </div>

                        <div className="wizard-field">
                          <label className="wizard-label">Avatar</label>
                          <div className="sprite-picker compact">
                            {(['avatar1', 'avatar2', 'avatar3'] as const).map((key, i) => (
                              <button
                                key={key}
                                type="button"
                                className={`sprite-option${editAvatar === key ? ' selected' : ''}`}
                                onClick={() => setEditAvatar(key)}>
                                <img
                                  src={`/assets/avatar-0${i + 1}.png`}
                                  alt={`Avatar ${i + 1}`}
                                  width={48} height={48}
                                  style={{ imageRendering: 'pixelated' }}
                                />
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="wizard-field">
                          <label className="wizard-label">Model</label>
                          <select
                            className="wizard-input"
                            value={editModel}
                            onChange={e => setEditModel(e.target.value)}>
                            {allConnectedModels.map(m => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        </div>

                        <div className="wizard-field">
                          <label className="wizard-label">Desk Style</label>
                          <div className="desk-picker compact">
                            {DESK_OPTIONS.map(opt => (
                              <button
                                key={opt.key}
                                type="button"
                                className={`desk-option${editDeskType === opt.key ? ' selected' : ''}`}
                                onClick={() => setEditDeskType(opt.key)}>
                                <img
                                  src={opt.asset}
                                  alt={opt.label}
                                  style={{ imageRendering: 'pixelated', width: '100%', height: 'auto' }}
                                />
                                <span className="desk-option-label">{opt.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="desk-edit-actions">
                          <button className="wizard-btn secondary" onClick={() => setEditingDeskId(null)}>
                            Cancel
                          </button>
                          <button className="wizard-btn primary" onClick={saveEdit}>
                            Save Changes
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Disconnect Confirmation Dialog */}
            {disconnectConfirm && (
              <div className="disconnect-confirm-overlay">
                <div className="disconnect-confirm-dialog">
                  <h3>Disconnect {disconnectConfirm.providerName}?</h3>

                  {disconnectConfirm.affectedDesks.length > 0 ? (
                    <>
                      <p className="disconnect-warning">
                        This will also remove {disconnectConfirm.affectedDesks.length} desk{disconnectConfirm.affectedDesks.length > 1 ? 's' : ''} and
                        all associated agents, chat history, and desk-specific rules:
                      </p>
                      <ul className="disconnect-affected-list">
                        {disconnectConfirm.affectedDesks.map(d => (
                          <li key={d.deskId}>
                            <strong>{d.label}</strong>
                            <span className="disconnect-affected-model">{d.modelName}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="disconnect-info">No desks are using models from this provider.</p>
                  )}

                  <div className="disconnect-confirm-actions">
                    <button className="wizard-btn secondary" onClick={() => setDisconnectConfirm(null)}>
                      Cancel
                    </button>
                    <button className="wizard-btn danger" onClick={confirmDisconnect}>
                      {disconnectConfirm.affectedDesks.length > 0 ? 'Disconnect & Remove Desks' : 'Disconnect'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        </form>
      </div>
    </div>
  );
};

export default HireWizard;
