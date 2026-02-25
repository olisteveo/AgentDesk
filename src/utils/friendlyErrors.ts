/**
 * Transforms raw backend / AI-provider error messages into
 * user-friendly text suitable for display in the Live Feed
 * and Activity Log.
 *
 * Raw messages typically look like:
 *   "AI provider call failed: Anthropic error (400): {\"type\":\"error\", ...}"
 *
 * This module parses them into something a user can act on, e.g.:
 *   "Your Anthropic credit balance is too low. Top up at console.anthropic.com."
 */

// ── Pattern-based rules ────────────────────────────────────────
// Each rule: [test, friendly message].
// First match wins. Order matters -- put specific patterns before generic ones.

type Rule = {
  test: (raw: string) => boolean;
  message: string | ((raw: string) => string);
};

const RULES: Rule[] = [
  // ── Missing credentials ──────────────────────────────────────
  {
    test: (r) => r.includes('No active') && r.includes('credential'),
    message: 'No API key found for this provider. Go to Hire Agent > Manage to add one.',
  },

  // ── Billing / credits / quota ────────────────────────────────
  {
    test: (r) =>
      r.includes('credit balance') ||
      r.includes('balance is too low') ||
      r.includes('billing') && r.includes('credits'),
    message: (raw) => {
      const provider = extractProvider(raw);
      return provider
        ? `Your ${provider} account has insufficient credits. Please top up or add billing at your provider dashboard.`
        : 'Your API key has insufficient credits. Please top up or add billing at your provider dashboard.';
    },
  },
  {
    test: (r) =>
      r.includes('exceeded') ||
      r.includes('quota') ||
      r.includes('insufficient') ||
      r.includes('rate_limit') ||
      r.includes('rate limit'),
    message: (raw) => {
      const provider = extractProvider(raw);
      return provider
        ? `${provider} quota or rate limit reached. Check your plan at your provider dashboard.`
        : 'API quota or rate limit reached. Check your plan at your provider dashboard.';
    },
  },

  // ── Invalid / revoked key ────────────────────────────────────
  {
    test: (r) =>
      r.includes('Invalid API key') ||
      r.includes('Incorrect API key') ||
      r.includes('invalid_api_key') ||
      r.includes('invalid x-api-key') ||
      r.includes('authentication_error'),
    message: 'Invalid API key. Check or replace your key in Hire Agent > Manage.',
  },

  // ── Kimi Code key mismatch ───────────────────────────────────
  {
    test: (r) => r.includes('Kimi Code key') || r.includes('sk-kimi-'),
    message: 'Kimi Code keys only work in coding agents. Add a Moonshot platform key instead.',
  },

  // ── Model not found / not available ──────────────────────────
  {
    test: (r) =>
      r.includes('model_not_found') ||
      r.includes('does not exist') ||
      r.includes('not found') && r.includes('model'),
    message: (raw) => {
      const modelMatch = raw.match(/model[:\s]+["']?([a-z0-9\-_.]+)/i);
      return modelMatch
        ? `Model "${modelMatch[1]}" is not available. It may require a different plan or API key.`
        : 'The requested model is not available. It may require a different plan or API key.';
    },
  },

  // ── Overloaded / server errors ───────────────────────────────
  {
    test: (r) =>
      r.includes('overloaded') ||
      r.includes('503') ||
      r.includes('529') ||
      r.includes('capacity'),
    message: (raw) => {
      const provider = extractProvider(raw);
      return provider
        ? `${provider} is currently overloaded. Try again in a moment.`
        : 'The AI provider is currently overloaded. Try again in a moment.';
    },
  },

  // ── Timeout ──────────────────────────────────────────────────
  {
    test: (r) =>
      r.includes('timeout') ||
      r.includes('ETIMEDOUT') ||
      r.includes('ECONNRESET'),
    message: 'Request timed out. The provider may be slow -- try again.',
  },

  // ── Network / connection errors ──────────────────────────────
  {
    test: (r) =>
      r.includes('ENOTFOUND') ||
      r.includes('ECONNREFUSED') ||
      r.includes('fetch failed') ||
      r.includes('network'),
    message: 'Could not reach the AI provider. Check your internet connection.',
  },

  // ── Content policy / safety ──────────────────────────────────
  {
    test: (r) =>
      r.includes('content_policy') ||
      r.includes('content_filter') ||
      r.includes('safety') && r.includes('blocked'),
    message: 'The request was blocked by the provider\'s content policy. Try rephrasing your task.',
  },

  // ── Context length exceeded ──────────────────────────────────
  {
    test: (r) =>
      r.includes('context_length') ||
      r.includes('maximum context') ||
      r.includes('too many tokens') ||
      r.includes('max_tokens'),
    message: 'The request is too long for this model. Try a shorter prompt or a model with a larger context window.',
  },
];

// ── Helpers ────────────────────────────────────────────────────

/** Try to extract a provider name from the raw error string. */
function extractProvider(raw: string): string | null {
  const lower = raw.toLowerCase();
  if (lower.includes('openai')) return 'OpenAI';
  if (lower.includes('anthropic')) return 'Anthropic';
  if (lower.includes('google') || lower.includes('gemini')) return 'Google';
  if (lower.includes('moonshot') || lower.includes('kimi')) return 'Moonshot';
  return null;
}

/**
 * Try to extract a human-readable `message` field from a JSON error body
 * embedded in the raw string. Provider responses often include a nested
 * `"message": "..."` field with the useful text.
 */
function extractJsonMessage(raw: string): string | null {
  // Look for {"message":"..."} or {"error":{"message":"..."}}
  const msgMatch = raw.match(/"message"\s*:\s*"([^"]+)"/);
  return msgMatch ? msgMatch[1] : null;
}

// ── Main export ────────────────────────────────────────────────

/**
 * Convert a raw error message into a user-friendly string.
 *
 * @param raw - The raw error message (from `err.message` or backend response).
 * @returns A clean, actionable message suitable for UI display.
 */
export function friendlyError(raw: string): string {
  // Run through pattern rules
  for (const rule of RULES) {
    if (rule.test(raw)) {
      return typeof rule.message === 'function' ? rule.message(raw) : rule.message;
    }
  }

  // Fallback: try to extract a JSON message field from the raw string
  const jsonMsg = extractJsonMessage(raw);
  if (jsonMsg) {
    const provider = extractProvider(raw);
    return provider ? `${provider}: ${jsonMsg}` : jsonMsg;
  }

  // Last resort: strip the "AI provider call failed:" prefix if present
  const stripped = raw
    .replace(/^AI provider call failed:\s*/i, '')
    .replace(/^\w+ (API )?error \(\d+\):\s*/i, '');

  // If still looks like raw JSON, give a generic message
  if (stripped.startsWith('{') || stripped.startsWith('[')) {
    const provider = extractProvider(raw);
    return provider
      ? `${provider} returned an error. Check your API key and billing.`
      : 'The AI provider returned an error. Check your API key and billing.';
  }

  return stripped || 'Something went wrong. Please try again.';
}
