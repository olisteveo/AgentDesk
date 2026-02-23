# Agent Desk — Database Plan

> PostgreSQL + Express API — AES-256-GCM encrypted API key storage
> Last updated: 2026-02-23

---

## 1. Architecture Overview

```
Browser (React)
    │
    ▼
Express API (Node.js)
    ├── JWT Authentication (access + refresh tokens)
    ├── AES-256-GCM encryption layer (API keys)
    ├── Stripe webhooks (billing)
    ├── WebSocket server (real-time office sync)
    └── AI Proxy (decrypt key → forward to provider → track usage)
    │
    ▼
PostgreSQL 16
    ├── Row-Level Security (team isolation)
    ├── Materialized views (cost aggregation)
    └── pgcrypto extension (UUID generation)
```

---

## 2. Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                          TEAMS                              │
├─────────────────────────────────────────────────────────────┤
│ PK  id                    UUID                              │
│     name                  VARCHAR(100)    NOT NULL           │
│ UK  slug                  VARCHAR(100)    NOT NULL           │
│     plan                  plan_tier       DEFAULT 'free'     │
│     max_desks             INT             DEFAULT 2          │
│     monthly_budget_usd    DECIMAL(10,2)   DEFAULT 50.00      │
│     billing_email         VARCHAR(255)                       │
│     stripe_customer_id    VARCHAR(100)                       │
│     stripe_subscription_id VARCHAR(100)                      │
│     created_at            TIMESTAMPTZ     DEFAULT now()      │
│     updated_at            TIMESTAMPTZ     DEFAULT now()      │
└─────────────────────────────────────────────────────────────┘
           │
           │ 1:N
           ▼
┌──────────────────────┐  ┌──────────────────────────┐  ┌──────────────────────┐
│        USERS         │  │  PROVIDER_CREDENTIALS    │  │        DESKS         │
├──────────────────────┤  ├──────────────────────────┤  ├──────────────────────┤
│ PK  id           UUID│  │ PK  id               UUID│  │ PK  id           UUID│
│ FK  team_id      UUID│  │ FK  team_id          UUID│  │ FK  team_id      UUID│
│ UK  email    VARCHAR │  │     provider     VARCHAR │  │     name     VARCHAR │
│     password_hash    │  │     api_key_encrypted    │  │     desk_type desk_t │
│     display_name     │  │     api_key_iv      TEXT │  │     avatar_id VARCHAR│
│     avatar_id VARCHAR│  │     api_key_tag     TEXT │  │     model_id VARCHAR │
│     role      user_r │  │     key_fingerprint      │  │     agent_name       │
│     timezone VARCHAR │  │     is_active   BOOLEAN  │  │     agent_color      │
│     preferences JSONB│  │     rate_limit_per_min   │  │     sort_order   INT │
│     onboarding_done  │  │     last_used_at         │  │     is_active BOOLEAN│
│     last_login       │  │     created_at           │  │     created_at       │
│     created_at       │  │     updated_at           │  │     updated_at       │
│     updated_at       │  └──────────────────────────┘  └──────────────────────┘
└──────────────────────┘           │                             │
         │                        │ 1:N                         │ 1:N
         │ 1:N                    ▼                             ▼
         ▼               ┌──────────────────┐          ┌──────────────────┐
┌──────────────────┐     │     AI_USAGE     │          │      TASKS       │
│ WHITEBOARD_NOTES │     ├──────────────────┤          ├──────────────────┤
├──────────────────┤     │ PK  id       UUID│          │ PK  id       UUID│
│ PK  id       UUID│     │ FK  team_id  UUID│          │ FK  team_id  UUID│
│ FK  team_id  UUID│     │ FK  user_id  UUID│          │ FK  desk_id  UUID│
│     tab  VARCHAR │     │ FK  cred_id  UUID│          │     title VARCHAR│
│     content TEXT │     │     provider      │          │     description  │
│     color VARCHAR│     │     model         │          │     status task_s│
│ FK  created_by   │     │     input_tokens  │          │     cost_usd     │
│     created_at   │     │     output_tokens │          │     model_used   │
│     updated_at   │     │     cost_usd      │          │     result JSONB │
└──────────────────┘     │     task_id       │          │     created_at   │
                         │     created_at    │          │     completed_at │
                         └──────────────────┘          └──────────────────┘

┌──────────────────────┐  ┌──────────────────────┐
│      MEETINGS        │  │   OFFICE_SESSIONS    │
├──────────────────────┤  ├──────────────────────┤
│ PK  id           UUID│  │ PK  id           UUID│
│ FK  team_id      UUID│  │ FK  team_id      UUID│
│ FK  started_by   UUID│  │ FK  user_id      UUID│
│     topic    VARCHAR │  │     socket_id VARCHAR│
│     participants TEXT│  │     canvas_state JSONB│
│     messages   JSONB │  │     last_activity    │
│     status  meet_s   │  │     created_at       │
│     started_at       │  └──────────────────────┘
│     ended_at         │
│     created_at       │
└──────────────────────┘
```

---

## 3. Tier System & Desk Limits

These limits are enforced **server-side** on every desk creation request.

| Feature                   | Free     | Pro ($20/mo) | Enterprise ($50/mo) |
|---------------------------|----------|--------------|---------------------|
| Max desks                 | 2        | 6            | 20                  |
| Max provider connections  | 1        | 4            | Unlimited           |
| Max team members          | 1        | 5            | 25                  |
| Meeting room              | No       | Yes          | Yes                 |
| Whiteboard tabs           | 2        | 6            | Unlimited           |
| Daily API budget          | $1.00    | $50.00       | Custom              |
| Task history retention    | 7 days   | 90 days      | Unlimited           |
| Real-time collaboration   | No       | No           | Yes (WebSocket)     |
| Custom avatars            | No       | No           | Yes                 |

The `teams.max_desks` column stores the resolved limit. Updated by Stripe webhook when plan changes.

---

## 4. Table Definitions

### 4.1 `teams`

Workspace container. Every resource belongs to exactly one team.

| Column                   | Type           | Constraints          | Notes                           |
|--------------------------|----------------|----------------------|---------------------------------|
| id                       | UUID           | PK                   | `gen_random_uuid()`             |
| name                     | VARCHAR(100)   | NOT NULL             | Team/company display name       |
| slug                     | VARCHAR(100)   | UNIQUE, NOT NULL     | URL identifier (lowercase)      |
| plan                     | plan_tier      | DEFAULT 'free'       | `'free' \| 'pro' \| 'enterprise'` |
| max_desks                | INT            | DEFAULT 2            | Resolved from plan tier         |
| monthly_budget_usd       | DECIMAL(10,2)  | DEFAULT 50.00        | Max daily API spend cap         |
| billing_email            | VARCHAR(255)   |                      | Invoice destination             |
| stripe_customer_id       | VARCHAR(100)   |                      |                                 |
| stripe_subscription_id   | VARCHAR(100)   |                      |                                 |
| created_at               | TIMESTAMPTZ    | DEFAULT now()        |                                 |
| updated_at               | TIMESTAMPTZ    | DEFAULT now()        | Auto-trigger                    |

**Indexes:** `slug` (unique), `stripe_customer_id`

### 4.2 `users`

Team members. The first user who creates a team is `owner`.

| Column           | Type           | Constraints          | Notes                              |
|------------------|----------------|----------------------|------------------------------------|
| id               | UUID           | PK                   |                                    |
| team_id          | UUID           | FK → teams.id        | CASCADE on delete                  |
| email            | VARCHAR(255)   | UNIQUE, NOT NULL     | Login identifier                   |
| password_hash    | VARCHAR(255)   |                      | bcrypt (12 rounds)                 |
| display_name     | VARCHAR(100)   | NOT NULL             | From onboarding `ceoName`          |
| avatar_id        | VARCHAR(50)    | DEFAULT 'avatar1'    | `'avatar1' \| 'avatar2' \| 'avatar3'` |
| role             | user_role      | DEFAULT 'member'     | `'owner' \| 'admin' \| 'member'`   |
| timezone         | VARCHAR(50)    | DEFAULT 'UTC'        |                                    |
| preferences      | JSONB          | DEFAULT '{}'         | UI settings, theme, etc.           |
| onboarding_done  | BOOLEAN        | DEFAULT false        | Has completed welcome flow         |
| last_login       | TIMESTAMPTZ    |                      |                                    |
| created_at       | TIMESTAMPTZ    | DEFAULT now()        |                                    |
| updated_at       | TIMESTAMPTZ    | DEFAULT now()        |                                    |

**Indexes:** `email` (unique), `team_id`

**Maps to frontend:** `ceoName` → `display_name`, `ceoSprite` → `avatar_id`, `onboardingDone` → `onboarding_done`

### 4.3 `provider_credentials`

Encrypted API keys. **Never** return raw keys to the client — only masked versions.

| Column               | Type           | Constraints          | Notes                              |
|----------------------|----------------|----------------------|------------------------------------|
| id                   | UUID           | PK                   |                                    |
| team_id              | UUID           | FK → teams.id        | CASCADE on delete                  |
| provider             | VARCHAR(50)    | NOT NULL             | `'openai' \| 'anthropic' \| 'moonshot' \| 'google'` |
| api_key_encrypted    | TEXT           | NOT NULL             | AES-256-GCM ciphertext             |
| api_key_iv           | TEXT           | NOT NULL             | Initialisation vector (hex)        |
| api_key_tag          | TEXT           | NOT NULL             | Auth tag (hex)                     |
| key_fingerprint      | VARCHAR(64)    | NOT NULL             | SHA-256 hash for dedup lookup      |
| is_active            | BOOLEAN        | DEFAULT true         |                                    |
| rate_limit_per_min   | INT            | DEFAULT 60           |                                    |
| last_used_at         | TIMESTAMPTZ    |                      |                                    |
| created_at           | TIMESTAMPTZ    | DEFAULT now()        |                                    |
| updated_at           | TIMESTAMPTZ    | DEFAULT now()        |                                    |

**Indexes:** `(team_id, provider)` unique composite, `key_fingerprint`

**Security:**
- Master key: env var `ENCRYPTION_KEY` (32 bytes, base64-encoded)
- Algorithm: AES-256-GCM (authenticated encryption)
- IV: 12 bytes, randomly generated per key
- Tag: 16 bytes, verified on decryption
- Fingerprint: `SHA-256(raw_key)` — allows checking for duplicates without decrypting

**Maps to frontend:** `Connection` interface. Client receives `{ id, provider, name, isConnected, apiKeyMasked, models, addedAt }` — never the raw key.

### 4.4 `desks`

Virtual office desks. Each desk = one AI agent sitting at it.

| Column        | Type           | Constraints          | Notes                                  |
|---------------|----------------|----------------------|----------------------------------------|
| id            | UUID           | PK                   |                                        |
| team_id       | UUID           | FK → teams.id        | CASCADE on delete                      |
| name          | VARCHAR(100)   | NOT NULL             | Desk display name (e.g. "Research Desk") |
| desk_type     | desk_type      | DEFAULT 'mini'       | `'mini' \| 'standard' \| 'power'`     |
| avatar_id     | VARCHAR(50)    | NOT NULL             | `'avatar1' \| 'avatar2' \| 'avatar3'` |
| model_id      | VARCHAR(100)   | NOT NULL             | e.g. `'claude-opus-4.6'`              |
| agent_name    | VARCHAR(100)   | NOT NULL             | Agent display name                     |
| agent_color   | VARCHAR(7)     | DEFAULT '#feca57'    | Hex colour for UI accents              |
| sort_order    | INT            | DEFAULT 0            | Display order (affects layout column)  |
| is_active     | BOOLEAN        | DEFAULT true         | Soft delete flag                       |
| created_at    | TIMESTAMPTZ    | DEFAULT now()        |                                        |
| updated_at    | TIMESTAMPTZ    | DEFAULT now()        |                                        |

**Indexes:** `team_id`, `(team_id, is_active)`

**Note:** Position (x, y) is calculated client-side by `calculateDeskLayout()` from `sort_order`. We don't persist pixel coordinates — only the logical order. The layout algorithm handles the alternating left/right pattern.

**Maps to frontend:** Combines `Zone` + `DeskAssignment` + `Agent`. On load, the API returns desks and the client constructs all three objects.

**Desk type assignment pattern:**
```
sort_order 0,1 → 'mini'      (deskMini sprite)
sort_order 2,3 → 'standard'  (deskStandard sprite)
sort_order 4,5 → 'power'     (deskPower sprite)
```

### 4.5 `tasks`

AI task assignments and their results.

| Column        | Type           | Constraints          | Notes                              |
|---------------|----------------|----------------------|------------------------------------|
| id            | UUID           | PK                   |                                    |
| team_id       | UUID           | FK → teams.id        | CASCADE on delete                  |
| desk_id       | UUID           | FK → desks.id        | SET NULL on delete                 |
| title         | VARCHAR(255)   | NOT NULL             | Task name                          |
| description   | TEXT           |                      | Full instructions                  |
| status        | task_status    | DEFAULT 'pending'    | `'pending' \| 'in-progress' \| 'completed' \| 'failed'` |
| cost_usd      | DECIMAL(10,6)  |                      | Actual computed cost               |
| model_used    | VARCHAR(100)   |                      | Model ID used for this task        |
| result        | JSONB          |                      | AI response payload                |
| created_at    | TIMESTAMPTZ    | DEFAULT now()        |                                    |
| completed_at  | TIMESTAMPTZ    |                      |                                    |

**Indexes:** `team_id`, `desk_id`, `status`, `(team_id, created_at)`

### 4.6 `ai_usage`

Per-request cost and token tracking. One row per AI API call.

| Column         | Type           | Constraints          | Notes                           |
|----------------|----------------|----------------------|---------------------------------|
| id             | UUID           | PK                   |                                 |
| team_id        | UUID           | FK → teams.id        | CASCADE on delete               |
| user_id        | UUID           | FK → users.id        | SET NULL on delete              |
| credential_id  | UUID           | FK → provider_credentials.id | SET NULL on delete       |
| provider       | VARCHAR(50)    | NOT NULL             | Denormalised for fast queries   |
| model          | VARCHAR(100)   | NOT NULL             |                                 |
| input_tokens   | INT            | NOT NULL             |                                 |
| output_tokens  | INT            | NOT NULL             |                                 |
| cost_usd       | DECIMAL(10,6)  | NOT NULL             | Computed from MODEL_PRICING     |
| task_id        | UUID           |                      | FK → tasks.id (nullable)        |
| created_at     | TIMESTAMPTZ    | DEFAULT now()        |                                 |

**Indexes:** `team_id`, `user_id`, `created_at`, `(team_id, created_at)` composite

**Materialized view** for the cost dashboard:
```sql
CREATE MATERIALIZED VIEW team_costs_daily AS
SELECT
    team_id,
    DATE_TRUNC('day', created_at) AS date,
    provider,
    model,
    SUM(cost_usd) AS total_cost,
    SUM(input_tokens) AS total_input,
    SUM(output_tokens) AS total_output,
    COUNT(*) AS request_count
FROM ai_usage
GROUP BY team_id, DATE_TRUNC('day', created_at), provider, model;
```

Refreshed by cron every 5 minutes: `REFRESH MATERIALIZED VIEW CONCURRENTLY team_costs_daily;`

**Maps to frontend:** `todayApiCost`, `dailyCosts[]`, cost panel data.

### 4.7 `whiteboard_notes`

Sticky notes organised by tab. Each row = one note.

| Column      | Type           | Constraints          | Notes                              |
|-------------|----------------|----------------------|------------------------------------|
| id          | UUID           | PK                   |                                    |
| team_id     | UUID           | FK → teams.id        | CASCADE on delete                  |
| tab         | VARCHAR(50)    | NOT NULL             | `'vision' \| 'goals' \| 'plans' \| 'ideas' \| 'memos' \| 'rules'` |
| content     | TEXT           | NOT NULL             | Note body text                     |
| color       | VARCHAR(7)     | DEFAULT '#fef3c7'    | Sticky note background             |
| created_by  | UUID           | FK → users.id        | SET NULL on delete                 |
| sort_order  | INT            | DEFAULT 0            | Display ordering within tab        |
| created_at  | TIMESTAMPTZ    | DEFAULT now()        |                                    |
| updated_at  | TIMESTAMPTZ    | DEFAULT now()        |                                    |

**Indexes:** `(team_id, tab)`

**Maps to frontend:** `whiteboardNotes: Record<string, string[]>` — on load, group by `tab` and return arrays of `content`.

### 4.8 `meetings`

Meeting room sessions with full chat history.

| Column        | Type           | Constraints          | Notes                              |
|---------------|----------------|----------------------|------------------------------------|
| id            | UUID           | PK                   |                                    |
| team_id       | UUID           | FK → teams.id        | CASCADE on delete                  |
| started_by    | UUID           | FK → users.id        | SET NULL on delete                 |
| topic         | VARCHAR(255)   | NOT NULL             |                                    |
| participants  | TEXT[]         | NOT NULL             | Array of agent/desk IDs            |
| messages      | JSONB          | DEFAULT '[]'         | Full chat log (ChatMessage[])      |
| status        | meeting_status | DEFAULT 'active'     | `'active' \| 'ended'`             |
| started_at    | TIMESTAMPTZ    | DEFAULT now()        |                                    |
| ended_at      | TIMESTAMPTZ    |                      |                                    |
| created_at    | TIMESTAMPTZ    | DEFAULT now()        |                                    |

**Indexes:** `team_id`, `(team_id, status)`

**Maps to frontend:** `Meeting` interface. `messages` stored as JSONB matching `ChatMessage[]`.

### 4.9 `office_sessions`

Ephemeral real-time state for WebSocket connections. Rows are cleaned up after 1 hour of inactivity.

| Column          | Type           | Constraints          | Notes                           |
|-----------------|----------------|----------------------|---------------------------------|
| id              | UUID           | PK                   |                                 |
| team_id         | UUID           | FK → teams.id        | CASCADE on delete               |
| user_id         | UUID           | FK → users.id        | CASCADE on delete               |
| socket_id       | VARCHAR(100)   |                      | WebSocket connection ID         |
| canvas_state    | JSONB          | DEFAULT '{}'         | Agent positions, pause state    |
| last_activity   | TIMESTAMPTZ    | DEFAULT now()        |                                 |
| created_at      | TIMESTAMPTZ    | DEFAULT now()        |                                 |

**Indexes:** `team_id`, `user_id`, `last_activity`

**TTL cleanup:** `DELETE FROM office_sessions WHERE last_activity < now() - INTERVAL '1 hour'`

### 4.10 `task_log`

Persistent activity log (the "task log" panel on the left sidebar).

| Column      | Type           | Constraints          | Notes                              |
|-------------|----------------|----------------------|------------------------------------|
| id          | UUID           | PK                   |                                    |
| team_id     | UUID           | FK → teams.id        | CASCADE on delete                  |
| message     | TEXT           | NOT NULL             | Log entry text                     |
| created_at  | TIMESTAMPTZ    | DEFAULT now()        |                                    |

**Indexes:** `(team_id, created_at DESC)`

**Maps to frontend:** `taskLog: string[]` — query last 20 ordered by `created_at DESC`.

---

## 5. Custom Types (Enums)

```sql
CREATE TYPE plan_tier      AS ENUM ('free', 'pro', 'enterprise');
CREATE TYPE user_role      AS ENUM ('owner', 'admin', 'member');
CREATE TYPE desk_type      AS ENUM ('mini', 'standard', 'power');
CREATE TYPE task_status    AS ENUM ('pending', 'in-progress', 'completed', 'failed');
CREATE TYPE meeting_status AS ENUM ('active', 'ended');
```

---

## 6. API Key Encryption Detail

### Encryption Flow (on key creation)

```
1. Client sends raw API key over HTTPS
2. Server generates 12-byte random IV
3. Server encrypts with AES-256-GCM:
     cipher = createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv)
     encrypted = cipher.update(rawKey) + cipher.final()
     tag = cipher.getAuthTag()
4. Server computes fingerprint: SHA-256(rawKey)
5. Store: api_key_encrypted, api_key_iv, api_key_tag, key_fingerprint
6. Return to client: { id, provider, apiKeyMasked: '••••' + last4 }
7. Raw key is NEVER stored, NEVER returned, NEVER logged
```

### Decryption Flow (on AI proxy request)

```
1. Task assigned → server looks up credential by (team_id, provider)
2. Decrypt:
     decipher = createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv)
     decipher.setAuthTag(tag)
     rawKey = decipher.update(encrypted) + decipher.final()
3. Forward request to provider API with decrypted key
4. Raw key held in memory only for the duration of the API call
5. Track usage in ai_usage table
```

### Key Rotation

When `ENCRYPTION_KEY` is rotated:
1. Decrypt all credentials with old key
2. Re-encrypt with new key
3. Update all rows in a transaction
4. Migration script provided in `server/scripts/rotate-key.ts`

---

## 7. Row-Level Security

```sql
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE desks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE whiteboard_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

-- All tables use the same pattern:
CREATE POLICY team_isolation ON [table]
    USING (team_id = current_setting('app.current_team_id')::UUID);
```

The Express middleware sets `app.current_team_id` from the JWT on every request:
```sql
SET LOCAL app.current_team_id = '<team_id_from_jwt>';
```

---

## 8. API Endpoints (Express Router Plan)

### Auth
```
POST   /api/auth/register          Create team + owner user
POST   /api/auth/login             Returns JWT (access + refresh)
POST   /api/auth/refresh           Refresh access token
POST   /api/auth/logout            Invalidate refresh token
```

### Team
```
GET    /api/team                   Get current team info
PATCH  /api/team                   Update team name, billing email
GET    /api/team/usage             Aggregated cost dashboard data
```

### Users (team members)
```
GET    /api/users                  List team members
PATCH  /api/users/me               Update profile (display_name, avatar_id, timezone)
PATCH  /api/users/me/onboarding    Mark onboarding complete
```

### Provider Credentials
```
GET    /api/providers              List connections (masked keys)
POST   /api/providers              Add API key (encrypt + store)
DELETE /api/providers/:id          Disconnect (soft delete)
POST   /api/providers/:id/test     Verify key works (make test call)
```

### Desks
```
GET    /api/desks                  List active desks (with agent info)
POST   /api/desks                  Create desk (enforces max_desks limit)
PATCH  /api/desks/:id              Update name, model, avatar
DELETE /api/desks/:id              Soft delete (set is_active = false)
PATCH  /api/desks/reorder          Update sort_order for all desks
```

### Tasks
```
GET    /api/tasks                  List tasks (paginated, filterable)
POST   /api/tasks                  Create + assign task
PATCH  /api/tasks/:id/status       Update status
GET    /api/tasks/:id/result       Get AI response
```

### AI Proxy
```
POST   /api/ai/chat                Proxy chat completion request
  → Decrypts provider key
  → Forwards to provider API
  → Tracks tokens + cost in ai_usage
  → Returns response to client
```

### Whiteboard
```
GET    /api/whiteboard             Get all notes grouped by tab
POST   /api/whiteboard             Create note
PATCH  /api/whiteboard/:id         Update note content
DELETE /api/whiteboard/:id         Delete note
```

### Meetings
```
GET    /api/meetings               List past meetings
POST   /api/meetings               Start meeting
PATCH  /api/meetings/:id/message   Add message to active meeting
PATCH  /api/meetings/:id/end       End meeting
```

---

## 9. Frontend → Database Mapping

| Frontend State              | Database Table           | Notes                                    |
|-----------------------------|--------------------------|------------------------------------------|
| `ceoName`                   | `users.display_name`     |                                          |
| `ceoSprite`                 | `users.avatar_id`        |                                          |
| `onboardingDone`            | `users.onboarding_done`  |                                          |
| `connections[]`             | `provider_credentials`   | Client gets masked version only          |
| `desks[]` (Zone)            | `desks`                  | Position calculated client-side          |
| `deskAssignments[]`         | `desks.model_id`         | Merged into desks table                  |
| `agents[]` (Agent)          | `desks` + `users`        | Constructed client-side from desk data   |
| `tasks[]`                   | `tasks`                  |                                          |
| `taskLog[]`                 | `task_log`               | Last 20 per team                         |
| `whiteboardNotes{}`         | `whiteboard_notes`       | Grouped by `tab` on query                |
| `activeMeeting`             | `meetings`               | Where `status = 'active'`                |
| `todayApiCost`              | `ai_usage` (aggregated)  | `SUM(cost_usd) WHERE date = today`       |
| `subscriptions[]`           | Stripe API + `teams.plan`| Read from Stripe, plan stored locally    |
| `isPaused`                  | `office_sessions`        | In `canvas_state` JSONB                  |

---

## 10. Migration Order

Build tables in this order to respect foreign key dependencies:

```
1.  Create enums (plan_tier, user_role, desk_type, task_status, meeting_status)
2.  teams
3.  users                    (FK → teams)
4.  provider_credentials     (FK → teams)
5.  desks                    (FK → teams)
6.  tasks                    (FK → teams, desks)
7.  ai_usage                 (FK → teams, users, provider_credentials)
8.  whiteboard_notes         (FK → teams, users)
9.  meetings                 (FK → teams, users)
10. office_sessions          (FK → teams, users)
11. task_log                 (FK → teams)
12. Materialized view: team_costs_daily
13. Auto-update triggers
14. Row-Level Security policies
15. Seed data (default subscriptions, model pricing)
```

---

## 11. Full SQL DDL

```sql
-- ============================================================
-- Agent Desk — Database Schema
-- PostgreSQL 16+
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Enums ────────────────────────────────────────────────────

CREATE TYPE plan_tier      AS ENUM ('free', 'pro', 'enterprise');
CREATE TYPE user_role      AS ENUM ('owner', 'admin', 'member');
CREATE TYPE desk_type      AS ENUM ('mini', 'standard', 'power');
CREATE TYPE task_status    AS ENUM ('pending', 'in-progress', 'completed', 'failed');
CREATE TYPE meeting_status AS ENUM ('active', 'ended');

-- ── Teams ────────────────────────────────────────────────────

CREATE TABLE teams (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    VARCHAR(100) NOT NULL,
    slug                    VARCHAR(100) UNIQUE NOT NULL,
    plan                    plan_tier DEFAULT 'free',
    max_desks               INT DEFAULT 2,
    monthly_budget_usd      DECIMAL(10,2) DEFAULT 50.00,
    billing_email           VARCHAR(255),
    stripe_customer_id      VARCHAR(100),
    stripe_subscription_id  VARCHAR(100),
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_teams_slug ON teams(slug);
CREATE INDEX idx_teams_stripe ON teams(stripe_customer_id);

-- ── Users ────────────────────────────────────────────────────

CREATE TABLE users (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id           UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    email             VARCHAR(255) UNIQUE NOT NULL,
    password_hash     VARCHAR(255),
    display_name      VARCHAR(100) NOT NULL,
    avatar_id         VARCHAR(50) DEFAULT 'avatar1',
    role              user_role DEFAULT 'member',
    timezone          VARCHAR(50) DEFAULT 'UTC',
    preferences       JSONB DEFAULT '{}',
    onboarding_done   BOOLEAN DEFAULT false,
    last_login        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_team ON users(team_id);
CREATE UNIQUE INDEX idx_users_email ON users(email);

-- ── Provider Credentials (Encrypted API Keys) ───────────────

CREATE TABLE provider_credentials (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id             UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    provider            VARCHAR(50) NOT NULL,
    api_key_encrypted   TEXT NOT NULL,
    api_key_iv          TEXT NOT NULL,
    api_key_tag         TEXT NOT NULL,
    key_fingerprint     VARCHAR(64) NOT NULL,
    is_active           BOOLEAN DEFAULT true,
    rate_limit_per_min  INT DEFAULT 60,
    last_used_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (team_id, provider)
);

CREATE INDEX idx_creds_team ON provider_credentials(team_id);
CREATE INDEX idx_creds_fingerprint ON provider_credentials(key_fingerprint);

-- ── Desks (Agent + Desk + Assignment combined) ──────────────

CREATE TABLE desks (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id       UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name          VARCHAR(100) NOT NULL,
    desk_type     desk_type DEFAULT 'mini',
    avatar_id     VARCHAR(50) NOT NULL DEFAULT 'avatar1',
    model_id      VARCHAR(100) NOT NULL,
    agent_name    VARCHAR(100) NOT NULL,
    agent_color   VARCHAR(7) DEFAULT '#feca57',
    sort_order    INT DEFAULT 0,
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_desks_team ON desks(team_id);
CREATE INDEX idx_desks_active ON desks(team_id, is_active);

-- ── Tasks ────────────────────────────────────────────────────

CREATE TABLE tasks (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id       UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    desk_id       UUID REFERENCES desks(id) ON DELETE SET NULL,
    title         VARCHAR(255) NOT NULL,
    description   TEXT,
    status        task_status DEFAULT 'pending',
    cost_usd      DECIMAL(10,6),
    model_used    VARCHAR(100),
    result        JSONB,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    completed_at  TIMESTAMPTZ
);

CREATE INDEX idx_tasks_team ON tasks(team_id);
CREATE INDEX idx_tasks_desk ON tasks(desk_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_team_date ON tasks(team_id, created_at);

-- ── AI Usage (Cost Tracking) ────────────────────────────────

CREATE TABLE ai_usage (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    credential_id   UUID REFERENCES provider_credentials(id) ON DELETE SET NULL,
    provider        VARCHAR(50) NOT NULL,
    model           VARCHAR(100) NOT NULL,
    input_tokens    INT NOT NULL,
    output_tokens   INT NOT NULL,
    cost_usd        DECIMAL(10,6) NOT NULL,
    task_id         UUID REFERENCES tasks(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usage_team ON ai_usage(team_id);
CREATE INDEX idx_usage_user ON ai_usage(user_id);
CREATE INDEX idx_usage_date ON ai_usage(created_at);
CREATE INDEX idx_usage_team_date ON ai_usage(team_id, created_at);

-- ── Materialized View: Daily Costs ──────────────────────────

CREATE MATERIALIZED VIEW team_costs_daily AS
SELECT
    team_id,
    DATE_TRUNC('day', created_at) AS date,
    provider,
    model,
    SUM(cost_usd) AS total_cost,
    SUM(input_tokens) AS total_input,
    SUM(output_tokens) AS total_output,
    COUNT(*) AS request_count
FROM ai_usage
GROUP BY team_id, DATE_TRUNC('day', created_at), provider, model;

CREATE UNIQUE INDEX idx_costs_daily_lookup
    ON team_costs_daily(team_id, date, provider, model);

-- ── Whiteboard Notes ────────────────────────────────────────

CREATE TABLE whiteboard_notes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    tab         VARCHAR(50) NOT NULL,
    content     TEXT NOT NULL,
    color       VARCHAR(7) DEFAULT '#fef3c7',
    created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    sort_order  INT DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_whiteboard_team_tab ON whiteboard_notes(team_id, tab);

-- ── Meetings ────────────────────────────────────────────────

CREATE TABLE meetings (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id       UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    started_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    topic         VARCHAR(255) NOT NULL,
    participants  TEXT[] NOT NULL,
    messages      JSONB DEFAULT '[]',
    status        meeting_status DEFAULT 'active',
    started_at    TIMESTAMPTZ DEFAULT NOW(),
    ended_at      TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_meetings_team ON meetings(team_id);
CREATE INDEX idx_meetings_status ON meetings(team_id, status);

-- ── Office Sessions (Ephemeral) ─────────────────────────────

CREATE TABLE office_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    socket_id       VARCHAR(100),
    canvas_state    JSONB DEFAULT '{}',
    last_activity   TIMESTAMPTZ DEFAULT NOW(),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_team ON office_sessions(team_id);
CREATE INDEX idx_sessions_activity ON office_sessions(last_activity);

-- ── Task Log (Activity Feed) ────────────────────────────────

CREATE TABLE task_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    message     TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasklog_team_date ON task_log(team_id, created_at DESC);

-- ── Auto-Update Triggers ────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_teams_updated
    BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_users_updated
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_creds_updated
    BEFORE UPDATE ON provider_credentials
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_desks_updated
    BEFORE UPDATE ON desks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_whiteboard_updated
    BEFORE UPDATE ON whiteboard_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row-Level Security ──────────────────────────────────────

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE desks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE whiteboard_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE office_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_isolation_users ON users
    USING (team_id = current_setting('app.current_team_id')::UUID);
CREATE POLICY team_isolation_creds ON provider_credentials
    USING (team_id = current_setting('app.current_team_id')::UUID);
CREATE POLICY team_isolation_desks ON desks
    USING (team_id = current_setting('app.current_team_id')::UUID);
CREATE POLICY team_isolation_tasks ON tasks
    USING (team_id = current_setting('app.current_team_id')::UUID);
CREATE POLICY team_isolation_usage ON ai_usage
    USING (team_id = current_setting('app.current_team_id')::UUID);
CREATE POLICY team_isolation_whiteboard ON whiteboard_notes
    USING (team_id = current_setting('app.current_team_id')::UUID);
CREATE POLICY team_isolation_meetings ON meetings
    USING (team_id = current_setting('app.current_team_id')::UUID);
CREATE POLICY team_isolation_sessions ON office_sessions
    USING (team_id = current_setting('app.current_team_id')::UUID);
CREATE POLICY team_isolation_tasklog ON task_log
    USING (team_id = current_setting('app.current_team_id')::UUID);
```

---

## 12. Server Directory Structure

```
server/
  ├── src/
  │   ├── index.ts                 Express entry point
  │   ├── config/
  │   │   ├── database.ts          PostgreSQL pool (pg)
  │   │   ├── encryption.ts        AES-256-GCM helpers
  │   │   └── stripe.ts            Stripe client
  │   ├── middleware/
  │   │   ├── auth.ts              JWT verification + team_id injection
  │   │   ├── rls.ts               SET LOCAL app.current_team_id
  │   │   └── tierLimits.ts        Enforce max_desks, max_providers, etc.
  │   ├── routes/
  │   │   ├── auth.ts              Register, login, refresh, logout
  │   │   ├── team.ts              Team info + usage dashboard
  │   │   ├── users.ts             Profile, onboarding
  │   │   ├── providers.ts         CRUD provider credentials
  │   │   ├── desks.ts             CRUD desks (with limit enforcement)
  │   │   ├── tasks.ts             CRUD tasks
  │   │   ├── ai.ts                AI proxy (decrypt → forward → track)
  │   │   ├── whiteboard.ts        CRUD whiteboard notes
  │   │   └── meetings.ts          Meeting lifecycle
  │   ├── services/
  │   │   ├── encryption.service.ts    Encrypt/decrypt API keys
  │   │   ├── ai-proxy.service.ts      Forward requests to providers
  │   │   ├── cost.service.ts          Calculate + record costs
  │   │   └── tier.service.ts          Plan limit resolution
  │   ├── scripts/
  │   │   ├── migrate.ts           Run SQL migrations
  │   │   ├── seed.ts              Seed default data
  │   │   └── rotate-key.ts        ENCRYPTION_KEY rotation
  │   └── types/
  │       └── index.ts             Shared TypeScript types
  ├── migrations/
  │   └── 001_initial.sql          Full DDL from section 11
  ├── package.json
  ├── tsconfig.json
  └── .env.example
```

---

## 13. Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/agentdesk

# Encryption
ENCRYPTION_KEY=<32-byte-base64-encoded-key>

# JWT
JWT_SECRET=<random-256-bit-secret>
JWT_REFRESH_SECRET=<different-random-256-bit-secret>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_ENTERPRISE=price_...

# Server
PORT=3001
NODE_ENV=production
CORS_ORIGIN=https://agentdesk.app
```

---

## 14. Next Steps (Build Order)

1. **Set up `server/` directory** — Express + TypeScript + pg pool
2. **Run migration** — Create all tables from DDL
3. **Auth routes** — Register/login with JWT
4. **Provider credentials** — Encrypt/store/mask API keys
5. **Desks CRUD** — With tier limit enforcement
6. **AI proxy** — Decrypt key → forward → track usage
7. **Wire frontend** — Replace local state with API calls
8. **Stripe integration** — Plan upgrades, webhooks
9. **WebSocket** — Real-time office sync (Enterprise)
