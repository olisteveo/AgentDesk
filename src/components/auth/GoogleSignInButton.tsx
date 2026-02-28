/**
 * GoogleSignInButton — robust Google sign-in with automatic fallback.
 *
 * Strategy:
 *   1. Try loading the official GIS library (accounts.google.com/gsi/client)
 *   2. If GIS loads → use its popup credential flow (best UX)
 *   3. If GIS is blocked (ad-blocker, extension, etc.) → fall back to
 *      a manual OAuth popup that doesn't depend on any Google scripts
 *
 * The button is ALWAYS clickable — never silently disabled.
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
          prompt: (callback?: (notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => void) => void;
        };
      };
    };
    __googleOAuthCallback?: (response: GoogleCredentialResponse) => void;
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

type ButtonState = 'loading' | 'ready' | 'blocked';

export function GoogleSignInButton({ onSuccess, onError, label = 'Continue with Google' }: Props) {
  const hiddenRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ButtonState>('loading');

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

    let timeout: ReturnType<typeof setTimeout>;

    function init() {
      if (!window.google || !hiddenRef.current) {
        setState('blocked');
        return;
      }

      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleCallback,
          ux_mode: 'popup',
        });

        window.google.accounts.id.renderButton(hiddenRef.current, {
          type: 'icon',
          size: 'large',
        });

        setState('ready');
      } catch {
        setState('blocked');
      }
    }

    // If GIS doesn't load within 3s, mark as blocked (ad blocker, etc.)
    timeout = setTimeout(() => {
      if (!window.google) {
        setState('blocked');
      }
    }, 3000);

    const existing = document.getElementById('google-gsi');
    if (!existing) {
      const script = document.createElement('script');
      script.id = 'google-gsi';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        clearTimeout(timeout);
        setTimeout(init, 200);
      };
      script.onerror = () => {
        clearTimeout(timeout);
        setState('blocked');
      };
      document.head.appendChild(script);
    } else if (window.google) {
      clearTimeout(timeout);
      setTimeout(init, 200);
    }

    return () => clearTimeout(timeout);
  }, [handleCallback]);

  if (!GOOGLE_CLIENT_ID) return null;

  const handleClick = () => {
    if (state === 'ready') {
      // GIS is loaded — try clicking the hidden rendered button
      const googleBtn = hiddenRef.current?.querySelector('[role="button"]') as HTMLElement
        ?? hiddenRef.current?.querySelector('div[style]') as HTMLElement;
      if (googleBtn) {
        googleBtn.click();
      } else {
        // renderButton didn't create a clickable element — fall back to prompt
        try {
          window.google?.accounts.id.prompt();
        } catch {
          // prompt failed — fall through to direct OAuth
          openOAuthPopup();
        }
      }
    } else {
      // GIS blocked or still loading — use direct OAuth popup (no Google scripts needed)
      openOAuthPopup();
    }
  };

  /** Direct OAuth popup — works even when GIS is blocked by ad-blockers */
  const openOAuthPopup = () => {
    const redirectUri = window.location.origin;
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'id_token',
      scope: 'openid email profile',
      nonce: crypto.randomUUID(),
    });

    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      'google-oauth',
      `width=${width},height=${height},left=${left},top=${top},popup=true`,
    );

    if (!popup) {
      onError?.();
      return;
    }

    // Poll for the redirect back with the id_token in the hash
    const interval = setInterval(() => {
      try {
        if (popup.closed) {
          clearInterval(interval);
          return;
        }
        const popupUrl = popup.location.href;
        if (popupUrl.startsWith(redirectUri)) {
          clearInterval(interval);
          const hash = popup.location.hash.substring(1);
          const hashParams = new URLSearchParams(hash);
          const idToken = hashParams.get('id_token');
          popup.close();
          if (idToken) {
            onSuccess(idToken);
          } else {
            onError?.();
          }
        }
      } catch {
        // Cross-origin — popup hasn't redirected back yet, keep polling
      }
    }, 200);

    // Safety timeout — stop polling after 2 minutes
    setTimeout(() => clearInterval(interval), 120_000);
  };

  return (
    <>
      {/* Hidden real Google button (used when GIS loads) */}
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

      {/* Our custom styled button — always clickable */}
      <button
        type="button"
        onClick={handleClick}
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
          cursor: 'pointer',
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
