/**
 * GoogleSignInButton — custom-styled button that triggers
 * Google One Tap / popup sign-in flow.
 *
 * Uses a hidden Google-rendered button and triggers its click
 * programmatically, so we get full control over styling while
 * keeping the official GIS credential flow.
 */

import { useEffect, useRef, useCallback, useState } from 'react';

interface GoogleCredentialResponse {
  credential: string;
  select_by: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (el: HTMLElement, config: Record<string, unknown>) => void;
        };
      };
    };
  }
}

interface Props {
  onSuccess: (credential: string) => void;
  onError?: () => void;
  label?: string;
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const GOOGLE_SVG = (
  <svg width="20" height="20" viewBox="0 0 48 48">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>
);

export function GoogleSignInButton({ onSuccess, onError, label = 'Continue with Google' }: Props) {
  const hiddenRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  const handleCallback = useCallback(
    (response: GoogleCredentialResponse) => {
      if (response.credential) {
        onSuccess(response.credential);
      } else {
        onError?.();
      }
    },
    [onSuccess, onError],
  );

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    function init() {
      if (!window.google || !hiddenRef.current) return;

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCallback,
      });

      // Render invisible Google button — we click it programmatically
      window.google.accounts.id.renderButton(hiddenRef.current, {
        type: 'icon',
        size: 'large',
      });

      setReady(true);
    }

    const existing = document.getElementById('google-gsi');
    if (!existing) {
      const script = document.createElement('script');
      script.id = 'google-gsi';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        // Small delay to let Google fully initialize
        setTimeout(init, 200);
      };
      document.head.appendChild(script);
    } else {
      setTimeout(init, 200);
    }
  }, [handleCallback]);

  if (!GOOGLE_CLIENT_ID) return null;

  const handleClick = () => {
    // Find and click the hidden Google button's inner div/iframe
    const googleBtn = hiddenRef.current?.querySelector('[role="button"]') as HTMLElement
      ?? hiddenRef.current?.querySelector('div[style]') as HTMLElement;
    if (googleBtn) {
      googleBtn.click();
    }
  };

  return (
    <>
      {/* Hidden real Google button */}
      <div
        ref={hiddenRef}
        style={{
          position: 'absolute',
          opacity: 0,
          pointerEvents: 'none',
          width: 0,
          height: 0,
          overflow: 'hidden',
        }}
      />

      {/* Our custom styled button — dark blue glass to match auth theme */}
      <button
        type="button"
        onClick={handleClick}
        disabled={!ready}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: '14px 20px',
          background: 'rgba(15, 15, 40, 0.8)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(102, 126, 234, 0.25)',
          borderRadius: 12,
          color: '#c8d0e8',
          fontSize: 15,
          fontWeight: 500,
          cursor: ready ? 'pointer' : 'wait',
          transition: 'all 0.25s ease',
          letterSpacing: '0.02em',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(25, 25, 60, 0.9)';
          e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.45)';
          e.currentTarget.style.boxShadow = '0 6px 24px rgba(102, 126, 234, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.06)';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(15, 15, 40, 0.8)';
          e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.25)';
          e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.04)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        {GOOGLE_SVG}
        {label}
      </button>
    </>
  );
}
