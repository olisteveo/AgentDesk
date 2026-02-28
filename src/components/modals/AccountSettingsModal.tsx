import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { deleteAccount, changePassword, changeEmail } from '../../api/auth';
import { createCheckoutSession, createPortalSession } from '../../api/stripe';
import { validateName } from '../../utils/profanityFilter';
import { apiRequest } from '../../api/client';
import { getTeam, updateTeam } from '../../api/team';
import type { RoutingConfig } from '../../api/team';
import { Check, Zap, Eye, EyeOff, ExternalLink, Sparkles } from 'lucide-react';

interface AccountSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'account' | 'billing' | 'routing';
}

type Tab = 'account' | 'billing' | 'routing';

// Inline styles (keeps the modal self-contained)
// Uses CSS variables for theme-aware colors
const s = {
  label: { display: 'block', color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '8px' } as React.CSSProperties,
  input: {
    width: '100%', padding: '12px',
    background: 'var(--input-bg)', border: '1px solid var(--border-medium)',
    borderRadius: '6px', color: 'var(--text-primary)', fontFamily: 'inherit',
  } as React.CSSProperties,
  divider: { borderTop: '1px solid var(--border-subtle)', paddingTop: '20px', marginTop: '20px' } as React.CSSProperties,
};

export const AccountSettingsModal: React.FC<AccountSettingsModalProps> = ({ isOpen, onClose, initialTab }) => {
  const navigate = useNavigate();
  const { user, logout, updateUser } = useAuth();

  const [tab, setTab] = useState<Tab>(initialTab ?? 'account');

  // Sync tab when initialTab prop changes (e.g. upgrade prompt opens billing)
  React.useEffect(() => {
    if (initialTab && isOpen) setTab(initialTab);
  }, [initialTab, isOpen]);

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Change password state
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Password visibility toggles
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [showDeletePw, setShowDeletePw] = useState(false);

  // Email change state
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [showEmailPw, setShowEmailPw] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');
  const [emailDevLink, setEmailDevLink] = useState('');
  const [changingEmail, setChangingEmail] = useState(false);

  // Display name state
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [nameError, setNameError] = useState('');
  const [nameSuccess, setNameSuccess] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Billing state
  const [changingPlan, setChangingPlan] = useState(false);
  const [planError, setPlanError] = useState('');
  const [planSuccess, setPlanSuccess] = useState('');

  // Routing config state (Enterprise only)
  const [routingConfig, setRoutingConfig] = useState<RoutingConfig>({});
  const [routingConfigLoaded, setRoutingConfigLoaded] = useState(false);
  const [savingRouting, setSavingRouting] = useState(false);
  const [routingSuccess, setRoutingSuccess] = useState('');
  const [routingError, setRoutingError] = useState('');

  // Reset forms when modal closes (component stays mounted)
  useEffect(() => {
    if (!isOpen) {
      setShowChangePassword(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordError('');
      setPasswordSuccess('');
      setShowCurrentPw(false);
      setShowNewPw(false);
      setShowConfirmPw(false);
      setShowDeletePw(false);
      setShowChangeEmail(false);
      setNewEmail('');
      setEmailPassword('');
      setShowEmailPw(false);
      setEmailError('');
      setEmailSuccess('');
      setEmailDevLink('');
      setNameError('');
      setNameSuccess('');
    } else {
      // Sync display name when modal opens
      setDisplayName(user?.displayName ?? '');
    }
  }, [isOpen, user?.displayName]);

  // Lazy-load routing config when routing tab is opened
  useEffect(() => {
    if (tab === 'routing' && !routingConfigLoaded && isOpen) {
      getTeam().then(team => {
        setRoutingConfig(team.routing_config || {});
        setRoutingConfigLoaded(true);
      }).catch(() => { /* ignore */ });
    }
  }, [tab, routingConfigLoaded, isOpen]);

  const handleSaveRoutingConfig = async () => {
    setSavingRouting(true);
    setRoutingError('');
    setRoutingSuccess('');
    try {
      await updateTeam({ routingConfig });
      setRoutingSuccess('Routing configuration saved successfully.');
    } catch (err) {
      setRoutingError(err instanceof Error ? err.message : 'Failed to save routing config');
    } finally {
      setSavingRouting(false);
    }
  };

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

  const handleChangePassword = async () => {
    setPasswordError('');
    setPasswordSuccess('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('All fields are required');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setPasswordError('Must include an uppercase letter');
      return;
    }
    if (!/[a-z]/.test(newPassword)) {
      setPasswordError('Must include a lowercase letter');
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setPasswordError('Must include a number');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    setChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordSuccess('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setShowChangePassword(false);
        setPasswordSuccess('');
      }, 2000);
    } catch (err: unknown) {
      const msg = (err && typeof err === 'object' && 'message' in err)
        ? (err as { message: string }).message
        : 'Failed to change password';
      setPasswordError(msg);
    } finally {
      setChangingPassword(false);
    }
  };

  const handleChangeEmail = async () => {
    if (!newEmail.trim()) { setEmailError('Please enter a new email address'); return; }
    if (!emailPassword) { setEmailError('Please enter your current password'); return; }

    setChangingEmail(true);
    setEmailError('');
    setEmailSuccess('');

    try {
      const result = await changeEmail(newEmail.trim(), emailPassword);
      // In dev mode, when Resend can't deliver, the backend returns
      // a _dev_emailPreview URL so we can confirm manually.
      if (result._dev_emailPreview) {
        setEmailSuccess(`${result.message}`);
        setEmailDevLink(result._dev_emailPreview);
      } else {
        setEmailSuccess(result.message);
        setEmailDevLink('');
      }
      setNewEmail('');
      setEmailPassword('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message
        : err && typeof err === 'object' && 'message' in err ? String((err as Record<string, unknown>).message)
        : 'Failed to change email';
      setEmailError(msg);
    } finally {
      setChangingEmail(false);
    }
  };

  const handleSaveDisplayName = async () => {
    setNameError('');
    setNameSuccess('');

    const trimmed = displayName.trim();
    const nameIssue = validateName(trimmed);
    if (nameIssue) {
      setNameError(nameIssue);
      return;
    }

    if (trimmed === user?.displayName) {
      setNameSuccess('No changes to save');
      setTimeout(() => setNameSuccess(''), 2000);
      return;
    }

    setSavingName(true);
    try {
      await apiRequest('/api/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ displayName: trimmed }),
      });
      updateUser({ displayName: trimmed });
      setNameSuccess('Name updated');
      setTimeout(() => setNameSuccess(''), 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update name';
      setNameError(msg);
    } finally {
      setSavingName(false);
    }
  };

  const handleUpgradeToPro = async () => {
    setChangingPlan(true);
    setPlanError('');
    setPlanSuccess('');

    try {
      const { checkoutUrl } = await createCheckoutSession('pro', 'upgrade');
      window.location.href = checkoutUrl;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start checkout';
      setPlanError(msg);
      setChangingPlan(false);
    }
  };

  const handleManageSubscription = async () => {
    setChangingPlan(true);
    setPlanError('');

    try {
      const { portalUrl } = await createPortalSession();
      window.location.href = portalUrl;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to open billing portal';
      setPlanError(msg);
      setChangingPlan(false);
    }
  };

  if (!isOpen) return null;

  const currentPlan = user?.plan ?? 'free';
  const isPro = currentPlan === 'pro';
  const isEnterprise = currentPlan === 'enterprise';
  const tabs: Tab[] = isEnterprise ? ['account', 'billing', 'routing'] : ['account', 'billing'];

  return (
    <div className="task-form-overlay" onClick={onClose}>
      <div className="task-form" onClick={e => e.stopPropagation()} style={{ maxWidth: 440, maxHeight: '85vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0 }}>Settings</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1px solid var(--border-subtle)' }}>
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: '10px 0',
                background: 'transparent',
                border: 'none',
                borderBottom: tab === t ? '2px solid #667eea' : '2px solid transparent',
                color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
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
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => { setDisplayName(e.target.value); setNameError(''); setNameSuccess(''); }}
                  maxLength={30}
                  style={{ ...s.input, flex: 1 }}
                />
                {displayName.trim() !== (user?.displayName ?? '') && (
                  <button
                    onClick={handleSaveDisplayName}
                    disabled={savingName}
                    style={{
                      padding: '12px 16px', background: 'linear-gradient(135deg, #667eea, #764ba2)',
                      border: 'none', borderRadius: 6,
                      color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: 13, whiteSpace: 'nowrap', fontWeight: 600,
                    }}
                  >
                    {savingName ? '...' : 'Save'}
                  </button>
                )}
              </div>
              {nameError && <p style={{ color: '#ff6b6b', fontSize: 12, margin: '6px 0 0' }}>{nameError}</p>}
              {nameSuccess && <p style={{ color: '#4ade80', fontSize: 12, margin: '6px 0 0' }}>{nameSuccess}</p>}
            </div>

            {/* Email — hidden for Google sign-in users, editable for password users */}
            {user?.hasPassword !== false && (
              <div style={{ marginBottom: 20 }}>
                <label style={s.label}>Email</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="email"
                    value={user?.email ?? ''}
                    readOnly
                    style={{ ...s.input, flex: 1, opacity: 0.7, cursor: 'default' }}
                  />
                  {!showChangeEmail && (
                    <button
                      onClick={() => setShowChangeEmail(true)}
                      style={{
                        padding: '12px 16px', background: 'transparent',
                        border: '1px solid var(--border-medium)', borderRadius: 6,
                        color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit',
                        fontSize: 13, whiteSpace: 'nowrap',
                      }}
                    >
                      Change
                    </button>
                  )}
                </div>

                {showChangeEmail && (
                  <div style={{
                    background: 'rgba(102,126,234,0.04)',
                    border: '1px solid rgba(102,126,234,0.15)',
                    borderRadius: 8, padding: 16, marginTop: 10,
                  }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>
                      A verification email will be sent to the new address. The change takes effect once you click the link.
                    </p>
                    <input
                      type="email"
                      placeholder="New email address"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      style={{ ...s.input, fontSize: 13, marginBottom: 8 }}
                    />
                    <div style={{ position: 'relative', marginBottom: 8 }}>
                      <input
                        type={showEmailPw ? 'text' : 'password'}
                        placeholder="Current password"
                        value={emailPassword}
                        onChange={(e) => setEmailPassword(e.target.value)}
                        autoComplete="new-password"
                        data-1p-ignore="true"
                        data-lpignore="true"
                        style={{ ...s.input, fontSize: 13, padding: '10px 38px 10px 10px' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowEmailPw(!showEmailPw)}
                        style={{
                          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4,
                        }}
                        tabIndex={-1}
                      >
                        {showEmailPw ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>

                    {emailError && (
                      <p style={{ color: '#ff6b6b', fontSize: 12, marginBottom: 8 }}>{emailError}</p>
                    )}
                    {emailSuccess && (
                      <p style={{ color: '#4ade80', fontSize: 12, marginBottom: 8 }}>{emailSuccess}</p>
                    )}
                    {emailDevLink && (
                      <a
                        href={emailDevLink}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#667eea', fontSize: 12, display: 'block', marginBottom: 8, wordBreak: 'break-all' }}
                      >
                        Dev: Open confirmation link →
                      </a>
                    )}

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => {
                          setShowChangeEmail(false);
                          setNewEmail('');
                          setEmailPassword('');
                          setEmailError('');
                          setEmailSuccess('');
                          setEmailDevLink('');
                        }}
                        style={{
                          flex: 1, padding: 10, background: 'var(--bg-surface)',
                          border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-secondary)',
                          cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleChangeEmail}
                        disabled={changingEmail}
                        style={{
                          flex: 1, padding: 10,
                          background: 'linear-gradient(135deg, #667eea, #764ba2)',
                          border: 'none', borderRadius: 6,
                          color: '#fff', cursor: changingEmail ? 'wait' : 'pointer',
                          fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                        }}
                      >
                        {changingEmail ? 'Sending...' : 'Send Verification'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <label style={s.label}>Timezone</label>
              <div style={{
                ...s.input,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                color: 'var(--text-secondary)', cursor: 'default',
              }}>
                <span>{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Auto-detected</span>
              </div>
            </div>

            {/* Change Password (only for users with a password -- not Google OAuth) */}
            <div style={s.divider}>
              {user?.hasPassword === false ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
                  Signed in with Google -- password management is not available.
                </p>
              ) : !showChangePassword ? (
                <button
                  onClick={() => setShowChangePassword(true)}
                  style={{
                    width: '100%', padding: 12, background: 'transparent',
                    border: '1px solid var(--border-medium)', borderRadius: 6,
                    color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 13,
                  }}
                >
                  Change Password
                </button>
              ) : (
                <div style={{
                  background: 'rgba(102,126,234,0.04)',
                  border: '1px solid rgba(102,126,234,0.15)',
                  borderRadius: 8, padding: 16,
                }}>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>
                    Enter your current password and choose a new one.
                  </p>

                  <input type="text" name="prevent-autofill-pw" autoComplete="off" style={{ display: 'none' }} tabIndex={-1} />
                  <div style={{ position: 'relative', marginBottom: 8 }}>
                    <input
                      type={showCurrentPw ? 'text' : 'password'}
                      placeholder="Current password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      autoComplete="new-password"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      style={{ ...s.input, fontSize: 13, padding: '10px 38px 10px 10px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPw(!showCurrentPw)}
                      style={{
                        position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4,
                      }}
                      tabIndex={-1}
                    >
                      {showCurrentPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <div style={{ position: 'relative', marginBottom: 8 }}>
                    <input
                      type={showNewPw ? 'text' : 'password'}
                      placeholder="Min 8 chars, uppercase, lowercase & number"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      style={{ ...s.input, fontSize: 13, padding: '10px 38px 10px 10px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPw(!showNewPw)}
                      style={{
                        position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4,
                      }}
                      tabIndex={-1}
                    >
                      {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <div style={{ position: 'relative', marginBottom: 8 }}>
                    <input
                      type={showConfirmPw ? 'text' : 'password'}
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      style={{ ...s.input, fontSize: 13, padding: '10px 38px 10px 10px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPw(!showConfirmPw)}
                      style={{
                        position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4,
                      }}
                      tabIndex={-1}
                    >
                      {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  {passwordError && (
                    <p style={{ color: '#ff6b6b', fontSize: 12, marginBottom: 8 }}>{passwordError}</p>
                  )}
                  {passwordSuccess && (
                    <p style={{ color: '#4ade80', fontSize: 12, marginBottom: 8 }}>{passwordSuccess}</p>
                  )}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => {
                        setShowChangePassword(false);
                        setCurrentPassword('');
                        setNewPassword('');
                        setConfirmPassword('');
                        setPasswordError('');
                        setPasswordSuccess('');
                      }}
                      style={{
                        flex: 1, padding: 10, background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-secondary)',
                        cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleChangePassword}
                      disabled={changingPassword}
                      style={{
                        flex: 1, padding: 10,
                        background: 'linear-gradient(135deg, #667eea, #764ba2)',
                        border: 'none', borderRadius: 6,
                        color: '#fff', cursor: changingPassword ? 'wait' : 'pointer',
                        fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                      }}
                    >
                      {changingPassword ? 'Saving...' : 'Update Password'}
                    </button>
                  </div>
                </div>
              )}
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
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16, marginTop: 16 }}>
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

                  {user?.hasPassword !== false && (
                    <div style={{ position: 'relative', marginBottom: 8 }}>
                      <input
                        type={showDeletePw ? 'text' : 'password'}
                        placeholder="Enter your password to confirm"
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
                        style={{ ...s.input, fontSize: 13, padding: '10px 38px 10px 10px' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowDeletePw(!showDeletePw)}
                        style={{
                          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4,
                        }}
                        tabIndex={-1}
                      >
                        {showDeletePw ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  )}

                  {deleteError && (
                    <p style={{ color: '#ff6b6b', fontSize: 12, marginBottom: 8 }}>{deleteError}</p>
                  )}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); setDeleteError(''); }}
                      style={{
                        flex: 1, padding: 10, background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-secondary)',
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
                : 'var(--bg-surface)',
              border: `1px solid ${isPro ? 'rgba(102,126,234,0.3)' : 'var(--border-subtle)'}`,
              borderRadius: 12, padding: 20, marginBottom: 20,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 600 }}>
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
              <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
                {isPro
                  ? '5 users, 6 desks, 6 providers, full analytics, meeting room, whiteboard, priority support'
                  : '1 user, 3 desks, 3 providers, basic task management, cost overview'}
              </p>
            </div>

            {/* Plan comparison */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              {/* Free card */}
              <div style={{
                background: !isPro ? 'rgba(102,126,234,0.08)' : 'var(--bg-surface)',
                border: `1px solid ${!isPro ? 'rgba(102,126,234,0.3)' : 'var(--border-subtle)'}`,
                borderRadius: 10, padding: 16,
              }}>
                <h4 style={{ color: 'var(--text-primary)', fontSize: 14, margin: '0 0 4px', fontWeight: 600 }}>Starter</h4>
                <p style={{ color: 'var(--text-primary)', fontSize: 22, fontWeight: 700, margin: '0 0 10px' }}>
                  $0<span style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 400 }}> forever</span>
                </p>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px' }}>
                  {['1 user', '3 desks', '3 providers', 'Basic tasks', 'Cost overview', 'BYOK'].map((f) => (
                    <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 12, padding: '2px 0' }}>
                      <Check size={12} strokeWidth={2.5} style={{ color: '#667eea' }} /> {f}
                    </li>
                  ))}
                </ul>
                {isPro && user?.stripeCancelAt ? (
                  <div style={{
                    width: '100%', padding: 8, fontSize: 12, fontWeight: 600,
                    textAlign: 'center', color: '#ffab00',
                  }}>
                    Canceling soon
                  </div>
                ) : isPro ? (
                  <button
                    onClick={handleManageSubscription}
                    disabled={changingPlan}
                    style={{
                      width: '100%', padding: 8, fontSize: 12, fontWeight: 600,
                      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                      borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit',
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
                background: isPro ? 'rgba(102,126,234,0.08)' : 'var(--bg-surface)',
                border: `1px solid ${isPro ? 'rgba(102,126,234,0.3)' : 'var(--border-subtle)'}`,
                borderRadius: 10, padding: 16,
              }}>
                <h4 style={{ color: 'var(--text-primary)', fontSize: 14, margin: '0 0 4px', fontWeight: 600 }}>Pro</h4>
                <p style={{ color: 'var(--text-primary)', fontSize: 22, fontWeight: 700, margin: '0 0 10px' }}>
                  $19<span style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 400 }}> /month</span>
                </p>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px' }}>
                  {['Up to 5 users', '6 desks', '6 providers', 'Advanced tasks', 'Full analytics', 'Meeting room', 'Whiteboard', 'Priority support'].map((f) => (
                    <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 12, padding: '2px 0' }}>
                      <Check size={12} strokeWidth={2.5} style={{ color: '#667eea' }} /> {f}
                    </li>
                  ))}
                </ul>
                {!isPro ? (
                  <button
                    onClick={handleUpgradeToPro}
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
                  <button
                    onClick={handleManageSubscription}
                    disabled={changingPlan}
                    style={{
                      width: '100%', padding: 8, fontSize: 12, fontWeight: 600,
                      background: 'rgba(102,126,234,0.15)', border: '1px solid rgba(102,126,234,0.3)',
                      borderRadius: 6, color: '#667eea', cursor: 'pointer', fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    {changingPlan ? '...' : <><ExternalLink size={12} /> Manage Subscription</>}
                  </button>
                )}
              </div>
            </div>

            {planError && (
              <p style={{ color: '#ff6b6b', fontSize: 13, textAlign: 'center', marginBottom: 8 }}>{planError}</p>
            )}
            {planSuccess && (
              <p style={{ color: '#4ade80', fontSize: 13, textAlign: 'center', marginBottom: 8 }}>{planSuccess}</p>
            )}

            {/* Subscription management */}
            {isPro && user?.stripeCancelAt && (
              <div style={{
                background: 'rgba(255,171,0,0.08)', border: '1px solid rgba(255,171,0,0.25)',
                borderRadius: 10, padding: 16, textAlign: 'center', marginBottom: 12,
              }}>
                <p style={{ color: '#ffab00', fontSize: 13, margin: 0, fontWeight: 500 }}>
                  Your Pro plan is set to cancel on{' '}
                  {new Date(user.stripeCancelAt).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'long', day: 'numeric',
                  })}
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '6px 0 0' }}>
                  You'll keep Pro access until then. Re-subscribe anytime from the billing portal.
                </p>
              </div>
            )}

            {isPro && (
              <div style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                borderRadius: 10, padding: 16, textAlign: 'center',
              }}>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 12px' }}>
                  Update payment method, view invoices, or cancel your subscription.
                </p>
                <button
                  onClick={handleManageSubscription}
                  disabled={changingPlan}
                  style={{
                    padding: '8px 20px', fontSize: 13, fontWeight: 600,
                    background: 'rgba(102,126,234,0.12)', border: '1px solid rgba(102,126,234,0.3)',
                    borderRadius: 6, color: '#667eea', cursor: 'pointer', fontFamily: 'inherit',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <ExternalLink size={13} /> Open Billing Portal
                </button>
              </div>
            )}
          </>
        )}

        {/* ═══ ROUTING TAB (Enterprise only) ═══ */}
        {tab === 'routing' && isEnterprise && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Sparkles size={18} style={{ color: '#ffa502' }} />
              <h3 style={{ margin: 0, fontSize: 16 }}>Smart Routing Configuration</h3>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 20 }}>
              Configure how the AI routing analysis handles proposed optimizations.
              Auto-approved rules are subject to safety guardrails.
            </p>

            {/* Auto-approve toggle */}
            <div style={{ ...s.divider, borderTop: 'none', paddingTop: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <label style={{ ...s.label, marginBottom: 2, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Enable Auto-Approval
                  </label>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Automatically activate safe routing rules from analysis
                  </span>
                </div>
                <button
                  onClick={() => setRoutingConfig(c => ({ ...c, auto_approve: !c.auto_approve }))}
                  style={{
                    width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                    background: routingConfig.auto_approve ? '#1dd1a1' : 'var(--border-medium)',
                    transition: 'background 0.2s', position: 'relative',
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 2, left: routingConfig.auto_approve ? 22 : 2,
                    width: 20, height: 20, borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  }} />
                </button>
              </div>
            </div>

            {/* Confidence threshold */}
            <div style={s.divider}>
              <label style={s.label}>
                Minimum Confidence Threshold: <strong style={{ color: 'var(--text-primary)' }}>
                  {Math.round((routingConfig.auto_approve_confidence_threshold ?? 0.8) * 100)}%
                </strong>
              </label>
              <input
                type="range"
                min={70}
                max={95}
                step={5}
                value={Math.round((routingConfig.auto_approve_confidence_threshold ?? 0.8) * 100)}
                onChange={(e) => setRoutingConfig(c => ({
                  ...c,
                  auto_approve_confidence_threshold: parseInt(e.target.value) / 100,
                }))}
                style={{ width: '100%', accentColor: '#667eea' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                <span>70% (more rules)</span>
                <span>95% (safer)</span>
              </div>
            </div>

            {/* Optimization goal */}
            <div style={s.divider}>
              <label style={s.label}>Optimization Goal</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {(['quality', 'cost', 'balanced', 'speed'] as const).map(goal => (
                  <button
                    key={goal}
                    onClick={() => setRoutingConfig(c => ({ ...c, optimization_goal: goal }))}
                    style={{
                      padding: '10px 12px', borderRadius: 8, border: '1px solid',
                      borderColor: routingConfig.optimization_goal === goal ? '#667eea' : 'var(--border-medium)',
                      background: routingConfig.optimization_goal === goal ? 'rgba(102,126,234,0.12)' : 'var(--bg-surface)',
                      color: routingConfig.optimization_goal === goal ? '#667eea' : 'var(--text-muted)',
                      cursor: 'pointer', fontSize: 13, fontWeight: 600,
                      textTransform: 'capitalize', fontFamily: 'inherit',
                      transition: 'all 0.15s',
                    }}
                  >
                    {goal}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto-approve cost optimization rules */}
            <div style={s.divider}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <label style={{ ...s.label, marginBottom: 2, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Auto-Approve Cost Rules
                  </label>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Allow auto-approval of model downgrade suggestions
                  </span>
                </div>
                <button
                  onClick={() => setRoutingConfig(c => ({ ...c, auto_approve_cost_rules: !c.auto_approve_cost_rules }))}
                  style={{
                    width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                    background: routingConfig.auto_approve_cost_rules ? '#1dd1a1' : 'var(--border-medium)',
                    transition: 'background 0.2s', position: 'relative',
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 2, left: routingConfig.auto_approve_cost_rules ? 22 : 2,
                    width: 20, height: 20, borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  }} />
                </button>
              </div>
            </div>

            {/* Max cost savings percentage */}
            <div style={s.divider}>
              <label style={s.label}>
                Max Cost Savings per Switch: <strong style={{ color: 'var(--text-primary)' }}>
                  {routingConfig.max_auto_cost_savings_pct ?? 30}%
                </strong>
              </label>
              <input
                type="range"
                min={10}
                max={50}
                step={5}
                value={routingConfig.max_auto_cost_savings_pct ?? 30}
                onChange={(e) => setRoutingConfig(c => ({
                  ...c,
                  max_auto_cost_savings_pct: parseInt(e.target.value),
                }))}
                style={{ width: '100%', accentColor: '#667eea' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                <span>10% (conservative)</span>
                <span>50% (aggressive)</span>
              </div>
            </div>

            {/* Save button */}
            <div style={{ ...s.divider, display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={handleSaveRoutingConfig}
                disabled={savingRouting}
                style={{
                  padding: '10px 24px', fontSize: 13, fontWeight: 600,
                  background: 'linear-gradient(135deg, #667eea, #764ba2)',
                  border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer',
                  fontFamily: 'inherit', opacity: savingRouting ? 0.6 : 1,
                }}
              >
                {savingRouting ? 'Saving...' : 'Save Configuration'}
              </button>
              {routingSuccess && <span style={{ color: '#1dd1a1', fontSize: 12 }}>{routingSuccess}</span>}
              {routingError && <span style={{ color: '#ff6b6b', fontSize: 12 }}>{routingError}</span>}
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
