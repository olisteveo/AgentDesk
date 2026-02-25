# Agent Desk — Security Assessment

**Date:** 2026-02-25
**Scope:** Full-stack audit (Express/TypeScript backend + React/Vite frontend)
**Status:** All critical and medium issues resolved

---

## Executive Summary

A comprehensive security audit was performed across the entire Agent Desk stack. The application demonstrated a **strong security foundation** with well-implemented encryption, row-level security, rate limiting, and parameterised queries. The audit identified **1 critical vulnerability** and **4 medium-severity gaps**, all of which have been **remediated** as part of this assessment.

| Severity | Found | Fixed | Remaining |
|----------|-------|-------|-----------|
| Critical | 1 | 1 | 0 |
| Medium | 4 | 4 | 0 |
| Low | 4 | 0 | 4 (accepted risk) |

---

## Existing Security Controls (Pre-Audit)

These were already in place and well-implemented before the audit.

### Authentication & Authorisation
- **JWT access tokens** with 15-minute expiry + 7-day refresh tokens
- **bcrypt** password hashing with 12 salt rounds
- **Google OAuth** via official Identity Services library
- **Email verification** with time-limited tokens (24h)
- **Password reset** with time-limited tokens (1h)
- Anti-enumeration: forgot-password always returns 200

### API Key Encryption
- **AES-256-GCM** (authenticated encryption) for provider API keys
- Proper IV (12 bytes) and auth tag (16 bytes) generation
- Keys decrypted on-demand only, never cached or logged
- API keys masked in responses (`••••XXXX`)
- SHA-256 fingerprinting for deduplication

### Row-Level Security (RLS)
- RLS policies on **all 9 major tables** (users, desks, tasks, provider_credentials, ai_usage, whiteboard_notes, meetings, office_sessions, team_rules, chat_messages)
- `app.current_team_id` session variable set per-request
- Complete tenant isolation at the database level

### Rate Limiting
- **Auth endpoints:** 50 req / 15 min per IP
- **Registration:** 3 accounts / hour per IP
- **AI endpoints:** 30 req / min per IP (cost protection)
- **Global API:** 200 req / min per IP
- Budget enforcement middleware on AI-calling routes

### SQL Injection Protection
- **All queries use parameterised statements** (`$1`, `$2` placeholders)
- Dynamic field building uses hardcoded field names with parameterised values
- No raw string concatenation in SQL (with one exception fixed below)

### CORS
- Whitelist-based origin configuration (environment variable)
- No wildcard (`*`) origins
- Safe default for development (`http://localhost:5173`)

### Frontend
- **Zero instances of `dangerouslySetInnerHTML`** — React default escaping throughout
- Safe code block rendering via `parseCodeBlocks()` utility
- Centralised API client with automatic Bearer token attachment
- Auto token refresh with deduplication (prevents race conditions)
- Lean dependency tree (4 production deps, no known CVEs)
- No secrets in client-side code — all API keys managed server-side

---

## Issues Found & Remediated

### CRITICAL: SQL Injection in RLS Middleware

**File:** `agentDesk_backend/src/middleware/rls.ts`
**Severity:** Critical
**Status:** FIXED

**Before (vulnerable):**
```typescript
await client.query(`SET LOCAL app.current_team_id = '${req.user.teamId}'`);
```

String interpolation of `teamId` directly into SQL. Although `teamId` originates from a verified JWT (reducing practical risk), this violated the principle of parameterised queries and would allow SQL injection if JWT validation were ever bypassed or the value corrupted.

**After (fixed):**
```typescript
// Validate UUID format before using in query
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!UUID_RE.test(req.user.teamId)) {
  res.status(400).json({ error: 'Invalid team context' });
  return;
}

// Use parameterised query via set_config() — never interpolate user-derived values
await client.query(`SELECT set_config('app.current_team_id', $1, true)`, [req.user.teamId]);
```

**Defence-in-depth:** Added both UUID format validation AND parameterised query. The `set_config()` function with `true` for `is_local` is equivalent to `SET LOCAL` but supports `$1` parameter binding.

---

### MEDIUM: Missing Security Headers (Helmet)

**File:** `agentDesk_backend/src/index.ts`
**Severity:** Medium
**Status:** FIXED

**Problem:** No security headers were set on HTTP responses. Missing headers included `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Referrer-Policy`, and others.

**Fix:** Installed and configured `helmet` middleware:

```typescript
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: false,        // CSP handled on frontend via meta tag
  crossOriginEmbedderPolicy: false,    // Allow cross-origin resources (AI provider APIs)
}));
```

**Headers now active (verified via `curl -I`):**
| Header | Value |
|--------|-------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `X-DNS-Prefetch-Control` | `off` |
| `X-Download-Options` | `noopen` |
| `X-Permitted-Cross-Domain-Policies` | `none` |
| `Referrer-Policy` | `no-referrer` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `Origin-Agent-Cluster` | `?1` |

---

### MEDIUM: Missing Content Security Policy (CSP)

**File:** `Agent_desk/index.html`
**Severity:** Medium
**Status:** FIXED

**Problem:** No CSP header or meta tag. Without CSP, any injected script can execute freely and load external resources.

**Fix:** Added CSP meta tag to `index.html`:

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src  'self' https://accounts.google.com/gsi/client;
  style-src   'self' 'unsafe-inline';
  img-src     'self' data: https:;
  font-src    'self' data:;
  connect-src 'self' http://localhost:3001 ws://localhost:3001;
  frame-src   https://accounts.google.com;
  form-action 'self';
  base-uri    'self';
" />
```

**Policy breakdown:**
| Directive | Allows | Reason |
|-----------|--------|--------|
| `default-src 'self'` | Same origin only | Baseline lockdown |
| `script-src 'self' accounts.google.com` | App + Google Sign-In | Google Identity Services SDK |
| `style-src 'self' 'unsafe-inline'` | App + inline styles | React CSS-in-JS patterns |
| `img-src 'self' data: https:` | App + data URIs + HTTPS images | Avatar images, external assets |
| `font-src 'self' data:` | App + embedded fonts | Fira Code for code blocks |
| `connect-src 'self' localhost:3001` | API calls + WebSocket | Backend communication |
| `frame-src accounts.google.com` | Google iframes | Google OAuth popup |
| `form-action 'self'` | Same origin only | Prevents form hijacking |
| `base-uri 'self'` | Same origin only | Prevents base tag injection |

**Production note:** Update `connect-src` to the production API domain when deploying.

---

### MEDIUM: No Environment Variable Validation

**File:** `agentDesk_backend/src/index.ts`
**Severity:** Medium
**Status:** FIXED

**Problem:** Missing environment variables caused cryptic runtime errors deep in the call stack (e.g., encryption failures, JWT signing errors) instead of a clear startup failure.

**Fix:** Added startup validation before any imports:

```typescript
const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY'] as const;
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`\x1b[31m✖ Missing required environment variable: ${key}\x1b[0m`);
    process.exit(1);
  }
}
```

Server now fails fast with a clear red error message if any critical secret is missing.

---

## Low-Severity Issues (Accepted Risk)

These are documented for awareness. They are low-impact or require larger architectural changes and are tracked for future sprints.

### 1. No Token Blacklist for Revocation
**Risk:** JWT access tokens remain valid for up to 15 minutes after logout or password change.
**Mitigation:** Short 15-minute access token expiry limits the exposure window.
**Future:** Implement Redis-backed token blacklist for immediate revocation.

### 2. Token Storage in localStorage
**Risk:** If an XSS vulnerability were introduced, localStorage tokens would be readable by malicious scripts.
**Mitigation:** Zero XSS vectors found in current codebase (no `dangerouslySetInnerHTML`, React escaping). CSP now limits script sources.
**Future:** Consider migrating to httpOnly cookies for defence-in-depth.

### 3. No Input Validation Schema Library
**Risk:** Manual validation across routes is inconsistent (e.g., desk names not length-capped).
**Mitigation:** All SQL is parameterised, so injection risk is nil. Business logic errors are bounded.
**Future:** Adopt Zod for schema validation on all route handlers.

### 4. Filename Sanitisation in File Export
**Risk:** Task file export constructs file paths without sanitising user-provided filenames, creating a theoretical path traversal risk.
**Mitigation:** Feature is browser-side download only (Blob + Object URL). Backend file writing is not exposed.
**Future:** Add filename sanitisation if server-side file writes are ever added.

---

## Files Modified

| File | Change |
|------|--------|
| `agentDesk_backend/src/middleware/rls.ts` | Parameterised RLS query + UUID validation |
| `agentDesk_backend/src/index.ts` | Added helmet, env var validation |
| `agentDesk_backend/package.json` | Added `helmet` dependency |
| `Agent_desk/index.html` | Added CSP meta tag |

---

## Security Architecture Summary

```
                        FRONTEND SECURITY
                        ─────────────────
                        ┌──────────────────────────────┐
                        │  Content Security Policy      │ ← NEW
                        │  React XSS escaping (default) │
                        │  Centralised API client       │
                        │  Auto token refresh           │
                        │  No secrets in client code    │
                        └──────────────┬───────────────┘
                                       │ HTTPS
                                       ▼
                        BACKEND SECURITY
                        ────────────────
┌──────────────────────────────────────────────────────────────┐
│  Helmet security headers                                     │ ← NEW
│  CORS whitelist                                              │
│  Rate limiting (auth / AI / global)                          │
│  JWT auth (15min access + 7d refresh)                        │
│  Env var validation at startup                               │ ← NEW
├──────────────────────────────────────────────────────────────┤
│  Parameterised SQL queries (all routes)                      │
│  RLS middleware (parameterised + UUID-validated)              │ ← FIXED
│  Budget enforcement on AI routes                             │
│  Tier limit enforcement on rule creation                     │
├──────────────────────────────────────────────────────────────┤
│  AES-256-GCM API key encryption                              │
│  bcrypt password hashing (12 rounds)                         │
│  Row-Level Security on all tables                            │
└──────────────────────────────────────────────────────────────┘
```

---

## Verification Performed

1. **RLS fix:** Backend rebuilt (`tsc --noEmit` clean), restarted, API calls still work with team isolation
2. **Helmet headers:** Verified via `curl -sI http://localhost:3001/api/health` — all 10 security headers present
3. **CSP:** Frontend built clean (`npm run build`), meta tag present in `dist/index.html`
4. **Env validation:** Tested missing var — server exits with red error message before any listeners start
5. **No regressions:** Both frontend and backend build clean with zero errors

---

## Recommendations for Future Hardening

| Priority | Item | Effort |
|----------|------|--------|
| Short-term | Adopt Zod for input validation on all routes | 2-3 days |
| Short-term | Add `npm audit` to CI pipeline | 30 min |
| Medium-term | Implement Redis-backed token blacklist | 1 day |
| Medium-term | Migrate token storage to httpOnly cookies | 1-2 days |
| Medium-term | Add CSRF token generation/validation | 1 day |
| Long-term | Use AWS KMS / Vault for encryption key management | 1 week |
| Long-term | Implement audit logging for sensitive operations | 2-3 days |
| Long-term | SOC 2 compliance review | External engagement |
