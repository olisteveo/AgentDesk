/**
 * RegisterPage — creates a new team + owner account.
 * Fields: team name, display name, email, password, confirm password.
 * On success, auto-logs in and redirects to /office.
 */

import { useState, type FormEvent, type ChangeEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { GoogleSignInButton } from '../components/auth/GoogleSignInButton';
import { containsProfanity } from '../utils/profanityFilter';
import type { ApiError } from '../api/client';
import './auth.css';

// ── Form state ───────────────────────────────────────────────

interface FormFields {
  teamName: string;
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

const INITIAL_FIELDS: FormFields = {
  teamName: '',
  displayName: '',
  email: '',
  password: '',
  confirmPassword: '',
};

// ── Validation ───────────────────────────────────────────────

function validate(fields: FormFields): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!fields.teamName.trim()) {
    errors.teamName = 'Team name is required';
  } else if (containsProfanity(fields.teamName)) {
    errors.teamName = 'Please choose an appropriate team name';
  }

  if (!fields.displayName.trim()) {
    errors.displayName = 'Display name is required';
  } else if (containsProfanity(fields.displayName)) {
    errors.displayName = 'Please choose an appropriate name';
  }

  if (!fields.email.trim()) {
    errors.email = 'Email is required';
  } else if (!/\S+@\S+\.\S+/.test(fields.email)) {
    errors.email = 'Invalid email address';
  }

  if (!fields.password) {
    errors.password = 'Password is required';
  } else if (fields.password.length < 8) {
    errors.password = 'Must be at least 8 characters';
  } else if (!/[A-Z]/.test(fields.password)) {
    errors.password = 'Must include an uppercase letter';
  } else if (!/[a-z]/.test(fields.password)) {
    errors.password = 'Must include a lowercase letter';
  } else if (!/[0-9]/.test(fields.password)) {
    errors.password = 'Must include a number';
  }

  if (fields.password !== fields.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match';
  }

  return errors;
}

// ── Component ────────────────────────────────────────────────

export function RegisterPage() {
  const navigate = useNavigate();
  const { register, googleLogin, isAuthenticated, isLoading: authLoading } = useAuth();

  const [fields, setFields] = useState<FormFields>(INITIAL_FIELDS);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!authLoading && isAuthenticated) {
    return <Navigate to="/office" replace />;
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFields((prev) => ({ ...prev, [name]: value }));
    // Clear field error on change
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setGlobalError('');

    const errors = validate(fields);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      await register({
        teamName: fields.teamName,
        displayName: fields.displayName,
        email: fields.email,
        password: fields.password,
      });
      navigate('/office');
    } catch (err) {
      const apiErr = err as ApiError;
      setGlobalError(apiErr.message || 'Registration failed. Please try again.');
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
          <h1 className="auth-title">Create Your Team</h1>
          <p className="auth-subtitle">Get started with Agent Desk</p>

          {globalError && <div className="form-error-global">{globalError}</div>}

          {/* Google Sign-Up */}
          <GoogleSignInButton
            onSuccess={async (credential) => {
              setGlobalError('');
              setSubmitting(true);
              try {
                await googleLogin(credential);
                navigate('/office');
              } catch (err) {
                const apiErr = err as ApiError;
                setGlobalError(apiErr.message || 'Google sign-up failed.');
              } finally {
                setSubmitting(false);
              }
            }}
            label="Sign up with Google"
          />

          <div className="auth-divider">
            <span>or</span>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <Field
              id="teamName"
              label="Team Name"
              placeholder="Acme Corp"
              value={fields.teamName}
              error={fieldErrors.teamName}
              onChange={handleChange}
              autoFocus
            />

            <Field
              id="displayName"
              label="Your Name"
              placeholder="John Doe"
              value={fields.displayName}
              error={fieldErrors.displayName}
              onChange={handleChange}
            />

            <Field
              id="email"
              label="Email"
              type="email"
              placeholder="you@company.com"
              value={fields.email}
              error={fieldErrors.email}
              onChange={handleChange}
              autoComplete="email"
            />

            <Field
              id="password"
              label="Password"
              type="password"
              placeholder="••••••••"
              value={fields.password}
              error={fieldErrors.password}
              hint="Min 8 characters, with uppercase, lowercase & a number"
              onChange={handleChange}
              autoComplete="new-password"
            />

            <Field
              id="confirmPassword"
              label="Confirm Password"
              type="password"
              placeholder="••••••••"
              value={fields.confirmPassword}
              error={fieldErrors.confirmPassword}
              onChange={handleChange}
              autoComplete="new-password"
            />

            <button
              type="submit"
              className="auth-button"
              disabled={submitting}
            >
              {submitting ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <div className="auth-footer">
            Already have an account?{' '}
            <Link to="/login" className="auth-link">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Reusable field component ─────────────────────────────────

interface FieldProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  error?: string;
  hint?: string;
  type?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}

function Field({
  id,
  label,
  placeholder,
  value,
  error,
  hint,
  type = 'text',
  autoComplete,
  autoFocus,
  onChange,
}: FieldProps) {
  return (
    <div className="form-group">
      <label htmlFor={id} className="form-label">{label}</label>
      <input
        id={id}
        name={id}
        type={type}
        className="form-input"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        required
      />
      {hint && !error && <span className="form-hint">{hint}</span>}
      {error && <span className="form-error">{error}</span>}
    </div>
  );
}
