/**
 * VerifyEmailPage — handles the /verify-email?token=xxx link from the email.
 *
 * States: verifying -> success | error
 */

import { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { verifyEmail } from '../api/auth';
import { useAuth } from '../contexts/AuthContext';
import './auth.css';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const { markEmailVerified, isAuthenticated } = useAuth();

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('');

  // Guard against React StrictMode double-firing the effect.
  // The first call verifies + clears the token in the DB, so the
  // second call would fail with "invalid token" and overwrite
  // the success state with an error.
  const calledRef = useRef(false);

  useEffect(() => {
    const token = params.get('token');

    if (!token) {
      setStatus('error');
      setMessage('No verification token provided.');
      return;
    }

    if (calledRef.current) return;
    calledRef.current = true;

    verifyEmail(token)
      .then((res) => {
        setStatus('success');
        setMessage(res.message || 'Your email has been verified!');
        markEmailVerified();
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.message || 'Verification failed. The link may have expired.');
      });
  }, [params, markEmailVerified]);

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

          <h1 className="auth-title">Email Verification</h1>

          {status === 'verifying' && (
            <>
              <div className="auth-spinner" style={{ margin: '24px auto' }} />
              <p className="auth-subtitle">Verifying your email...</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="auth-status-icon success">&#10003;</div>
              <p className="auth-success-text">{message}</p>
              <div className="auth-actions">
                <Link
                  to={isAuthenticated ? '/office' : '/login'}
                  className="auth-button"
                  style={{ display: 'block', textDecoration: 'none', textAlign: 'center' }}
                >
                  {isAuthenticated ? 'Go to Office' : 'Sign In'}
                </Link>
              </div>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="auth-status-icon error">&#10007;</div>
              <p className="auth-error-text">{message}</p>
              <div className="auth-actions">
                <Link
                  to={isAuthenticated ? '/office' : '/login'}
                  className="auth-button"
                  style={{ display: 'block', textDecoration: 'none', textAlign: 'center' }}
                >
                  {isAuthenticated ? 'Go to Office' : 'Sign In'}
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
