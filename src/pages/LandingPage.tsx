/**
 * LandingPage — public marketing page for Agent Desk.
 *
 * Sections: Nav · Hero · Features · How-it-works · Preview · CTA · Footer
 * If the user is already authenticated the nav shows "Open Office" instead
 * of Sign-In / Get-Started.
 */

import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Cpu,
  BarChart3,
  ClipboardCheck,
  MessagesSquare,
  Users,
  Plug,
  ListTodo,
  TrendingUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import './landing.css';

// ── Section data ────────────────────────────────────────────

const FEATURES: { icon: LucideIcon; title: string; desc: string }[] = [
  {
    icon: Cpu,
    title: 'Multi-Model Support',
    desc: 'Connect OpenAI, Anthropic, Google Gemini and more — each desk can run a different model with its own API key.',
  },
  {
    icon: BarChart3,
    title: 'Real-Time Cost Tracking',
    desc: 'Monitor spend per desk, per user, per model. Set budget limits and get alerts before you overshoot.',
  },
  {
    icon: ClipboardCheck,
    title: 'Task Management',
    desc: 'Assign tasks to AI agents, set priorities, and watch them execute in real-time from your virtual office.',
  },
  {
    icon: MessagesSquare,
    title: 'Meeting Room',
    desc: 'Bring multiple AI agents together in one conversation. Upload files for shared context and let them collaborate.',
  },
];

const STEPS: { icon: LucideIcon; title: string; desc: string }[] = [
  {
    icon: Users,
    title: 'Create Your Team',
    desc: 'Sign up in seconds and invite your teammates. Each team gets its own private virtual office.',
  },
  {
    icon: Plug,
    title: 'Connect AI Models',
    desc: 'Add API keys for the providers you use — OpenAI, Anthropic, Google — and assign models to desks.',
  },
  {
    icon: ListTodo,
    title: 'Assign Tasks to Agents',
    desc: 'Give your AI agents work to do. Set priorities, deadlines, and context — then let them get to it.',
  },
  {
    icon: TrendingUp,
    title: 'Track & Optimise',
    desc: 'Use the cost dashboard and usage analytics to keep spending in check and optimise model choices.',
  },
];

const FOOTER_LINKS = [
  { label: 'About', href: '#' },
  { label: 'Docs', href: '#' },
  { label: 'Pricing', href: '#' },
  { label: 'Contact', href: '#' },
  { label: 'Terms', href: '#' },
  { label: 'Privacy', href: '#' },
] as const;

// ── Component ───────────────────────────────────────────────

export function LandingPage() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="landing-page">
      {/* ── Nav ──────────────────────────────────────── */}
      <nav className="landing-nav">
        <Link to="/" className="landing-nav-brand">
          <img
            src="/assets/office-logo.png"
            alt="Agent Desk"
            className="landing-nav-logo"
          />
          <span className="landing-nav-title">Agent Desk</span>
        </Link>

        <div className="landing-nav-actions">
          {isAuthenticated ? (
            <Link to="/office" className="landing-btn landing-btn--primary">
              Open Office
            </Link>
          ) : (
            <>
              <Link to="/login" className="landing-btn landing-btn--secondary">
                Sign In
              </Link>
              <Link to="/register" className="landing-btn landing-btn--primary">
                Get Started
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────── */}
      <header className="landing-hero">
        <h1 className="landing-hero-title">
          Your AI Team,{' '}
          <span className="landing-hero-accent">Visualised</span>
        </h1>
        <p className="landing-hero-subtitle">
          A virtual office for your AI agents. Assign tasks, track costs,
          and collaborate across models — all in one place.
        </p>
        <div className="landing-hero-cta">
          {isAuthenticated ? (
            <Link to="/office" className="landing-btn landing-btn--primary landing-btn--large">
              Enter Your Office
            </Link>
          ) : (
            <>
              <Link
                to="/register"
                className="landing-btn landing-btn--primary landing-btn--large"
              >
                Get Started — Free
              </Link>
              <Link
                to="/login"
                className="landing-btn landing-btn--secondary landing-btn--large"
              >
                Sign In
              </Link>
            </>
          )}
        </div>
      </header>

      {/* ── Features ─────────────────────────────────── */}
      <section className="landing-section">
        <h2 className="landing-section-title">Everything You Need</h2>
        <p className="landing-section-subtitle">
          Powerful tools to manage your AI workforce
        </p>

        <div className="landing-features-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="landing-feature-card">
              <div className="landing-feature-icon-wrap">
                <f.icon size={24} strokeWidth={1.8} />
              </div>
              <h3 className="landing-feature-title">{f.title}</h3>
              <p className="landing-feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────── */}
      <section className="landing-section">
        <h2 className="landing-section-title">How It Works</h2>
        <p className="landing-section-subtitle">
          Up and running in minutes, not hours
        </p>

        <div className="landing-steps">
          {STEPS.map((s, i) => (
            <div key={s.title} className="landing-step">
              <div className="landing-step-icon-wrap">
                <span className="landing-step-num-badge">{i + 1}</span>
                <s.icon size={22} strokeWidth={1.8} />
              </div>
              <div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Preview ──────────────────────────────────── */}
      <div className="landing-preview-wrapper">
        <h2 className="landing-section-title">See It In Action</h2>
        <img
          src="/assets/office-logo.png"
          alt="Agent Desk preview"
          className="landing-preview-img"
        />
      </div>

      {/* ── CTA Banner ───────────────────────────────── */}
      <section className="landing-cta-banner">
        <h2>Ready to Build Your AI Team?</h2>
        <p>Start for free — no credit card required.</p>
        {isAuthenticated ? (
          <Link to="/office" className="landing-btn landing-btn--primary landing-btn--large">
            Go to Office
          </Link>
        ) : (
          <Link
            to="/register"
            className="landing-btn landing-btn--primary landing-btn--large"
          >
            Create Your Team
          </Link>
        )}
      </section>

      {/* ── Footer ───────────────────────────────────── */}
      <footer className="landing-footer">
        <div className="landing-footer-links">
          {FOOTER_LINKS.map((l) => (
            <a key={l.label} href={l.href} className="landing-footer-link">
              {l.label}
            </a>
          ))}
        </div>
        <span className="landing-footer-copy">
          &copy; {new Date().getFullYear()} Agent Desk. All rights reserved.
        </span>
      </footer>
    </div>
  );
}
