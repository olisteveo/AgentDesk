/**
 * VerifyEmailWaitPage — shown after registration when the user
 * has NOT yet verified their email. They cannot proceed to the
 * office until they click the link in the email.
 */

import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { resendVerification } from '../api/auth';
import './auth.css';

export function VerifyEmailWaitPage() {
  const { user, logout } = useAuth();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleResend = async () => {
    setSending(true);
    setError('');
    setSent(false);
    try {
      await resendVerification();
      setSent(true);
    } catch {
      setError('Failed to resend. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleLogout = async () => {
    try { await logout(); } catch { /* cleared locally */ }
  };

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center', maxWidth: 440 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>📧</div>
        <h1 className="auth-title">Check Your Email</h1>
        <p style={{ color: '#aaa', lineHeight: 1.6, marginBottom: 24 }}>
          We sent a verification link to{' '}
          <strong style={{ color: '#667eea' }}>{user?.email ?? 'your email'}</strong>.
          <br />
          Please click the link to verify your account before continuing.
        </p>

        {sent && (
          <p style={{ color: '#4ade80', fontSize: 14, marginBottom: 16 }}>
            ✓ Verification email resent!
          </p>
        )}
        {error && (
          <p style={{ color: '#ff6b6b', fontSize: 14, marginBottom: 16 }}>
            {error}
          </p>
        )}

        <button
          className="auth-submit"
          onClick={handleResend}
          disabled={sending}
          style={{ marginBottom: 12, width: '100%' }}
        >
          {sending ? 'Sending...' : 'Resend Verification Email'}
        </button>

        <button
          onClick={() => window.location.reload()}
          style={{
            width: '100%',
            padding: '12px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid #333',
            borderRadius: 8,
            color: '#aaa',
            cursor: 'pointer',
            marginBottom: 12,
          }}
        >
          I've Verified — Let Me In
        </button>

        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            padding: '10px',
            background: 'transparent',
            border: 'none',
            color: '#666',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Sign out and use a different account
        </button>
      </div>
    </div>
  );
}
