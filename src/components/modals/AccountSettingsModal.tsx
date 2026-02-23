import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { deleteAccount } from '../../api/auth';

interface AccountSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AccountSettingsModal: React.FC<AccountSettingsModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

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

  if (!isOpen) return null;

  return (
    <div className="task-form-overlay" onClick={onClose}>
      <div className="task-form" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2>Account Settings</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', color: '#888', fontSize: '13px', marginBottom: '8px' }}>Display Name</label>
          <input
            type="text"
            defaultValue={user?.displayName ?? 'You'}
            style={{
              width: '100%',
              padding: '12px',
              background: 'rgba(0,0,0,0.5)',
              border: '1px solid #444',
              borderRadius: '6px',
              color: '#fff'
            }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', color: '#888', fontSize: '13px', marginBottom: '8px' }}>Email</label>
          <input
            type="email"
            defaultValue={user?.email ?? ''}
            placeholder="your@email.com"
            style={{
              width: '100%',
              padding: '12px',
              background: 'rgba(0,0,0,0.5)',
              border: '1px solid #444',
              borderRadius: '6px',
              color: '#fff'
            }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', color: '#888', fontSize: '13px', marginBottom: '8px' }}>Timezone</label>
          <select style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.5)', border: '1px solid #444', borderRadius: '6px', color: '#fff' }}>
            <option>UTC</option>
            <option>GMT+8 (Asia/Shanghai)</option>
            <option>GMT+0 (London)</option>
            <option>GMT-5 (New York)</option>
            <option>GMT-8 (Los Angeles)</option>
          </select>
        </div>

        {/* Log Out */}
        <div style={{ borderTop: '1px solid #333', paddingTop: '20px', marginTop: '20px' }}>
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: '12px',
              background: 'transparent',
              border: '1px solid #ff6b6b',
              borderRadius: '6px',
              color: '#ff6b6b',
              cursor: 'pointer'
            }}
          >
            Log Out
          </button>
        </div>

        {/* Delete Account */}
        <div style={{ borderTop: '1px solid #2a1515', paddingTop: '16px', marginTop: '16px' }}>
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                width: '100%',
                padding: '10px',
                background: 'transparent',
                border: 'none',
                color: '#884444',
                cursor: 'pointer',
                fontSize: '13px',
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
                style={{
                  width: '100%',
                  padding: '10px',
                  background: 'rgba(0,0,0,0.5)',
                  border: '1px solid #444',
                  borderRadius: '6px',
                  color: '#fff',
                  marginBottom: 8,
                  fontSize: 13,
                }}
              />

              {deleteError && (
                <p style={{ color: '#ff6b6b', fontSize: 12, marginBottom: 8 }}>{deleteError}</p>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); setDeleteError(''); }}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid #333',
                    borderRadius: 6,
                    color: '#aaa',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: 'rgba(255,50,50,0.2)',
                    border: '1px solid rgba(255,50,50,0.4)',
                    borderRadius: 6,
                    color: '#ff6b6b',
                    cursor: deleting ? 'wait' : 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {deleting ? 'Deleting...' : 'Delete My Account'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="form-buttons" style={{ marginTop: '20px' }}>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
