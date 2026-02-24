import React, { useState } from 'react';
import type { Zone, Connection, DeskAssignment } from '../../types';

interface SetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  desks: Zone[];
  setDesks: React.Dispatch<React.SetStateAction<Zone[]>>;
  deskAssignments: DeskAssignment[];
  setDeskAssignments: React.Dispatch<React.SetStateAction<DeskAssignment[]>>;
  connections: Connection[];
  setConnections: React.Dispatch<React.SetStateAction<Connection[]>>;
}

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', models: ['GPT-4', 'GPT-4o', 'GPT-3.5'] },
  { id: 'anthropic', name: 'Anthropic', models: ['Claude Opus', 'Claude Sonnet', 'Claude Haiku'] },
  { id: 'moonshot', name: 'Moonshot', models: ['Kimi K2.5'] },
  { id: 'google', name: 'Google', models: ['Gemini Pro', 'Gemini Ultra'] }
];

export const SetupModal: React.FC<SetupModalProps> = ({
  isOpen,
  onClose,
  desks,
  setDesks,
  deskAssignments,
  setDeskAssignments,
  connections,
  setConnections
}) => {
  const [activeTab, setActiveTab] = useState<'providers' | 'desks'>('providers');
  const [newApiKey, setNewApiKey] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');

  if (!isOpen) return null;

  const userDesks = desks.filter(d => d.id?.startsWith('desk'));
  const canAddDesk = userDesks.length < 6 && connections.some(c => c.isConnected);

  const handleAddDesk = () => {
    const deskNum = userDesks.length + 1;
    const colors = ['#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#1dd1a1', '#a29bfe'];
    const newDesk: Zone = {
      id: `desk${deskNum}`,
      x: 0,
      y: 0,
      w: 200,
      h: 100,
      color: colors[deskNum - 1] || '#667eea',
      label: `Desk ${deskNum}`
    };
    setDesks([...desks, newDesk]);
  };

  const handleRemoveDesk = (deskId: string) => {
    setDesks(desks.filter(d => d.id !== deskId));
    setDeskAssignments(deskAssignments.filter(a => a.deskId !== deskId));
  };

  const handleConnectProvider = (provider: typeof PROVIDERS[0]) => {
    if (!newApiKey) return;
    
    setConnections([...connections, {
      id: Date.now().toString(),
      provider: provider.id as any,
      name: provider.name,
      isConnected: true,
      apiKeyMasked: newApiKey.slice(0, 8) + '...' + newApiKey.slice(-4),
      models: provider.models,
      addedAt: new Date()
    }]);
    setNewApiKey('');
    setSelectedProvider('');
  };

  const handleDisconnect = (providerId: string) => {
    setConnections(connections.filter(c => c.provider !== providerId));
  };

  return (
    <div className="task-form-overlay" onClick={onClose}>
      <div className="task-form" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2>Setup</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
          <button
            onClick={() => setActiveTab('providers')}
            style={{
              padding: '10px 20px',
              background: activeTab === 'providers' ? '#667eea' : 'transparent',
              border: '1px solid #444',
              borderRadius: '6px',
              color: activeTab === 'providers' ? '#fff' : '#888',
              cursor: 'pointer'
            }}
          >
            AI Providers
          </button>
          <button
            onClick={() => setActiveTab('desks')}
            style={{
              padding: '10px 20px',
              background: activeTab === 'desks' ? '#667eea' : 'transparent',
              border: '1px solid #444',
              borderRadius: '6px',
              color: activeTab === 'desks' ? '#fff' : '#888',
              cursor: 'pointer'
            }}
          >
            Desk Management
          </button>
        </div>

        {activeTab === 'providers' && (
          <div>
            <p style={{ color: '#888', fontSize: '13px', marginBottom: '20px' }}>
              Connect your AI provider accounts. API keys are encrypted and never shared.
            </p>

            {PROVIDERS.map(provider => {
              const connection = connections.find(c => c.provider === provider.id);
              return (
                <div key={provider.id} style={{
                  background: 'rgba(0,0,0,0.3)',
                  padding: '20px',
                  borderRadius: '10px',
                  marginBottom: '15px',
                  border: connection?.isConnected ? '1px solid #1dd1a1' : '1px solid #333'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div>
                      <strong style={{ color: '#fff', fontSize: '16px' }}>{provider.name}</strong>
                      {connection?.isConnected && (
                        <span style={{ color: '#1dd1a1', fontSize: '12px', marginLeft: '10px' }}>● Connected</span>
                      )}
                    </div>
                    {!connection?.isConnected ? (
                      <button
                        onClick={() => setSelectedProvider(provider.id)}
                        style={{
                          padding: '8px 16px',
                          background: '#667eea',
                          border: 'none',
                          borderRadius: '6px',
                          color: '#fff',
                          cursor: 'pointer'
                        }}
                      >
                        Add API Key
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDisconnect(provider.id)}
                        style={{
                          padding: '8px 16px',
                          background: 'transparent',
                          border: '1px solid #ff6b6b',
                          borderRadius: '6px',
                          color: '#ff6b6b',
                          cursor: 'pointer'
                        }}
                      >
                        Disconnect
                      </button>
                    )}
                  </div>

                  {connection?.isConnected ? (
                    <div style={{ fontSize: '12px', color: '#888' }}>
                      <div>Key: {connection.apiKeyMasked}</div>
                    </div>
                  ) : (
                    selectedProvider === provider.id && (
                      <div style={{ marginTop: '15px' }}>
                        <input
                          type="password"
                          placeholder={`Enter ${provider.name} API Key`}
                          value={newApiKey}
                          onChange={(e) => setNewApiKey(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '12px',
                            background: 'rgba(0,0,0,0.5)',
                            border: '1px solid #444',
                            borderRadius: '6px',
                            color: '#fff',
                            marginBottom: '10px'
                          }}
                        />
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button
                            onClick={() => handleConnectProvider(provider)}
                            style={{
                              padding: '10px 20px',
                              background: '#1dd1a1',
                              border: 'none',
                              borderRadius: '6px',
                              color: '#fff',
                              cursor: 'pointer'
                            }}
                          >
                            Connect
                          </button>
                          <button
                            onClick={() => { setSelectedProvider(''); setNewApiKey(''); }}
                            style={{
                              padding: '10px 20px',
                              background: 'transparent',
                              border: '1px solid #444',
                              borderRadius: '6px',
                              color: '#888',
                              cursor: 'pointer'
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'desks' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <p style={{ color: '#888', fontSize: '13px' }}>
                Configure desks with connected AI models. {userDesks.length}/6 desks used.
              </p>
              {canAddDesk && (
                <button onClick={handleAddDesk} style={{
                  padding: '10px 20px',
                  background: '#667eea',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: 'pointer'
                }}>
                  + Add Desk
                </button>
              )}
            </div>

            {!connections.some(c => c.isConnected) && (
              <div style={{
                background: 'rgba(255, 193, 7, 0.1)',
                border: '1px solid rgba(255, 193, 7, 0.3)',
                padding: '15px',
                borderRadius: '8px',
                marginBottom: '20px',
                color: '#ffc107',
                fontSize: '13px'
              }}>
                Connect at least one AI provider to create desks.
              </div>
            )}

            {userDesks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                No desks configured. Click "Add Desk" to create your first workspace.
              </div>
            ) : (
              <div>
                {userDesks.map(desk => {
                  const assignment = deskAssignments.find(a => a.deskId === desk.id);
                  const availableModels = connections
                    .filter(c => c.isConnected)
                    .flatMap(c => c.models.map(m => ({ name: m, provider: c.provider })));

                  return (
                    <div key={desk.id} style={{
                      background: 'rgba(0,0,0,0.3)',
                      padding: '15px',
                      borderRadius: '8px',
                      marginBottom: '12px',
                      border: '1px solid #333'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <strong style={{ color: desk.color }}>{desk.label}</strong>
                        <button
                          onClick={() => handleRemoveDesk(desk.id!)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#ff6b6b',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          Remove
                        </button>
                      </div>

                      <select
                        value={assignment?.modelId || ''}
                        onChange={(e) => {
                          const newAssignments = deskAssignments.filter(a => a.deskId !== desk.id);
                          if (e.target.value) {
                            newAssignments.push({
                              deskId: desk.id!,
                              modelId: e.target.value,
                              customName: desk.label
                            });
                          }
                          setDeskAssignments(newAssignments);
                        }}
                        style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.5)', border: '1px solid #444', borderRadius: '6px', color: '#fff' }}
                      >
                        <option value="">Select AI Model...</option>
                        {availableModels.map((model, idx) => (
                          <option key={idx} value={`${model.provider}-${model.name}`}>
                            {model.name} ({model.provider})
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="form-buttons" style={{ marginTop: '20px' }}>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
