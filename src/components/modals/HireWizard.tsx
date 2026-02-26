import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { AVAILABLE_MODELS, MODEL_PRICING, PROVIDERS_LIST } from '../../utils/constants';
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
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Provider connections from backend
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(true);

  // Step 1 — provider selection (existing connection or auto-detect)
  const [useExisting, setUseExisting] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState('');
  const [detectedResult, setDetectedResult] = useState<DetectedProvider | null>(null);
  const [detectedModels, setDetectedModels] = useState<ProviderModel[]>([]);
  const [savingDetected, setSavingDetected] = useState(false);

  // Step 2
  const [model, setModel] = useState('');

  // Step 3
  const [agentName, setAgentName] = useState('');
  const [avatar, setAvatar] = useState<'avatar1' | 'avatar2' | 'avatar3'>('avatar1');

  // Step 4
  const [deskName, setDeskName] = useState('');
  const [deskType, setDeskType] = useState<DeskType>('mini');

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
  const [editAvatar, setEditAvatar] = useState<'avatar1' | 'avatar2' | 'avatar3'>('avatar1');
  const [editModel, setEditModel] = useState('');
  const [editDeskType, setEditDeskType] = useState<DeskType>('mini');

  // Track provider warnings persistently (provider -> warning message)
  const [providerWarnings, setProviderWarnings] = useState<Record<string, string>>({});

  // Load connections from backend on mount
  useEffect(() => {
    loadConnections();
  }, []);

  // Handle pre-loaded provider from onboarding — auto-save and skip to Step 2
  useEffect(() => {
    if (!preloadedProvider) return;

    const bootstrap = async () => {
      setDetectedResult(preloadedProvider);
      setDetectedModels(preloadedProvider.models);
      if (preloadedProvider.warning) {
        setProviderWarnings(prev => ({ ...prev, [preloadedProvider.provider]: preloadedProvider.warning! }));
      }

      // Save connection (may already exist from onboarding, connectProvider is idempotent)
      try {
        const saved = await connectProvider(preloadedProvider.provider, preloadedProvider.apiKey, preloadedProvider.warning);
        setConnections(prev => {
          const filtered = prev.filter(c => c.provider !== preloadedProvider.provider);
          return [...filtered, saved];
        });
        setUseExisting(true);
        setSelectedConnection(saved.id);
      } catch {
        // Still advance — user can pick from existing connections if save fails
      }

      // Jump to Step 2 (model selection)
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

      // Load persisted warnings from the database
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
      // Silently fail — user will see empty connections
    } finally {
      setLoadingConnections(false);
    }
  };

  // Auto-detect callback: save to backend (user must press Next to advance)
  const handleDetected = useCallback(async (result: DetectedProvider) => {
    setDetectedResult(result);
    setDetectedModels(result.models);

    if (result.warning) {
      setProviderWarnings(prev => ({ ...prev, [result.provider]: result.warning! }));
    }

    // Save to backend immediately
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
      // Connection saved in detect, just couldn't persist — user can retry
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

  // ── Disconnect with cascade confirmation ──────────────────
  const handleDisconnectClick = (credId: string, providerId: string) => {
    const provInfo = PROVIDERS_LIST.find(p => p.id === providerId);
    const providerModelIds = new Set(provInfo?.models || []);

    // Find all desks whose primary model belongs to this provider
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

    // 1. Notify parent to cascade-delete affected desks
    if (affectedDesks.length > 0) {
      onProviderDisconnected(providerId, affectedDesks.map(d => d.deskId));
    }

    // 2. Soft-delete the provider credential
    await handleDisconnect(credId);

    // 3. Close confirmation
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
    onDeskEdited(editingDeskId, {
      deskName: editDeskName || undefined,
      agentName: editAgentName || undefined,
      avatar: editAvatar,
      modelId: editModel || undefined,
      deskType: editDeskType,
    });
    setEditingDeskId(null);
  };

  // All models from connected providers (for edit form dropdown)
  const allConnectedModels = useMemo(() => {
    const connectedProviderIds = connections.map(c => c.provider);
    return AVAILABLE_MODELS.filter(m =>
      connectedProviderIds.includes(m.provider)
    );
  }, [connections]);

  const isStepValid = useMemo(() => {
    switch (step) {
      case 1:
        return useExisting ? !!selectedConnection : !!detectedResult?.provider;
      case 2:
        return !!model;
      case 3:
        return !!agentName.trim();
      case 4:
        return true;
      default:
        return false;
    }
  }, [step, useExisting, selectedConnection, detectedResult, model, agentName]);

  const handleComplete = () => {
    onComplete({ model, agentName, avatar, deskName, deskType });
  };

  const nextDeskNum = desks.filter(d => d.id?.startsWith('desk')).length + 1;

  // Models for Step 2: use detected models if auto-detect was used, otherwise use static list
  const providerModels = useMemo(() => {
    if (detectedModels.length > 0 && !useExisting) {
      return detectedModels.map(m => m.id);
    }
    const provId = useExisting
      ? connections.find(c => c.id === selectedConnection)?.provider
      : detectedResult?.provider;
    return PROVIDERS_LIST.find(p => p.id === provId)?.models || [];
  }, [useExisting, selectedConnection, detectedResult, detectedModels, connections]);

  const connectedProviders = connections;
  const userDesks = desks.filter(d => d.id?.startsWith('desk'));

  // Resolve provider name for summary
  const resolvedProviderName = useMemo(() => {
    if (useExisting) {
      const conn = connections.find(c => c.id === selectedConnection);
      return PROVIDERS_LIST.find(p => p.id === conn?.provider)?.name || conn?.provider || '';
    }
    return PROVIDERS_LIST.find(p => p.id === detectedResult?.provider)?.name || detectedResult?.provider || '';
  }, [useExisting, selectedConnection, connections, detectedResult]);

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
              {[1, 2, 3, 4].map(s => (
                <div key={s} className={`progress-step${s <= step ? ' active' : ''}`} />
              ))}
            </div>

            <div className="hire-wizard-step-label">
              Step {step} of 4: {
                step === 1 ? 'Connect Provider' :
                step === 2 ? 'Select Model' :
                step === 3 ? 'Name & Avatar' : 'Name Desk'
              }
            </div>

            <div className="hire-wizard-body">
              {/* Step 1: Provider — existing connection or auto-detect */}
              {step === 1 && (
                <div>
                  {loadingConnections && (
                    <div className="wizard-hint" style={{ textAlign: 'center' }}>Loading providers...</div>
                  )}

                  {connectedProviders.length > 0 && (
                    <div className="wizard-section">
                      <label className="wizard-label">Use existing connection:</label>
                      {connectedProviders.map(conn => {
                        const hasWarning = !!providerWarnings[conn.provider];
                        return (
                          <div key={conn.id}
                            className={`wizard-card${useExisting && selectedConnection === conn.id ? ' selected' : ''}`}
                            onClick={() => {
                              setUseExisting(true);
                              setSelectedConnection(conn.id);
                              setDetectedResult(null);
                              setDetectedModels([]);
                            }}>
                            <strong>{PROVIDERS_LIST.find(p => p.id === conn.provider)?.name || conn.provider}</strong>
                            {hasWarning ? (
                              <span className="warning-badge">Low Credits</span>
                            ) : (
                              <span className="connected-badge">Connected</span>
                            )}
                            <div className="wizard-card-sub">{conn.apiKeyMasked}</div>
                            {hasWarning && (
                              <div className="provider-warning-msg">
                                {providerWarnings[conn.provider]}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div className="wizard-divider">-- or connect a new provider --</div>
                    </div>
                  )}

                  {/* Auto-detect key input */}
                  <div style={{ marginTop: connectedProviders.length > 0 ? '8px' : '0' }}>
                    <ApiKeyDetectInput
                      onDetected={handleDetected}
                      showHints={connectedProviders.length === 0}
                      placeholder="Paste any API key — we'll detect the provider"
                    />
                    {savingDetected && (
                      <div className="wizard-hint" style={{ textAlign: 'center', marginTop: '8px' }}>
                        Saving connection...
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 2: Model Selection */}
              {step === 2 && (
                <div>
                  <p className="wizard-hint">Choose an AI model for this desk:</p>
                  {providerModels.map(modelId => {
                    const info = AVAILABLE_MODELS.find(m => m.id === modelId);
                    // Check detected models for friendly name if not in AVAILABLE_MODELS
                    const detectedName = detectedModels.find(m => m.id === modelId)?.name;
                    const pricing = MODEL_PRICING[modelId];
                    return (
                      <div key={modelId}
                        className={`wizard-card${model === modelId ? ' selected' : ''}`}
                        onClick={() => setModel(modelId)}>
                        <div className="wizard-card-row">
                          <strong>{info?.name || detectedName || modelId}</strong>
                          {pricing && (
                            <span className="wizard-card-price">
                              ${(pricing.input * 1000).toFixed(3)}/1K in | ${(pricing.output * 1000).toFixed(3)}/1K out
                            </span>
                          )}
                        </div>
                        {info && <div className="wizard-card-provider" style={{ color: info.color }}>{info.provider}</div>}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Step 3: Agent Name + Avatar */}
              {step === 3 && (
                <div>
                  <div className="wizard-field">
                    <label className="wizard-label">Agent Name</label>
                    <input
                      type="text"
                      className="wizard-input"
                      value={agentName}
                      onChange={e => setAgentName(e.target.value)}
                      placeholder="e.g., Research Bot, Code Helper"
                      maxLength={24}
                      autoFocus
                    />
                  </div>
                  <div className="wizard-field">
                    <label className="wizard-label">Pick Avatar</label>
                    <div className="sprite-picker">
                      {(['avatar1', 'avatar2', 'avatar3'] as const).map((key, i) => (
                        <button key={key}
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
                </div>
              )}

              {/* Step 4: Desk Name + Desk Style + Summary */}
              {step === 4 && (
                <div>
                  <div className="wizard-field">
                    <label className="wizard-label">Desk Name</label>
                    <input
                      type="text"
                      className="wizard-input"
                      value={deskName}
                      onChange={e => setDeskName(e.target.value)}
                      placeholder="e.g., Research Desk, Code Lab"
                      maxLength={24}
                      autoFocus
                    />
                  </div>
                  <div className="wizard-field">
                    <label className="wizard-label">Pick Desk Style</label>
                    <div className="desk-picker">
                      {DESK_OPTIONS.map(opt => (
                        <button key={opt.key}
                          type="button"
                          className={`desk-option${deskType === opt.key ? ' selected' : ''}`}
                          onClick={() => setDeskType(opt.key)}>
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

                  <div className="wizard-summary">
                    <div className="wizard-summary-title">Summary</div>
                    <div className="wizard-summary-grid">
                      <div><span className="wizard-summary-label">Provider: </span>
                        <span className="wizard-summary-value">{resolvedProviderName}</span>
                      </div>
                      <div><span className="wizard-summary-label">Model: </span>
                        <span className="wizard-summary-value">{AVAILABLE_MODELS.find(m => m.id === model)?.name || model}</span>
                      </div>
                      <div><span className="wizard-summary-label">Agent: </span>
                        <span className="wizard-summary-value">{agentName}</span>
                      </div>
                      <div><span className="wizard-summary-label">Desk: </span>
                        <span className="wizard-summary-value">{deskName || `Desk ${nextDeskNum}`}</span>
                      </div>
                      <div><span className="wizard-summary-label">Style: </span>
                        <span className="wizard-summary-value">{DESK_OPTIONS.find(o => o.key === deskType)?.label || 'Starter'}</span>
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
                  <button className="wizard-btn secondary" onClick={() => setStep((step - 1) as 1 | 2 | 3 | 4)}>
                    Back
                  </button>
                )}
              </div>
              <div>
                {step === 1 ? (
                  <button
                    className={`wizard-btn primary${!isStepValid ? ' disabled' : ''}`}
                    onClick={() => setStep(2)}
                    disabled={!isStepValid || savingDetected}>
                    {savingDetected ? 'Saving...' : 'Next'}
                  </button>
                ) : step < 4 ? (
                  <button
                    className={`wizard-btn primary${!isStepValid ? ' disabled' : ''}`}
                    onClick={() => setStep((step + 1) as 1 | 2 | 3 | 4)}
                    disabled={!isStepValid}>
                    Next
                  </button>
                ) : (
                  <button className="wizard-btn confirm" onClick={handleComplete}>
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
                            onChange={e => setEditDeskName(e.target.value)}
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
                            onChange={e => setEditAgentName(e.target.value)}
                            placeholder="Agent name"
                            maxLength={24}
                          />
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
