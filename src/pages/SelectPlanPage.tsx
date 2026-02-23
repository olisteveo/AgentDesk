/**
 * SelectPlanPage — shown after email verification.
 * User picks a plan (free / pro / enterprise) before entering the office.
 *
 * For now this stores the choice via API. Stripe checkout will be
 * wired up later — free tier goes straight through, paid tiers
 * will redirect to Stripe Checkout.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest } from '../api/client';
import './auth.css';

// ── Plan data ───────────────────────────────────────────────

interface PlanOption {
  id: 'free' | 'pro' | 'enterprise';
  name: string;
  price: string;
  period: string;
  features: string[];
  highlight?: boolean;
  cta: string;
}

const PLANS: PlanOption[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    cta: 'Get Started',
    features: [
      '2 AI desks',
      '1 team member',
      '$50/mo budget cap',
      'Basic analytics',
      'Community support',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$29',
    period: '/month',
    cta: 'Start Pro Trial',
    highlight: true,
    features: [
      '10 AI desks',
      '5 team members',
      '$500/mo budget cap',
      'Advanced analytics',
      'Meeting room access',
      'Whiteboard (5 tabs)',
      'Priority support',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '$99',
    period: '/month',
    cta: 'Contact Sales',
    features: [
      'Unlimited AI desks',
      'Unlimited team members',
      'Custom budget limits',
      'Full analytics suite',
      'Meeting room + recording',
      'Unlimited whiteboards',
      'SSO & audit logs',
      'Dedicated support',
    ],
  },
];

// ── Component ───────────────────────────────────────────────

export function SelectPlanPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selected, setSelected] = useState<PlanOption['id']>('free');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleContinue = async () => {
    setLoading(true);
    setError('');

    try {
      // Update team plan via API
      await apiRequest('/api/team', {
        method: 'PATCH',
        body: JSON.stringify({ plan: selected }),
      });

      // Update local user state
      if (user) {
        const stored = localStorage.getItem('user');
        if (stored) {
          const parsed = JSON.parse(stored);
          parsed.plan = selected;
          localStorage.setItem('user', JSON.stringify(parsed));
        }
      }

      navigate('/office');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to set plan';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div style={{ maxWidth: 900, width: '100%', padding: '0 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 className="auth-title" style={{ fontSize: 28 }}>
            Choose Your Plan
          </h1>
          <p style={{ color: '#888', fontSize: 15 }}>
            You can upgrade or downgrade at any time from your office settings.
          </p>
        </div>

        {error && (
          <p style={{ color: '#ff6b6b', textAlign: 'center', marginBottom: 16 }}>
            {error}
          </p>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: 20,
            marginBottom: 32,
          }}
        >
          {PLANS.map((plan) => (
            <button
              key={plan.id}
              onClick={() => setSelected(plan.id)}
              style={{
                background:
                  selected === plan.id
                    ? 'rgba(102, 126, 234, 0.12)'
                    : 'rgba(255,255,255,0.03)',
                border:
                  selected === plan.id
                    ? '2px solid #667eea'
                    : '1px solid #333',
                borderRadius: 12,
                padding: 28,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {plan.highlight && (
                <div
                  style={{
                    position: 'absolute',
                    top: 12,
                    right: -28,
                    background: 'linear-gradient(135deg, #667eea, #764ba2)',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '4px 32px',
                    transform: 'rotate(45deg)',
                  }}
                >
                  POPULAR
                </div>
              )}

              <h3
                style={{
                  color: '#fff',
                  fontSize: 18,
                  margin: '0 0 8px',
                  fontWeight: 600,
                }}
              >
                {plan.name}
              </h3>

              <div style={{ marginBottom: 20 }}>
                <span style={{ color: '#fff', fontSize: 32, fontWeight: 700 }}>
                  {plan.price}
                </span>
                <span style={{ color: '#888', fontSize: 14, marginLeft: 4 }}>
                  {plan.period}
                </span>
              </div>

              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {plan.features.map((f) => (
                  <li
                    key={f}
                    style={{
                      color: '#bbb',
                      fontSize: 14,
                      padding: '5px 0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span style={{ color: '#667eea' }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>

        <div style={{ textAlign: 'center' }}>
          <button
            className="auth-submit"
            onClick={handleContinue}
            disabled={loading}
            style={{ minWidth: 220, fontSize: 16, padding: '14px 32px' }}
          >
            {loading ? 'Setting up...' : `Continue with ${PLANS.find((p) => p.id === selected)?.name}`}
          </button>
        </div>
      </div>
    </div>
  );
}
