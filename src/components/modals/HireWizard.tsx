import React, { useState, useMemo, useEffect } from 'react';
import { AVAILABLE_MODELS, MODEL_PRICING, PROVIDERS_LIST } from '../../utils/constants';
import {
  listProviders,
  validateKey,
  connectProvider,
  disconnectProvider,
  testProvider,
  type ProviderConnection,
} from '../../api/providers';
import type { Zone } from '../../types';
import './HireWizard.css';

type DeskType = 'mini' | 'standard' | 'power';

const DESK_OPTIONS: { key: DeskType; label: string; asset: string }[] = [
  { key: 'mini',     label: 'Starter',  asset: '/assets/desk-mini.png' },
  { key: 'standard', label: 'Standard', asset: '/assets/desk-standard.png' },
  { key: 'power',    label: 'Executive', asset: '/assets/desk-boss.png' },
];

interface HireWizardProps {
  desks: Zone[];
  deskAssignments: { deskId: string; modelId: string; customName?: string }[];
  onComplete: (data: {
    model: string;
    agentName: string;
    avatar: 'avatar1' | 'avatar2' | 'avatar3';
    deskName: string;
    deskType: DeskType;
  }) => void;
  onClose: () => void;
  onDeskRemoved: (deskId: string) => void;
}

type Mode = 'hire' | 'manage';

const HireWizard: React.FC<HireWizardProps> = ({
  desks,
  deskAssignments,
  onComplete,
  onClose,
  onDeskRemoved,
}) => {
  const [mode, setMode] = useState<Mode>('hire');
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Provider connections from backend
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(true);

  // Step 1
  const [provider, setProvider] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [useExisting, setUseExisting] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState('');
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState<boolean | null>(null);
  const [validationError, setValidationError] = useState('');
  const [validationWarning, setValidationWarning] = useState('');
  const [saving, setSaving] = useState(false);

  // Step 2
  const [model, setModel] = useState('');

  // Step 3
  const [agentName, setAgentName] = useState('');
  const [avatar, setAvatar] = useState<'avatar1' | 'avatar2' | 'avatar3'>('avatar1');

  // Step 4
  const [deskName, setDeskName] = useState('');
  const [deskType, setDeskType] = useState<DeskType>('mini');

  // Manage tab state
  const [manageProvider, setManageProvider] = useState('');
  const [manageApiKey, setManageApiKey] = useState('');
  const [manageValidating, setManageValidating] = useState(false);
  const [manageValidated, setManageValidated] = useState<boolean | null>(null);
  const [manageError, setManageError] = useState('');
  const [manageWarning, setManageWarning] = useState('');
  const [manageSaving, setManageSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  // Track provider warnings persistently (provider -> warning message)
  const [providerWarnings, setProviderWarnings] = useState<Record<string, string>>({});

  // Load connections from backend on mount
  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    setLoadingConnections(true);
    try {
      const result = await listProviders();
      const active = result.filter(c => c.isConnected);
      setConnections(active);

      // Test each connection in the background to detect billing warnings
      // This ensures yellow "Low Credits" badges show up even after page reload
      for (const conn of active) {
        testProvider(conn.id)
          .then(testResult => {
            if (testResult.warning) {
              setProviderWarnings(prev => ({ ...prev, [conn.provider]: testResult.warning! }));
            }
          })
          .catch(() => { /* ignore test failures */ });
      }
    } catch {
      // Silently fail — user will see empty connections
    } finally {
      setLoadingConnections(false);
    }
  };

  // Validate + save key flow for hire mode step 1
  const handleValidateAndSave = async () => {
    if (!provider || !apiKey) return;

    setValidating(true);
    setValidated(null);
    setValidationError('');
    setValidationWarning('');

    try {
      const result = await validateKey(provider, apiKey);
      if (result.valid) {
        setValidated(true);
        if (result.warning) {
          setValidationWarning(result.warning);
          setProviderWarnings(prev => ({ ...prev, [provider]: result.warning! }));
        }
        // Key is valid -- save to backend
        setSaving(true);
        const saved = await connectProvider(provider, apiKey);
        setConnections(prev => {
          const filtered = prev.filter(c => c.provider !== provider);
          return [...filtered, saved];
        });
        setUseExisting(true);
        setSelectedConnection(saved.id);
        setApiKey('');
        setSaving(false);
      } else {
        setValidated(false);
        setValidationError(result.error || 'Invalid API key');
      }
    } catch (err) {
      setValidated(false);
      setValidationError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setValidating(false);
    }
  };

  // Validate + save for manage tab
  const handleManageConnect = async () => {
    if (!manageApiKey || !manageProvider) return;

    setManageValidating(true);
    setManageValidated(null);
    setManageError('');
    setManageWarning('');

    try {
      const result = await validateKey(manageProvider, manageApiKey);
      if (result.valid) {
        setManageValidated(true);
        if (result.warning) {
          setManageWarning(result.warning);
          setProviderWarnings(prev => ({ ...prev, [manageProvider]: result.warning! }));
        }
        setManageSaving(true);
        const saved = await connectProvider(manageProvider, manageApiKey);
        setConnections(prev => {
          const filtered = prev.filter(c => c.provider !== manageProvider);
          return [...filtered, saved];
        });
        setManageApiKey('');
        setManageSaving(false);
        // Keep validation visible for 3 seconds so user sees the result
        setTimeout(() => {
          setManageValidated(null);
          setManageWarning('');
          setManageProvider('');
        }, 3000);
      } else {
        setManageValidated(false);
        setManageError(result.error || 'Invalid API key');
      }
    } catch (err) {
      setManageValidated(false);
      setManageError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setManageValidating(false);
    }
  };

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

  const isStepValid = useMemo(() => {
    switch (step) {
      case 1:
        return useExisting ? !!selectedConnection : (!!provider && !!apiKey);
      case 2:
        return !!model;
      case 3:
        return !!agentName.trim();
      case 4:
        return true;
      default:
        return false;
    }
  }, [step, useExisting, selectedConnection, provider, apiKey, model, agentName]);

  const handleComplete = () => {
    onComplete({ model, agentName, avatar, deskName, deskType });
  };

  const nextDeskNum = desks.filter(d => d.id?.startsWith('desk')).length + 1;

  const providerModels = useMemo(() => {
    const provId = useExisting
      ? connections.find(c => c.id === selectedConnection)?.provider
      : provider;
    return PROVIDERS_LIST.find(p => p.id === provId)?.models || [];
  }, [useExisting, selectedConnection, provider, connections]);

  const connectedProviders = connections;
  const connectedProviderIds = new Set(connections.map(c => c.provider));
  const unconnectedProviders = PROVIDERS_LIST.filter(
    p => !connectedProviderIds.has(p.id)
  );
  const userDesks = desks.filter(d => d.id?.startsWith('desk'));

  const handleNextFromStep1 = () => {
    if (useExisting && selectedConnection) {
      setStep(2);
    } else if (validated === true) {
      // Already validated and saved -- move on
      setStep(2);
    } else if (provider && apiKey) {
      // New key -- validate + save first, user clicks Next again after
      handleValidateAndSave();
    }
  };

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
              {/* Step 1: Provider + API Key */}
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
                              setProvider(conn.provider);
                              setApiKey('');
                              setValidated(null);
                              setValidationError('');
                              setValidationWarning('');
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
                      <div className="wizard-divider">-- or add a new provider --</div>
                    </div>
                  )}

                  {unconnectedProviders.map(p => (
                    <div key={p.id}
                      className={`wizard-card${!useExisting && provider === p.id ? ' selected' : ''}`}
                      onClick={() => {
                        setUseExisting(false);
                        setSelectedConnection('');
                        setProvider(p.id);
                        setValidated(null);
                        setValidationError('');
                      }}>
                      <strong>{p.name}</strong>
                      <div className="wizard-card-sub">
                        Models: {p.models.map(m => AVAILABLE_MODELS.find(am => am.id === m)?.name || m).join(', ')}
                      </div>
                    </div>
                  ))}

                  {provider && !useExisting && (
                    <div className="wizard-api-key">
                      {/* Hidden dummy field prevents Chrome password manager popup */}
                      <input type="text" name="prevent-autofill" autoComplete="off" style={{ display: 'none' }} tabIndex={-1} />
                      <input
                        type="password"
                        placeholder="Enter API Key..."
                        value={apiKey}
                        onChange={e => {
                          setApiKey(e.target.value);
                          setValidated(null);
                          setValidationError('');
                          setValidationWarning('');
                        }}
                        className="wizard-input"
                        autoComplete="new-password"
                        data-1p-ignore="true"
                        data-lpignore="true"
                        autoFocus
                      />
                      {validated === true && !validationWarning && (
                        <div className="validation-status validation-success">
                          Key validated and saved securely.
                        </div>
                      )}
                      {validated === true && validationWarning && (
                        <div className="validation-status validation-warning">
                          Key saved -- but: {validationWarning}
                        </div>
                      )}
                      {validated === false && (
                        <div className="validation-status validation-error">
                          {validationError}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Model Selection */}
              {step === 2 && (
                <div>
                  <p className="wizard-hint">Choose an AI model for this desk:</p>
                  {providerModels.map(modelId => {
                    const info = AVAILABLE_MODELS.find(m => m.id === modelId);
                    const pricing = MODEL_PRICING[modelId];
                    return (
                      <div key={modelId}
                        className={`wizard-card${model === modelId ? ' selected' : ''}`}
                        onClick={() => setModel(modelId)}>
                        <div className="wizard-card-row">
                          <strong>{info?.name || modelId}</strong>
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
                        <span className="wizard-summary-value">{PROVIDERS_LIST.find(p => p.id === provider)?.name || provider}</span>
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
                    className={`wizard-btn ${validated === true && !useExisting ? 'confirm' : 'primary'}${!isStepValid && validated !== true ? ' disabled' : ''}`}
                    onClick={handleNextFromStep1}
                    disabled={(!isStepValid && validated !== true) || validating || saving}>
                    {validating ? 'Validating...' : saving ? 'Saving...' : validated === true && !useExisting ? 'Next' : useExisting ? 'Next' : 'Validate & Save'}
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
                <div className="manage-empty">No providers connected. Use the "Hire Agent" tab to get started.</div>
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
                        onClick={() => handleDisconnect(conn.id)}
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

              {/* Add new provider inline */}
              {unconnectedProviders.length > 0 && (
                <div className="manage-add-provider">
                  <label className="wizard-label" style={{ marginTop: '16px' }}>Add Provider:</label>
                  <div className="manage-provider-row">
                    <select
                      className="wizard-input"
                      value={manageProvider}
                      onChange={e => {
                        setManageProvider(e.target.value);
                        setManageValidated(null);
                        setManageError('');
                      }}
                      style={{ flex: 1 }}>
                      <option value="">Select provider...</option>
                      {unconnectedProviders.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  {manageProvider && (
                    <>
                      <div className="manage-provider-row" style={{ marginTop: '8px' }}>
                        <input type="text" name="prevent-autofill-manage" autoComplete="off" style={{ display: 'none' }} tabIndex={-1} />
                        <input
                          type="password"
                          className="wizard-input"
                          placeholder="Enter API Key..."
                          value={manageApiKey}
                          onChange={e => {
                            setManageApiKey(e.target.value);
                            setManageValidated(null);
                            setManageError('');
                          }}
                          autoComplete="new-password"
                          data-1p-ignore="true"
                          data-lpignore="true"
                          style={{ flex: 1 }}
                        />
                        <button
                          className="wizard-btn primary"
                          onClick={handleManageConnect}
                          disabled={!manageApiKey || manageValidating || manageSaving}
                          style={{ marginLeft: '8px', flexShrink: 0 }}>
                          {manageValidating ? 'Validating...' : manageSaving ? 'Saving...' : 'Connect'}
                        </button>
                      </div>
                      {manageValidated === true && !manageWarning && (
                        <div className="validation-status validation-success">
                          Connected successfully.
                        </div>
                      )}
                      {manageValidated === true && manageWarning && (
                        <div className="validation-status validation-warning">
                          Connected -- but: {manageWarning}
                        </div>
                      )}
                      {manageValidated === false && (
                        <div className="validation-status validation-error">
                          {manageError}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
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
                return (
                  <div key={desk.id} className="wizard-card">
                    <div className="wizard-card-row">
                      <div>
                        <strong style={{ color: desk.color }}>{desk.label}</strong>
                        {modelInfo && (
                          <span className="wizard-card-sub" style={{ marginLeft: '10px' }}>
                            {modelInfo.name}
                          </span>
                        )}
                      </div>
                      <button className="manage-remove-btn" onClick={() => onDeskRemoved(desk.id!)}>
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </form>
      </div>
    </div>
  );
};

export default HireWizard;
