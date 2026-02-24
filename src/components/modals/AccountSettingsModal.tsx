import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { deleteAccount, selectPlan } from '../../api/auth';
import { Check, Zap } from 'lucide-react';

interface AccountSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'account' | 'billing';

// Inline styles (keeps the modal self-contained)
const s = {
  label: { display: 'block', color: '#888', fontSize: '13px', marginBottom: '8px' } as React.CSSProperties,
  input: {
    width: '100%', padding: '12px',
    background: 'rgba(0,0,0,0.5)', border: '1px solid #444',
    borderRadius: '6px', color: '#fff', fontFamily: 'inherit',
  } as React.CSSProperties,
  divider: { borderTop: '1px solid #333', paddingTop: '20px', marginTop: '20px' } as React.CSSProperties,
};

export const AccountSettingsModal: React.FC<AccountSettingsModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { user, logout, updateUser } = useAuth();

  const [tab, setTab] = useState<Tab>('account');

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Billing state
  const [changingPlan, setChangingPlan] = useState(false);
  const [planError, setPlanError] = useState('');
  const [planSuccess, setPlanSuccess] = useState('');

  const handleLogout = async () => {
    onClose();
    try { await logout(); } catch { /* context clears tokens regardless */ }
    navigate('/login');
  };

  const handleDeleteAccount = async () => {
    setDeleteError('');
    setDeleting(true);

    try {
      await deleteAccount(deletePassword || undefined);
      onClose();
      try { await logout(); } catch { /* cleared locally */ }
      navigate('/login');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete account';
      setDeleteError(msg);
    } finally {
      setDeleting(false);
    }
  };

  const handleChangePlan = async (newPlan: 'free' | 'pro') => {
    if (newPlan === user?.plan) return;
    setChangingPlan(true);
    setPlanError('');
    setPlanSuccess('');

    try {
      const result = await selectPlan(newPlan);
      updateUser({ plan: result.plan });
      setPlanSuccess(`Switched to ${result.plan.charAt(0).toUpperCase() + result.plan.slice(1)} plan`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to change plan';
      setPlanError(msg);
    } finally {
      setChangingPlan(false);
    }
  };

  if (!isOpen) return null;

  const currentPlan = user?.plan ?? 'free';
  const isPro = currentPlan === 'pro';

  return (
    <div className="task-form-overlay" onClick={onClose}>
      <div className="task-form" onClick={e => e.stopPropagation()} style={{ maxWidth: 440, maxHeight: '85vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0 }}>Settings</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1px solid #333' }}>
          {(['account', 'billing'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: '10px 0',
                background: 'transparent',
                border: 'none',
                borderBottom: tab === t ? '2px solid #667eea' : '2px solid transparent',
                color: tab === t ? '#fff' : '#666',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'color 0.2s, border-color 0.2s',
                textTransform: 'capitalize',
                fontFamily: 'inherit',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* ═══ ACCOUNT TAB ═══ */}
        {tab === 'account' && (
          <>
            <div style={{ marginBottom: 20 }}>
              <label style={s.label}>Display Name</label>
              <input type="text" defaultValue={user?.displayName ?? 'You'} style={s.input} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={s.label}>Email</label>
              <input type="email" defaultValue={user?.email ?? ''} style={s.input} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={s.label}>Timezone</label>
              <select style={s.input}>
                <option>UTC</option>
                <option>GMT+8 (Asia/Shanghai)</option>
                <option>GMT+0 (London)</option>
                <option>GMT-5 (New York)</option>
                <option>GMT-8 (Los Angeles)</option>
              </select>
            </div>

            {/* Log Out */}
            <div style={s.divider}>
              <button
                onClick={handleLogout}
                style={{
                  width: '100%', padding: 12, background: 'transparent',
                  border: '1px solid #ff6b6b', borderRadius: 6,
                  color: '#ff6b6b', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Log Out
              </button>
            </div>

            {/* Delete Account */}
            <div style={{ borderTop: '1px solid #2a1515', paddingTop: 16, marginTop: 16 }}>
              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  style={{
                    width: '100%', padding: 10, background: 'transparent',
                    border: 'none', color: '#884444', cursor: 'pointer',
                    fontSize: 13, fontFamily: 'inherit',
                  }}
                >
                  Delete Account
                </button>
              ) : (
                <div style={{ background: 'rgba(255,50,50,0.05)', border: '1px solid #3a1515', borderRadius: 8, padding: 16 }}>
                  <p style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
                    This will permanently delete your account and all associated data.
                    This action cannot be undone.
                  </p>

                  <input
                    type="password"
                    placeholder="Enter your password to confirm"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    style={{ ...s.input, marginBottom: 8, fontSize: 13, padding: 10 }}
                  />

                  {deleteError && (
                    <p style={{ color: '#ff6b6b', fontSize: 12, marginBottom: 8 }}>{deleteError}</p>
                  )}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); setDeleteError(''); }}
                      style={{
                        flex: 1, padding: 10, background: 'rgba(255,255,255,0.05)',
                        border: '1px solid #333', borderRadius: 6, color: '#aaa',
                        cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleting}
                      style={{
                        flex: 1, padding: 10, background: 'rgba(255,50,50,0.2)',
                        border: '1px solid rgba(255,50,50,0.4)', borderRadius: 6,
                        color: '#ff6b6b', cursor: deleting ? 'wait' : 'pointer',
                        fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                      }}
                    >
                      {deleting ? 'Deleting...' : 'Delete My Account'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ═══ BILLING TAB ═══ */}
        {tab === 'billing' && (
          <>
            {/* BYOK notice */}
            <div style={{
              background: 'rgba(102,126,234,0.06)',
              border: '1px solid rgba(102,126,234,0.15)',
              borderRadius: 10, padding: '12px 16px', marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 14, color: '#8b9cf7', fontWeight: 600 }}>BYOK</span>
              <p style={{ color: '#8b9cf7', fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                All plans are <strong>BYOK</strong> (Bring Your Own Keys). You connect your own AI provider API keys — we never charge for AI usage, only for workspace features.
              </p>
            </div>

            {/* Current plan badge */}
            <div style={{
              background: isPro
                ? 'linear-gradient(135deg, rgba(102,126,234,0.1), rgba(118,75,162,0.06))'
                : 'rgba(255,255,255,0.03)',
              border: `1px solid ${isPro ? 'rgba(102,126,234,0.3)' : '#333'}`,
              borderRadius: 12, padding: 20, marginBottom: 20,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>
                  {isPro ? 'Pro' : 'Starter'} Plan
                </span>
                {isPro && (
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: 'linear-gradient(135deg, #667eea, #764ba2)',
                    color: '#fff', fontSize: 10, fontWeight: 700,
                    padding: '3px 8px', borderRadius: 12, letterSpacing: 0.5,
                  }}>
                    <Zap size={10} /> PRO
                  </span>
                )}
              </div>
              <p style={{ color: '#888', fontSize: 13, margin: 0 }}>
                {isPro
                  ? '5 users, 6 desks, 6 providers, full analytics, meeting room, whiteboard, priority support'
                  : '1 user, 3 desks, 3 providers, basic task management, cost overview'}
              </p>
            </div>

            {/* Plan comparison */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              {/* Free card */}
              <div style={{
                background: !isPro ? 'rgba(102,126,234,0.08)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${!isPro ? 'rgba(102,126,234,0.3)' : '#222'}`,
                borderRadius: 10, padding: 16,
              }}>
                <h4 style={{ color: '#fff', fontSize: 14, margin: '0 0 4px', fontWeight: 600 }}>Starter</h4>
                <p style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: '0 0 10px' }}>
                  $0<span style={{ color: '#666', fontSize: 12, fontWeight: 400 }}> forever</span>
                </p>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px' }}>
                  {['1 user', '3 desks', '3 providers', 'Basic tasks', 'Cost overview', 'BYOK'].map((f) => (
                    <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#aaa', fontSize: 12, padding: '2px 0' }}>
                      <Check size={12} strokeWidth={2.5} style={{ color: '#667eea' }} /> {f}
                    </li>
                  ))}
                </ul>
                {isPro ? (
                  <button
                    onClick={() => handleChangePlan('free')}
                    disabled={changingPlan}
                    style={{
                      width: '100%', padding: 8, fontSize: 12, fontWeight: 600,
                      background: 'rgba(255,255,255,0.05)', border: '1px solid #333',
                      borderRadius: 6, color: '#aaa', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {changingPlan ? '...' : 'Downgrade'}
                  </button>
                ) : (
                  <div style={{
                    width: '100%', padding: 8, fontSize: 12, fontWeight: 600,
                    textAlign: 'center', color: '#667eea',
                  }}>
                    Current Plan
                  </div>
                )}
              </div>

              {/* Pro card */}
              <div style={{
                background: isPro ? 'rgba(102,126,234,0.08)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${isPro ? 'rgba(102,126,234,0.3)' : '#222'}`,
                borderRadius: 10, padding: 16,
              }}>
                <h4 style={{ color: '#fff', fontSize: 14, margin: '0 0 4px', fontWeight: 600 }}>Pro</h4>
                <p style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: '0 0 10px' }}>
                  $29<span style={{ color: '#666', fontSize: 12, fontWeight: 400 }}> /month</span>
                </p>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px' }}>
                  {['Up to 5 users', '6 desks', '6 providers', 'Advanced tasks', 'Full analytics', 'Meeting room', 'Whiteboard', 'Priority support'].map((f) => (
                    <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#aaa', fontSize: 12, padding: '2px 0' }}>
                      <Check size={12} strokeWidth={2.5} style={{ color: '#667eea' }} /> {f}
                    </li>
                  ))}
                </ul>
                {!isPro ? (
                  <button
                    onClick={() => handleChangePlan('pro')}
                    disabled={changingPlan}
                    style={{
                      width: '100%', padding: 8, fontSize: 12, fontWeight: 600,
                      background: 'linear-gradient(135deg, #667eea, #764ba2)',
                      border: 'none', borderRadius: 6, color: '#fff',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {changingPlan ? '...' : 'Upgrade'}
                  </button>
                ) : (
                  <div style={{
                    width: '100%', padding: 8, fontSize: 12, fontWeight: 600,
                    textAlign: 'center', color: '#667eea',
                  }}>
                    Current Plan
                  </div>
                )}
              </div>
            </div>

            {planError && (
              <p style={{ color: '#ff6b6b', fontSize: 13, textAlign: 'center', marginBottom: 8 }}>{planError}</p>
            )}
            {planSuccess && (
              <p style={{ color: '#4ade80', fontSize: 13, textAlign: 'center', marginBottom: 8 }}>{planSuccess}</p>
            )}

            {/* Payment method placeholder */}
            <div style={{
              background: 'rgba(255,255,255,0.02)', border: '1px solid #222',
              borderRadius: 10, padding: 20, textAlign: 'center',
            }}>
              <p style={{ color: '#555', fontSize: 13, margin: 0 }}>
                Payment method management coming soon.
              </p>
              <p style={{ color: '#444', fontSize: 12, margin: '6px 0 0' }}>
                Stripe integration will be added in a future update.
              </p>
            </div>
          </>
        )}

        {/* Close */}
        <div className="form-buttons" style={{ marginTop: 20 }}>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
