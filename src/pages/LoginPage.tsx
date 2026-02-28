/**
 * LoginPage — email + password form that hits POST /api/auth/login.
 * Also supports Google Sign-In.
 * Redirects to /office on success, or to /office immediately if
 * the user is already authenticated.
 */

import { useState, useEffect, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { GoogleSignInButton } from '../components/auth/GoogleSignInButton';
import type { ApiError } from '../api/client';
import './auth.css';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, googleLogin, isAuthenticated, isLoading: authLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Handle OAuth implicit flow redirect — Google returns id_token in URL hash
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || !hash.includes('id_token=')) return;

    const params = new URLSearchParams(hash.substring(1));
    const idToken = params.get('id_token');

    // Clean up the URL hash
    window.history.replaceState(null, '', window.location.pathname);

    if (idToken) {
      setSubmitting(true);
      googleLogin(idToken)
        .then(() => navigate('/office'))
        .catch((err: unknown) => {
          const apiErr = err as ApiError;
          setError(apiErr.message || 'Google sign-in failed.');
        })
        .finally(() => setSubmitting(false));
    }
  }, [googleLogin, navigate]);

  // Already logged in — go straight to the office
  if (!authLoading && isAuthenticated) {
    return <Navigate to="/office" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await login({ email, password });
      navigate('/office');
    } catch (err) {
      const apiErr = err as ApiError;
      setError(apiErr.message || 'Login failed. Please check your credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSuccess = async (credential: string) => {
    setError('');
    setSubmitting(true);
    try {
      await googleLogin(credential);
      navigate('/office');
    } catch (err) {
      const apiErr = err as ApiError;
      setError(apiErr.message || 'Google sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <Link to="/" className="auth-logo-link">
            <img
              src="/assets/office-logo.png"
              alt="Agent Desk"
              className="auth-logo"
            />
          </Link>
          <h1 className="auth-title">Welcome Back</h1>
          <p className="auth-subtitle">Sign in to your Agent Desk</p>

          {error && <div className="form-error-global">{error}</div>}

          {/* Google Sign-In */}
          <GoogleSignInButton
            onSuccess={handleGoogleSuccess}
            label="Sign in with Google"
          />

          <div className="auth-divider">
            <span>or</span>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="login-email" className="form-label">Email</label>
              <input
                id="login-email"
                type="email"
                className="form-input"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="login-password" className="form-label">Password</label>
              <input
                id="login-password"
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              className="auth-button"
              disabled={submitting}
            >
              {submitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="auth-footer">
            Don't have an account?{' '}
            <Link to="/register" className="auth-link">Create one</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
