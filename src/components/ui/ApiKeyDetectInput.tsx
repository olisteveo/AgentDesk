/**
 * ApiKeyDetectInput — Paste any API key, auto-detect the provider,
 * validate it, and return the provider + available models.
 *
 * Used by HireWizard (Step 1) and Onboarding (Step 3).
 */

import { useState, useRef, useCallback } from 'react';
import { detectProvider } from '../../api/providers';
import type { ProviderModel } from '../../api/providers';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import './ApiKeyDetectInput.css';

// ── Provider display metadata (for hints + badges) ───────────

const PROVIDER_HINTS = [
  { id: 'openai',    name: 'OpenAI',    url: 'platform.openai.com',      color: '#10a37f' },
  { id: 'anthropic', name: 'Anthropic', url: 'console.anthropic.com',    color: '#d4a574' },
  { id: 'google',    name: 'Google',    url: 'aistudio.google.com',      color: '#4285f4' },
  { id: 'deepseek',  name: 'DeepSeek',  url: 'platform.deepseek.com',    color: '#4d8bf5' },
  { id: 'moonshot',  name: 'Moonshot',  url: 'platform.moonshot.cn',     color: '#8b5cf6' },
];

// ── Types ────────────────────────────────────────────────────

export interface DetectedProvider {
  provider: string;
  apiKey: string;
  models: ProviderModel[];
  warning?: string;
}

interface ApiKeyDetectInputProps {
  /** Called when provider is detected + key is validated successfully */
  onDetected: (result: DetectedProvider) => void;
  /** Show "where to get your key" hint cards below the input */
  showHints?: boolean;
  /** Compact layout (smaller padding/fonts) */
  compact?: boolean;
  /** Optional placeholder override */
  placeholder?: string;
}

type DetectPhase =
  | { phase: 'idle' }
  | { phase: 'detecting'; message: string }
  | { phase: 'success'; provider: string; modelCount: number; warning?: string }
  | { phase: 'error'; message: string };

// ── Component ────────────────────────────────────────────────

export default function ApiKeyDetectInput({
  onDetected,
  showHints = false,
  compact = false,
  placeholder = 'Paste your API key',
}: ApiKeyDetectInputProps) {
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<DetectPhase>({ phase: 'idle' });
  const detectingRef = useRef(0); // generation counter to ignore stale responses

  const runDetect = useCallback(async (key: string) => {
    const trimmed = key.trim();
    if (trimmed.length < 10) return;

    const generation = ++detectingRef.current;
    setStatus({ phase: 'detecting', message: 'Identifying provider...' });

    try {
      const result = await detectProvider(trimmed);

      // Ignore if a newer detect was triggered
      if (generation !== detectingRef.current) return;

      if (result.valid && result.provider) {
        const provName = PROVIDER_HINTS.find(p => p.id === result.provider)?.name || result.provider;
        setStatus({
          phase: result.warning ? 'success' : 'success',
          provider: provName,
          modelCount: result.models.length,
          warning: result.warning,
        });
        onDetected({
          provider: result.provider,
          apiKey: trimmed,
          models: result.models,
          warning: result.warning,
        });
      } else {
        setStatus({ phase: 'error', message: result.error || 'Could not validate key' });
      }
    } catch (err) {
      if (generation !== detectingRef.current) return;
      setStatus({ phase: 'error', message: err instanceof Error ? err.message : 'Detection failed' });
    }
  }, [onDetected]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    // Get the pasted text and run detection immediately
    const pasted = e.clipboardData.getData('text');
    if (pasted.trim().length >= 10) {
      // Set the key (input will update via onChange too)
      setApiKey(pasted.trim());
      runDetect(pasted);
    }
  }, [runDetect]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && apiKey.trim().length >= 10) {
      runDetect(apiKey);
    }
  }, [apiKey, runDetect]);

  const providerColor = (providerId: string) =>
    PROVIDER_HINTS.find(p => p.name === providerId || p.id === providerId)?.color || '#667eea';

  return (
    <div className={`api-detect-wrapper${compact ? ' compact' : ''}`}>
      <div className="api-detect-input-row">
        <input
          type="text"
          className="api-detect-input api-detect-masked"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          data-1p-ignore="true"
          data-lpignore="true"
          data-form-type="other"
          spellCheck={false}
        />
        <div className="api-detect-input-icon">
          {status.phase === 'detecting' && <div className="api-detect-spinner" />}
          {status.phase === 'success' && <CheckCircle size={18} color="#1dd1a1" />}
          {status.phase === 'error' && <XCircle size={18} color="#ff6b6b" />}
        </div>
      </div>

      {/* Status feedback */}
      {status.phase === 'detecting' && (
        <div className="api-detect-status detecting">
          <div className="api-detect-spinner" />
          <span>{status.message}</span>
        </div>
      )}

      {status.phase === 'success' && (
        <div className={`api-detect-status ${status.warning ? 'warning' : 'success'}`}>
          {status.warning
            ? <AlertTriangle size={16} />
            : <CheckCircle size={16} />
          }
          <span className="api-detect-provider-badge" style={{ color: providerColor(status.provider) }}>
            {status.provider}
          </span>
          <span>{status.warning ? status.warning : 'Key validated'}</span>
          <span className="api-detect-models-count">{status.modelCount} models</span>
        </div>
      )}

      {status.phase === 'error' && (
        <div className="api-detect-status error">
          <XCircle size={16} />
          <span>{status.message}</span>
        </div>
      )}

      {/* Provider hint cards */}
      {showHints && (
        <div className="api-detect-hints">
          <div className="api-detect-hints-label">Where to get a key</div>
          <div className="api-detect-hints-grid">
            {PROVIDER_HINTS.map(p => (
              <a
                key={p.id}
                className="api-detect-hint"
                href={`https://${p.url}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="api-detect-hint-dot" style={{ background: p.color }} />
                {p.name}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
