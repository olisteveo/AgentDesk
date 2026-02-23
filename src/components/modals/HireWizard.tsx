import React, { useState, useMemo } from 'react';
import { AVAILABLE_MODELS, MODEL_PRICING, PROVIDERS_LIST } from '../../utils/constants';
import type { Connection, Zone } from '../../types';
import './HireWizard.css';

interface HireWizardProps {
  connections: Connection[];
  desks: Zone[];
  deskAssignments: { deskId: string; modelId: string; customName?: string }[];
  onComplete: (data: {
    model: string;
    agentName: string;
    avatar: 'avatar1' | 'avatar2' | 'avatar3';
    deskName: string;
  }) => void;
  onClose: () => void;
  onConnectionCreated: (conn: Connection) => void;
  onConnectionRemoved: (providerId: string) => void;
  onDeskRemoved: (deskId: string) => void;
}

type Mode = 'hire' | 'manage';

const HireWizard: React.FC<HireWizardProps> = ({
  connections,
  desks,
  deskAssignments,
  onComplete,
  onClose,
  onConnectionCreated,
  onConnectionRemoved,
  onDeskRemoved,
}) => {
  const [mode, setMode] = useState<Mode>('hire');
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1
  const [provider, setProvider] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [useExisting, setUseExisting] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState('');

  // Step 2
  const [model, setModel] = useState('');

  // Step 3
  const [agentName, setAgentName] = useState('');
  const [avatar, setAvatar] = useState<'avatar1' | 'avatar2' | 'avatar3'>('avatar1');

  // Step 4
  const [deskName, setDeskName] = useState('');

  // Manage tab: new provider connection
  const [manageProvider, setManageProvider] = useState('');
  const [manageApiKey, setManageApiKey] = useState('');

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
    if (!useExisting && apiKey && provider) {
      const providerData = PROVIDERS_LIST.find(p => p.id === provider);
      if (providerData) {
        onConnectionCreated({
          id: Date.now().toString(),
          provider: providerData.id as Connection['provider'],
          name: providerData.name,
          isConnected: true,
          apiKeyMasked: apiKey.slice(0, 8) + '...' + apiKey.slice(-4),
          models: providerData.models,
          addedAt: new Date(),
        });
      }
    }
    onComplete({ model, agentName, avatar, deskName });
  };

  const handleManageConnect = () => {
    if (!manageApiKey || !manageProvider) return;
    const providerData = PROVIDERS_LIST.find(p => p.id === manageProvider);
    if (providerData) {
      onConnectionCreated({
        id: Date.now().toString(),
        provider: providerData.id as Connection['provider'],
        name: providerData.name,
        isConnected: true,
        apiKeyMasked: manageApiKey.slice(0, 8) + '...' + manageApiKey.slice(-4),
        models: providerData.models,
        addedAt: new Date(),
      });
      setManageApiKey('');
      setManageProvider('');
    }
  };

  const nextDeskNum = desks.filter(d => d.id?.startsWith('desk')).length + 1;

  const providerModels = useMemo(() => {
    if (useExisting) {
      return connections.find(c => c.id === selectedConnection)?.models || [];
    }
    return PROVIDERS_LIST.find(p => p.id === provider)?.models || [];
  }, [useExisting, selectedConnection, provider, connections]);

  const connectedProviders = connections.filter(c => c.isConnected);
  const unconnectedProviders = PROVIDERS_LIST.filter(
    p => !connections.find(c => c.provider === p.id && c.isConnected)
  );
  const userDesks = desks.filter(d => d.id?.startsWith('desk'));

  return (
    <div className="hire-wizard-overlay" onClick={onClose}>
      <div className="hire-wizard" onClick={e => e.stopPropagation()}>
        <div className="hire-wizard-header">
          <h2>{mode === 'hire' ? 'Hire Agent' : 'Manage'}</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
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
                  {connectedProviders.length > 0 && (
                    <div className="wizard-section">
                      <label className="wizard-label">Use existing connection:</label>
                      {connectedProviders.map(conn => (
                        <div key={conn.id}
                          className={`wizard-card${useExisting && selectedConnection === conn.id ? ' selected' : ''}`}
                          onClick={() => {
                            setUseExisting(true);
                            setSelectedConnection(conn.id);
                            setProvider(conn.provider);
                            setApiKey('');
                          }}>
                          <strong>{conn.name}</strong>
                          <span className="connected-badge">● Connected</span>
                          <div className="wizard-card-sub">{conn.apiKeyMasked}</div>
                        </div>
                      ))}
                      <div className="wizard-divider">— or add a new provider —</div>
                    </div>
                  )}

                  {unconnectedProviders.map(p => (
                    <div key={p.id}
                      className={`wizard-card${!useExisting && provider === p.id ? ' selected' : ''}`}
                      onClick={() => {
                        setUseExisting(false);
                        setSelectedConnection('');
                        setProvider(p.id);
                      }}>
                      <strong>{p.name}</strong>
                      <div className="wizard-card-sub">
                        Models: {p.models.map(m => AVAILABLE_MODELS.find(am => am.id === m)?.name || m).join(', ')}
                      </div>
                    </div>
                  ))}

                  {provider && !useExisting && (
                    <div className="wizard-api-key">
                      <input
                        type="password"
                        placeholder="Enter API Key..."
                        value={apiKey}
                        onChange={e => setApiKey(e.target.value)}
                        className="wizard-input"
                        autoFocus
                      />
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
                              ${(pricing.input * 1000).toFixed(3)}/1K in · ${(pricing.output * 1000).toFixed(3)}/1K out
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

              {/* Step 4: Desk Name + Summary */}
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
                {step < 4 ? (
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
              <p className="wizard-hint">API keys are encrypted and never shared.</p>

              {connectedProviders.length === 0 && unconnectedProviders.length === PROVIDERS_LIST.length && (
                <div className="manage-empty">No providers connected. Use the "Hire Agent" tab to get started.</div>
              )}

              {connectedProviders.map(conn => (
                <div key={conn.id} className="wizard-card" style={{ borderColor: '#1dd1a1' }}>
                  <div className="wizard-card-row">
                    <div>
                      <strong>{conn.name}</strong>
                      <span className="connected-badge">● Connected</span>
                    </div>
                    <button className="manage-disconnect-btn" onClick={() => onConnectionRemoved(conn.provider)}>
                      Disconnect
                    </button>
                  </div>
                  <div className="wizard-card-sub">Key: {conn.apiKeyMasked}</div>
                  <div className="wizard-card-sub">Models: {conn.models.map(m => AVAILABLE_MODELS.find(am => am.id === m)?.name || m).join(', ')}</div>
                </div>
              ))}

              {/* Add new provider inline */}
              {unconnectedProviders.length > 0 && (
                <div className="manage-add-provider">
                  <label className="wizard-label" style={{ marginTop: '16px' }}>Add Provider:</label>
                  <div className="manage-provider-row">
                    <select
                      className="wizard-input"
                      value={manageProvider}
                      onChange={e => setManageProvider(e.target.value)}
                      style={{ flex: 1 }}>
                      <option value="">Select provider...</option>
                      {unconnectedProviders.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  {manageProvider && (
                    <div className="manage-provider-row" style={{ marginTop: '8px' }}>
                      <input
                        type="password"
                        className="wizard-input"
                        placeholder="Enter API Key..."
                        value={manageApiKey}
                        onChange={e => setManageApiKey(e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <button
                        className="wizard-btn primary"
                        onClick={handleManageConnect}
                        disabled={!manageApiKey}
                        style={{ marginLeft: '8px', flexShrink: 0 }}>
                        Connect
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Desks Section */}
            <div className="manage-section">
              <h3 className="manage-section-title">Desks & Agents</h3>
              <p className="wizard-hint">{userDesks.length}/6 desks used.</p>

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
      </div>
    </div>
  );
};

export default HireWizard;
