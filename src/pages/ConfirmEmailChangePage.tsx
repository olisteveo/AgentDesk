/**
 * ConfirmEmailChangePage — handles the /confirm-email-change?token=xxx link
 * from the verification email sent when a user requests an email change.
 *
 * States: verifying → success | error
 *
 * On success it updates the user's email in AuthContext so the rest of the
 * app reflects the change without requiring a re-login.
 */

import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { confirmEmailChange } from '../api/auth';
import { useAuth } from '../contexts/AuthContext';
import './auth.css';

export function ConfirmEmailChangePage() {
  const [params] = useSearchParams();
  const { updateUser, isAuthenticated } = useAuth();

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = params.get('token');

    if (!token) {
      setStatus('error');
      setMessage('No confirmation token provided.');
      return;
    }

    let cancelled = false;

    confirmEmailChange(token)
      .then((res) => {
        if (cancelled) return;
        setStatus('success');
        setMessage(res.message || 'Your email has been updated!');

        // Update the user's email in auth state so the app reflects
        // the change immediately without requiring a re-login.
        if (res.email) {
          updateUser({ email: res.email });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus('error');
        const errMsg =
          err instanceof Error
            ? err.message
            : err && typeof err === 'object' && 'message' in err
              ? String((err as Record<string, unknown>).message)
              : 'Confirmation failed. The link may have expired.';
        setMessage(errMsg);
      });

    return () => {
      cancelled = true;
    };
  }, [params, updateUser]);

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <h1 className="auth-title">Email Change</h1>

        {status === 'verifying' && (
          <>
            <div className="auth-spinner" style={{ margin: '24px auto' }} />
            <p style={{ color: '#aaa' }}>Confirming your new email…</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{ fontSize: 32, marginBottom: 16, color: '#4ade80', fontWeight: 600 }}>
              Updated
            </div>
            <p style={{ color: '#4ade80', marginBottom: 24 }}>{message}</p>
            <Link
              to={isAuthenticated ? '/office' : '/login'}
              className="auth-button"
              style={{ display: 'inline-block', textDecoration: 'none', padding: '12px 32px' }}
            >
              {isAuthenticated ? 'Go to Office' : 'Sign In'}
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ fontSize: 32, marginBottom: 16, color: '#ff6b6b', fontWeight: 600 }}>
              Error
            </div>
            <p style={{ color: '#ff6b6b', marginBottom: 24 }}>{message}</p>
            <Link
              to={isAuthenticated ? '/office' : '/login'}
              className="auth-button"
              style={{ display: 'inline-block', textDecoration: 'none', padding: '12px 32px' }}
            >
              {isAuthenticated ? 'Go to Office' : 'Sign In'}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
