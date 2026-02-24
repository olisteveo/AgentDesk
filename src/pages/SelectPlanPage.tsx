/**
 * SelectPlanPage — shown after email verification in the onboarding funnel.
 * Two-panel layout: Free (left) and Pro (right).
 *
 * Free → continue straight to CEO name/avatar onboarding.
 * Pro  → placeholder for Stripe checkout (scaffolded, not wired yet).
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { selectPlan } from '../api/auth';
import { Check, Zap } from 'lucide-react';
import './auth.css';
import './select-plan.css';

// ── Plan data ───────────────────────────────────────────────

interface PlanDef {
  id: 'free' | 'pro';
  name: string;
  price: string;
  period: string;
  tagline: string;
  cta: string;
  features: string[];
  highlighted?: boolean;
}

const PLANS: PlanDef[] = [
  {
    id: 'free',
    name: 'Starter',
    price: '$0',
    period: 'forever',
    tagline: 'For individuals exploring AI workflows',
    cta: 'Get Started',
    features: [
      '1 user',
      '3 AI agent desks',
      '3 AI provider connections',
      'Basic task management',
      'Basic cost overview',
      'Bring your own API keys',
      'Community support',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$29',
    period: '/month',
    tagline: 'For professionals and small teams',
    cta: 'Start 14-Day Free Trial',
    highlighted: true,
    features: [
      'Up to 5 users',
      '6 AI agent desks',
      '6 AI provider connections',
      'Advanced task management',
      'Full analytics dashboard',
      'Meeting room collaboration',
      'Shared whiteboard',
      'Bring your own API keys',
      'Priority email support',
    ],
  },
];

// ── Component ───────────────────────────────────────────────

export function SelectPlanPage() {
  const navigate = useNavigate();
  const { updateUser } = useAuth();
  const [loading, setLoading] = useState<'free' | 'pro' | null>(null);
  const [error, setError] = useState('');

  const handleSelect = async (planId: 'free' | 'pro') => {
    setLoading(planId);
    setError('');

    try {
      const result = await selectPlan(planId);

      // Update local auth state
      updateUser({ plan: result.plan, planSelected: true });

      if (planId === 'pro') {
        // TODO: redirect to Stripe Checkout when wired
        // For now, treat same as free — go to onboarding
        navigate('/office');
      } else {
        navigate('/office');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to select plan';
      setError(msg);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="auth-page">
      <div className="select-plan-container">
        {/* Header */}
        <div className="select-plan-header">
          <h1 className="select-plan-title">Choose Your Plan</h1>
          <p className="select-plan-subtitle">
            Start free, upgrade when you need more power. Change any time from settings.
          </p>
          <p className="select-plan-byok">
            🔑 All plans are <strong>BYOK</strong> — Bring Your Own Keys. You connect your own AI provider API keys. We never charge for AI usage, only for workspace features.
          </p>
        </div>

        {error && (
          <div className="form-error-global" style={{ marginBottom: 20, textAlign: 'center' }}>
            {error}
          </div>
        )}

        {/* Plan cards */}
        <div className="select-plan-grid">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`select-plan-card${plan.highlighted ? ' select-plan-card--pro' : ''}`}
            >
              {plan.highlighted && (
                <div className="select-plan-badge">
                  <Zap size={12} /> POPULAR
                </div>
              )}

              <h2 className="select-plan-card-name">{plan.name}</h2>

              <div className="select-plan-card-price">
                <span className="select-plan-card-amount">{plan.price}</span>
                <span className="select-plan-card-period">{plan.period}</span>
              </div>

              <p className="select-plan-card-tagline">{plan.tagline}</p>

              <ul className="select-plan-card-features">
                {plan.features.map((f) => (
                  <li key={f}>
                    <Check size={15} strokeWidth={2.5} className="select-plan-check" />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                className={`select-plan-card-btn${plan.highlighted ? ' select-plan-card-btn--pro' : ''}`}
                onClick={() => handleSelect(plan.id)}
                disabled={loading !== null}
              >
                {loading === plan.id ? 'Setting up...' : plan.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
