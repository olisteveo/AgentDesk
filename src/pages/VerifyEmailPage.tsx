/**
 * VerifyEmailPage — handles the /verify-email?token=xxx link from the email.
 *
 * States: verifying → success | error
 */

import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { verifyEmail } from '../api/auth';
import { useAuth } from '../contexts/AuthContext';
import './auth.css';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const { markEmailVerified, isAuthenticated } = useAuth();

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = params.get('token');

    if (!token) {
      setStatus('error');
      setMessage('No verification token provided.');
      return;
    }

    let cancelled = false;

    verifyEmail(token)
      .then((res) => {
        if (cancelled) return;
        setStatus('success');
        setMessage(res.message || 'Your email has been verified!');
        markEmailVerified();
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus('error');
        setMessage(err.message || 'Verification failed. The link may have expired.');
      });

    return () => {
      cancelled = true;
    };
  }, [params, markEmailVerified]);

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <h1 className="auth-title">Email Verification</h1>

        {status === 'verifying' && (
          <>
            <div className="auth-spinner" style={{ margin: '24px auto' }} />
            <p style={{ color: '#aaa' }}>Verifying your email...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <p style={{ color: '#4ade80', marginBottom: 24 }}>{message}</p>
            <Link
              to={isAuthenticated ? '/office' : '/login'}
              className="auth-submit"
              style={{ display: 'inline-block', textDecoration: 'none' }}
            >
              {isAuthenticated ? 'Go to Office' : 'Sign In'}
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
            <p style={{ color: '#ff6b6b', marginBottom: 24 }}>{message}</p>
            <Link
              to={isAuthenticated ? '/office' : '/login'}
              className="auth-submit"
              style={{ display: 'inline-block', textDecoration: 'none' }}
            >
              {isAuthenticated ? 'Go to Office' : 'Sign In'}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
