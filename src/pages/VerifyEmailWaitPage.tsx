/**
 * VerifyEmailWaitPage — shown after registration when the user
 * has NOT yet verified their email. They cannot proceed to the
 * office until they click the link in the email.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { resendVerification } from '../api/auth';
import './auth.css';

export function VerifyEmailWaitPage() {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

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

  const handleCheckVerification = async () => {
    setChecking(true);
    setError('');
    try {
      await refreshUser();
      // refreshUser updates the auth state from the server.
      // If emailVerified is now true, ProtectedRoute / the next
      // render will redirect to /select-plan or /office automatically.
      // Give React a tick to re-render before we navigate.
      setTimeout(() => {
        navigate('/office');
      }, 50);
    } catch {
      setError('Could not check verification status. Please try again.');
      setChecking(false);
    }
  };

  const handleLogout = async () => {
    try { await logout(); } catch { /* cleared locally */ }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <Link to="/" className="auth-logo-link">
            <img
              src="/assets/office-logo.png"
              alt="Agent Desk"
              className="auth-logo"
            />
          </Link>

          <div className="auth-icon">&#9993;</div>
          <h1 className="auth-title">Check Your Email</h1>
          <p className="auth-description">
            We sent a verification link to{' '}
            <strong>{user?.email ?? 'your email'}</strong>.
            <br />
            Please click the link to verify your account before continuing.
          </p>

          {sent && <p className="auth-success-text">Verification email resent!</p>}
          {error && <p className="auth-error-text">{error}</p>}

          <div className="auth-actions">
            <button
              className="auth-button"
              onClick={handleResend}
              disabled={sending}
            >
              {sending ? 'Sending...' : 'Resend Verification Email'}
            </button>

            <button
              className="auth-button-secondary"
              onClick={handleCheckVerification}
              disabled={checking}
            >
              {checking ? 'Checking...' : "I've Verified \u2014 Let Me In"}
            </button>

            <button
              className="auth-button-ghost"
              onClick={handleLogout}
            >
              Sign out and use a different account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
