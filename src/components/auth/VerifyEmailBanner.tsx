/**
 * VerifyEmailBanner — shown at the top of the office when
 * the user is logged in but has not verified their email.
 */

import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { resendVerification } from '../../api/auth';

export function VerifyEmailBanner() {
  const { user } = useAuth();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Don't render if verified or no user
  if (!user || user.emailVerified) return null;

  const handleResend = async () => {
    setSending(true);
    try {
      await resendVerification();
      setSent(true);
    } catch {
      // Silently fail — user can try again
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 60,
        left: 0,
        right: 0,
        zIndex: 9998,
        background: 'rgba(255, 165, 0, 0.15)',
        borderBottom: '1px solid rgba(255, 165, 0, 0.3)',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        fontSize: 14,
        color: '#ffa500',
        backdropFilter: 'blur(10px)',
      }}
    >
      <span>Please verify your email address to unlock all features.</span>
      {sent ? (
        <span style={{ color: '#4ade80', fontSize: 13 }}>Email sent!</span>
      ) : (
        <button
          onClick={handleResend}
          disabled={sending}
          style={{
            padding: '4px 14px',
            background: 'rgba(255, 165, 0, 0.2)',
            border: '1px solid rgba(255, 165, 0, 0.4)',
            borderRadius: 6,
            color: '#ffa500',
            cursor: sending ? 'wait' : 'pointer',
            fontSize: 13,
          }}
        >
          {sending ? 'Sending...' : 'Resend Email'}
        </button>
      )}
    </div>
  );
}
