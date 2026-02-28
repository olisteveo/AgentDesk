# Kreative-HQ SaaS v1.0 Technical Specification

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   React App     │────▶│   Node.js API    │────▶│   PostgreSQL    │
│  (Dashboard)    │     │   (Express/Fastify)│    │   (Main DB)     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │
         │              ┌────────┴────────┐
         │              │                 │
         ▼              ▼                 ▼
┌─────────────────┐  ┌──────────┐   ┌──────────┐
│  WebSocket      │  │  Redis   │   │  AI      │
│  (Real-time)    │  │  (Cache/ │   │  Proxy   │
│                 │  │  Queue)  │   │  Service │
└─────────────────┘  └──────────┘   └──────────┘
                                           │
              ┌───────────────┬───────────┼───────────┬───────────┐
              ▼               ▼           ▼           ▼
        ┌──────────┐   ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ OpenAI   │   │ Anthropic│ │ Google   │ │ Moonshot │
        │ API      │   │ API      │ │ (Gemini) │ │ API      │
        └──────────┘   └──────────┘ └──────────┘ └──────────┘
```

## Key Architecture Decisions (Updated 2026-02-25)

### Desk System Design
- **Default state:** CEO Office, Operations, Meeting Room only
- **User-created desks:** 0-6 max, only creatable when AI providers connected
- **Desk-to-model assignment:** Each desk assigned one AI model from connected providers
- **No preset desks:** Users build their own workspace layout

### Settings/Connection Flow
1. **Settings Modal** with two tabs:
   - **AI Providers:** Add/remove API keys (OpenAI, Anthropic, Moonshot, etc.)
   - **Desk Management:** Create desks (max 6), assign models to desks
2. **Connection-gated:** Desk creation disabled until at least one provider connected
3. **Model availability:** Only models from connected providers shown in assignment dropdown

### UI Layout
- **Scrollable canvas:** Vertical scroll for unlimited desk expansion
- **2-column layout:** CEO/Ops top, desks in pairs below, Meeting Room at bottom
- **Responsive:** Canvas min-height 1200px, scales with content

### Rules & Governance Design
- **Three-layer hierarchy:** Core Preset (team-wide, hardcoded) → Team Rules (user-created, all agents) → Desk Rules (user-created, per-agent)
- **Injection architecture:** `buildRulesPrompt(teamId, deskId)` called at all 4 AI callpoints (task exec, task chat, desk chat, meetings)
- **AI suggestions:** Fire-and-forget after task completion, max 5 pending, human approval required
- **Presets in code, custom rules in DB:** Avoids migration churn for preset changes

### Agent Chat Design
- **Per-desk persistence:** 50-message cap with auto-prune on insert
- **Reuses existing AI proxy:** `/api/ai/chat` with full rules injection and cost tracking
- **Auto-desk-creation:** If a frontend desk has no backend record, AgentChat creates one on first message
- **Fire-and-forget saves:** Message persistence doesn't block the UI

## Core Components

### 1. Backend API (Node.js/TypeScript)

**Responsibilities:**
- Authentication & session management
- AI provider proxy/routing
- Cost tracking & aggregation
- Real-time WebSocket events
- Webhook handling for provider billing

**Key Endpoints:**
```
POST   /api/v1/auth/login          # JWT-based auth
POST   /api/v1/auth/register       # Team signup
GET    /api/v1/team/profile        # Team settings
POST   /api/v1/chat                # Unified chat endpoint
GET    /api/v1/costs/realtime      # Live cost data
GET    /api/v1/costs/history       # Historical costs
POST   /api/v1/agents/assign       # Assign task to agent
GET    /api/v1/whiteboard          # Get whiteboard state
POST   /api/v1/whiteboard/update   # Update whiteboard
WS     /ws/v1/office               # Real-time office state

# Rules (Agent Governance)
GET    /api/rules                   # List all rules (grouped: team/desk/pending + core preset)
PATCH  /api/rules/core-preset       # Change core rules preset
POST   /api/rules                   # Create a rule (tier-limited)
PATCH  /api/rules/:id              # Update rule fields (title, content, category)
PATCH  /api/rules/:id/toggle       # Toggle active ↔ disabled
PATCH  /api/rules/:id/approve      # Approve AI-suggested rule
PATCH  /api/rules/:id/reject       # Reject AI-suggested rule
PUT    /api/rules/reorder          # Bulk reorder rules
DELETE /api/rules/:id              # Delete a rule

# Chat History (1-on-1 Agent Chat)
GET    /api/chat-history/:deskId    # Fetch messages (newest 50, oldest-first)
POST   /api/chat-history/:deskId    # Save user+assistant pair, auto-prune beyond 50
DELETE /api/chat-history/:deskId    # Clear all history for a desk
```

**AI Proxy Service:**
```typescript
interface AIRequest {
  provider: 'openai' | 'anthropic' | 'google' | 'moonshot';
  model: string;
  messages: Message[];
  teamId: string;
  userId: string;
  metadata?: {
    agentId?: string;
    taskId?: string;
  };
}

// Routes to correct provider, tracks costs, streams response
async function proxyAIRequest(req: AIRequest): Promise<Stream> {
  const startTime = Date.now();
  const provider = getProvider(req.provider);
  
  // Pre-flight cost estimate
  const estimatedCost = estimateCost(req.model, req.messages);
  await checkBudget(req.teamId, estimatedCost);
  
  // Stream response while tracking actual usage
  const response = await provider.stream(req);
  const actualCost = await trackUsage(req, response);
  
  // Log for analytics
  await logAIInteraction({
    teamId: req.teamId,
    model: req.model,
    cost: actualCost,
    latency: Date.now() - startTime,
    timestamp: new Date()
  });
  
  return response;
}
```

### 2. Database Schema (PostgreSQL)

```sql
-- Teams/Organizations
create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  plan text default 'free', -- free, pro, enterprise
  monthly_budget decimal(10,2) default 100.00,
  core_rules_preset varchar(50), -- startup_fast, professional, creative, technical, customer_first
  created_at timestamptz default now()
);

-- Users (team members)
create table users (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id),
  email text unique not null,
  role text default 'member', -- owner, admin, member
  preferences jsonb default '{}',
  created_at timestamptz default now()
);

-- AI Provider Credentials (encrypted)
create table provider_credentials (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id),
  provider text not null, -- openai, anthropic, moonshot
  api_key_encrypted text not null,
  is_active boolean default true,
  rate_limit_per_minute int default 60
);

-- AI Usage / Cost Tracking
create table ai_usage (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id),
  user_id uuid references users(id),
  provider text not null,
  model text not null,
  input_tokens int not null,
  output_tokens int not null,
  cost_usd decimal(10,6) not null,
  agent_id text, -- which "agent" was used
  task_id text,
  created_at timestamptz default now()
);

-- Whiteboard
create table whiteboard_notes (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id),
  tab text not null, -- vision, goals, rules, etc
  content text not null,
  color text default '#fef3c7',
  created_by uuid references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tasks / Agent Assignments
create table tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id),
  title text not null,
  description text,
  agent_id text not null, -- which AI model/agent
  status text default 'pending', -- pending, in-progress, completed, failed
  cost_usd decimal(10,6),
  result jsonb,
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- Real-time office state (ephemeral)
create table office_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id),
  user_id uuid references users(id),
  socket_id text,
  agent_positions jsonb, -- current positions on canvas
  last_activity timestamptz default now()
);

-- Agent Rules (Governance)
create table team_rules (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  desk_id uuid references desks(id) on delete cascade, -- NULL = team-wide
  scope text not null default 'team',    -- team | desk
  title varchar(255) not null,
  content text not null,
  category varchar(50) default 'general', -- tone/format/safety/workflow/domain/general
  status text default 'active',           -- active/disabled/pending/rejected
  sort_order int default 0,
  created_by uuid references users(id) on delete set null,
  suggested_by_desk_id uuid references desks(id) on delete set null,
  suggestion_context text,                -- task title that triggered AI suggestion
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Chat Messages (1-on-1 agent conversations, capped at 50 per desk)
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  desk_id uuid not null references desks(id) on delete cascade,
  role varchar(10) not null check (role in ('user', 'assistant')),
  content text not null,
  model varchar(100),
  cost_usd numeric(12,8) default 0,
  created_at timestamptz not null default now()
);
```

### 3. Real-Time Architecture (WebSocket + Redis)

**Office State Sync:**
```typescript
// When user opens dashboard
io.on('connection', (socket) => {
  const { teamId, userId } = authenticate(socket);
  
  // Join team room
  socket.join(`team:${teamId}`);
  
  // Send current office state
  socket.emit('office:state', await getOfficeState(teamId));
  
  // Broadcast agent movements to team
  socket.on('agent:move', (data) => {
    socket.to(`team:${teamId}`).emit('agent:update', data);
  });
  
  // Task started/completed events
  socket.on('task:start', async (task) => {
    await createTask(task);
    io.to(`team:${teamId}`).emit('task:started', task);
  });
});
```

**Redis Pub/Sub for Multi-Server:**
```
Server A ──▶ Redis Pub ──▶ Server B
   │                          │
   ◀── WebSocket ◀───────────◀┘
```

### 4. Cost Tracking System

**Real-time Aggregation:**
```typescript
// Materialized view for fast dashboard queries
create materialized view team_costs_daily as
select 
  team_id,
  date_trunc('day', created_at) as date,
  provider,
  model,
  sum(cost_usd) as total_cost,
  sum(input_tokens) as total_input,
  sum(output_tokens) as total_output,
  count(*) as request_count
from ai_usage
group by team_id, date_trunc('day', created_at), provider, model;

-- Refresh every minute
create index idx_team_costs_daily_team_date 
on team_costs_daily(team_id, date);
```

**Budget Alerts:**
```typescript
async function checkBudget(teamId: string, estimatedCost: number) {
  const team = await db.teams.findById(teamId);
  const currentSpend = await getCurrentMonthSpend(teamId);
  
  const projectedTotal = currentSpend + estimatedCost;
  
  if (projectedTotal > team.monthly_budget * 0.9) {
    await sendAlert(teamId, 'budget_warning', {
      current: currentSpend,
      budget: team.monthly_budget,
      projected: projectedTotal
    });
  }
  
  if (projectedTotal > team.monthly_budget) {
    throw new BudgetExceededError();
  }
}
```

## Difficulty Assessment & Feasibility (Updated 2026-02-18)

### Critical Challenges (Ranked by Risk)

| Challenge | Risk Level | Mitigation Strategy | Effort |
|-----------|------------|---------------------|--------|
| **Real-time cost tracking** | High | Providers have incompatible APIs. Start with OpenAI only, use webhook + polling hybrid. Accept 5-10 min delay for non-OpenAI. | 2-3 weeks |
| **API key security** | High | Encrypt at rest (AES-256-GCM), never log, rotate quarterly, use HashiCorp Vault in production. | 1 week |
| **Multi-tenant data isolation** | High | Row-level security in Postgres, strict middleware validation, separate connection pools per tenant in v2. | 2 weeks |
| **Provider rate limiting** | Medium | Implement token bucket per team, graceful degradation, queue + retry with exponential backoff. | 1 week |
| **WebSocket scaling** | Medium | Redis pub/sub for multi-server, fallback to SSE, start single-server. | 3-4 days |
| **Billing accuracy** | Medium | Stripe for subscriptions, daily cost reconciliation job, manual adjustment capability. | 1 week |

### Feasibility Verdict

**MVP (OpenAI only):** ✅ **Doable in 8-10 weeks**
- Single provider = no cost tracking complexity
- Basic encryption sufficient for beta
- Single-server deployment
- Stripe checkout + subscription management

**v1.0 (Multi-provider):** ⚠️ **12-16 weeks**
- Cost aggregation across providers is hard
- Need robust error handling for provider failures
- Compliance requirements (SOC2) add 2-4 weeks

**Scale (Enterprise):** 🔴 **6+ months**
- Multi-region, SLA guarantees
- Advanced security (Vault, HSM)
- Custom contracts, invoicing

### Recommended Phases

**Phase 1: MVP (Weeks 1-8)**
- [ ] Auth + team management
- [ ] OpenAI integration only
- [ ] Basic cost tracking (daily batch)
- [ ] 6 desk max, simple assignment
- [ ] Stripe $29/mo Pro tier

**Phase 2: Multi-provider (Weeks 9-16)**
- [ ] Anthropic + Moonshot
- [ ] Real-time cost dashboard
- [ ] WebSocket office sync
- [ ] Advanced desk customization

**Phase 3: Enterprise (Months 5-6)**
- [ ] SOC2 compliance
- [ ] On-premise option
- [ ] API access for teams
- [ ] Custom contracts

### 5. Frontend Changes for SaaS

**Auth Flow:**
```typescript
// Add to App.tsx
function App() {
  const { user, team, isLoading } = useAuth();
  
  if (isLoading) return <Loading />;
  if (!user) return <LoginPage />;
  if (!team?.providers?.length) return <OnboardingSetup />;
  
  return <Dashboard team={team} />;
}
```

**API Client with Auth:**
```typescript
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  }
});

// Cost tracking hook
function useRealtimeCosts(teamId: string) {
  const [costs, setCosts] = useState({});
  
  useEffect(() => {
    const ws = new WebSocket(`wss://api.kreativehq.com/ws/v1/office?team=${teamId}`);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'cost:update') {
        setCosts(data.costs);
      }
    };
    
    return () => ws.close();
  }, [teamId]);
  
  return costs;
}
```

### 6. Security Considerations

**API Key Encryption:**
```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const MASTER_KEY = process.env.ENCRYPTION_KEY; // 32 bytes

function encryptApiKey(apiKey: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, MASTER_KEY, iv);
  
  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}
```

**Rate Limiting:**
```typescript
// Per-team rate limiting
const rateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'ratelimit',
  points: 100, // requests
  duration: 60, // per minute
});

app.use('/api/v1/chat', async (req, res, next) => {
  try {
    await rateLimiter.consume(req.team.id);
    next();
  } catch {
    res.status(429).json({ error: 'Rate limit exceeded' });
  }
});
```

### 7. Deployment Architecture

**Docker Compose (Single Server):**
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://...
      - REDIS_URL=redis://redis:6379
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
  
  postgres:
    image: postgres:15
    volumes:
      - postgres_data:/var/lib/postgresql/data
  
  redis:
    image: redis:7-alpine
  
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
```

**Kubernetes (Scale):**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kreative-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: kreative-api
  template:
    spec:
      containers:
      - name: api
        image: kreativehq/api:v1.0
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: url
```

### 8. Pricing Tiers

| Feature | Free | Pro ($29/mo) | Enterprise |
|---------|------|--------------|------------|
| Team members | 2 | 10 | Unlimited |
| Monthly AI budget | $50 | $500 | Custom |
| Providers | 1 | Unlimited | Unlimited |
| Cost history | 7 days | 1 year | Unlimited |
| Whiteboard | Basic | Full | Full + Export |
| File export | Browser download | Browser + Local Agent | Full + API |
| Custom rules | 10 | 50 | Unlimited |
| AI rule suggestions | Yes | Yes | Yes |
| Agent Chat (1-on-1) | Yes | Yes | Yes |
| Chat history / desk | 50 messages | 50 messages | 50 messages |
| Agent memory / desk | 50 episodic | 500 episodic | Unlimited |
| Semantic compression | No | Yes (daily) | Yes (hourly) |
| Vector memory search | No | Yes | Yes |
| API access | No | Yes | Yes + Webhooks |
| Support | Community | Email | Slack + Phone |

### 9. File Export & Local Agent System

#### Current: Browser Download (All Tiers)

The browser-based file export system provides a zero-setup way for users to
save AI-generated content to their local machine. No backend changes are
required -- downloads are created entirely client-side via Blob + Object URL.

**Architecture:**
```
AI Response (text)
    |
    v
src/utils/download.ts
    |--- downloadFile({ content, filename, mimeType })   // Core: Blob -> <a download> click
    |--- downloadCodeBlock(code, language, basename?)     // Code blocks -> correct extension
    |--- downloadAsMarkdown(content, title?)              // Full response -> .md file
    |
    v
Browser Downloads folder
```

**Integration points:**
- **Task result modal:** "Download" button in header exports entire response as `.md`
- **Code blocks (task results, meetings, transcripts):** Download icon button on each
  code block header exports the block with the correct file extension (`.ts`, `.py`, etc.)
- Extension mapping reuses `LANG_EXTENSIONS` from `parseCodeBlocks.ts` for consistency

**MIME type resolution:**
- Extension inferred from filename or language
- Comprehensive map covering all supported languages (markdown, json, python, typescript, etc.)
- Falls back to `text/plain` for unknown types

**Limitations (by design for Free tier):**
- Files land in the browser's Downloads folder only (no path control)
- No filesystem write access (browser sandbox)
- No automated file creation workflows
- Single file per download (no batch/zip)

#### Future: Local Agent CLI (Pro & Enterprise Only)

A lightweight local companion process that bridges the gap between the
browser-based dashboard and the user's filesystem. This is a premium feature
that provides direct filesystem access, automated file workflows, and
integration with local development tools.

**Planned capabilities:**
- Direct file writes to any user-specified directory
- Watch mode: auto-export task results to a project folder as they complete
- Batch export: download all task results / meeting transcripts at once
- Template support: custom output formats (e.g. JSDoc headers, README structure)
- Git integration: auto-commit generated files to a local repo
- IDE bridge: richer VS Code integration beyond the current `vscode://` URI scheme

**Technical approach:**
```
Browser (React app)
    |
    | WebSocket / HTTP
    v
Local Agent (Node.js CLI or Electron/Tauri)
    |
    | fs.writeFile, child_process
    v
User's filesystem, git, IDE
```

**Implementation options (to be decided):**
1. **Node.js CLI** -- `npx agentdesk-local` or global install, lightweight,
   connects via WebSocket to the backend, receives task outputs, writes files.
   Lowest development cost, cross-platform via Node.
2. **Electron app** -- Tray icon, always-on, richer UI for config. Higher
   development cost but better UX.
3. **Tauri app** -- Rust-based, smaller binary than Electron, native
   performance. Higher development cost but smallest footprint.
4. **VS Code extension** -- Runs inside the editor, deepest IDE integration.
   Limited to VS Code users but natural fit for developer audience.

**Authentication:** The local agent authenticates with the same JWT token as
the browser session. A one-time pairing flow (scan QR code or paste token)
links the local agent to the user's account.

**Security considerations:**
- Local agent runs with user's OS permissions (not elevated)
- File writes sandboxed to user-configured directories only
- No remote code execution -- agent only writes content, never runs it
- All communication encrypted (WSS/HTTPS)
- Token-scoped to the team, revocable from the dashboard

**Monetisation rationale:**
- Free tier: browser download covers basic export needs
- Pro tier: local agent unlocks developer workflows (direct filesystem, git, IDE)
- Enterprise tier: API access for programmatic export and CI/CD integration
- Clear value ladder -- each tier adds meaningful capability, not just limits

### 10. Rules System (Agent Governance)

Rules are behavioural instructions injected into every AI system prompt. Three layers ensure flexibility: a team-wide Core Preset provides a foundation, Team Rules apply to all agents, and Desk Rules let users fine-tune individual agents.

**Core Rules Presets (5 built-in, immutable):**

| Preset | Focus | Example Rules |
|--------|-------|--------------|
| `startup_fast` | Speed & action | Be concise, bias towards action, flag trade-offs |
| `professional` | Structure & rigour | Structure responses, be thorough, cite reasoning |
| `creative` | Lateral thinking | Think laterally, write with personality, embrace iteration |
| `technical` | Precision & code | Code over prose, be technically precise, include error handling |
| `customer_first` | Empathy & clarity | Lead with empathy, explain step by step, end with next step |

Stored as `teams.core_rules_preset` column. Preset definitions are hardcoded in `src/utils/coreRulesPresets.ts` (both backend and frontend). Selected during onboarding, changeable any time via the Rules Dashboard.

**Rule Injection Flow:**
```
Task / Chat / Meeting request arrives
         │
         ▼
buildRulesPrompt(teamId, deskId)
  ├── Fetch team.core_rules_preset → format Core Rules block
  ├── Fetch team_rules WHERE scope='team' AND status='active'
  └── Fetch team_rules WHERE desk_id=X AND status='active'
         │
         ▼
Concatenate: Core Rules → Team Rules → Desk Rules
         │
         ▼
Append to system prompt at all 4 callpoints:
  • Task execution  (/api/tasks/:id/run)
  • Task chat       (/api/tasks/:id/chat)
  • Desk chat       (/api/ai/chat)
  • Meetings        (/api/meetings)
```

**AI Rule Suggestions:**
After task completion, `suggestRulesFromTask()` fires asynchronously (fire-and-forget). Sends task context to AI with a process-improvement prompt. AI returns 0-2 suggestions as JSON, inserted as `status='pending'`. Max 5 pending at a time. Users approve/reject/edit from the Rules Dashboard Suggestions tab.

**Tier Limits:**
`enforceRuleLimit` middleware gates rule creation — Free: 10 rules, Pro: 50, Enterprise: unlimited.

**Frontend:**
- `RulesDashboard.tsx` — modal with 4 tabs (Core, Team, Per Desk, Suggestions)
- `RulesPanel.tsx` — sidebar preview showing active count + first 3 rule titles
- Onboarding integration — core preset selection as part of team setup

### 11. Agent Chat (1-on-1 Conversations)

Persistent 1-on-1 chat between users and individual AI agents. Clicking an agent in the Team sidebar opens a chat panel. History is server-side and loaded on open. Uses the existing `/api/ai/chat` endpoint (with full rules injection) for completions.

**Persistence Strategy:**
- Messages stored in `chat_messages` table, capped at **50 messages per desk**
- On each POST, oldest messages beyond the cap are pruned automatically (DELETE subquery)
- Three operations: fetch (GET, newest 50 ordered ASC), save pair (POST), clear (DELETE)
- Fire-and-forget persistence — saving doesn't block the UI

**Architecture:**
```
User clicks agent in Team sidebar
         │
         ▼
AgentChat.tsx mounts
  ├── resolveBackendDeskId() — auto-creates backend desk if needed
  ├── getChatHistory(deskId) — loads last 50 messages
  └── Renders 440px right-side glass-morphic panel
         │
   User sends message
         │
         ▼
sendChat(deskId, messages) → POST /api/ai/chat
  └── Rules injected, proxied to provider, cost tracked
         │
         ▼
saveChatMessages(deskId, user, assistant, model, cost)
  └── POST /api/chat-history/:deskId — saves pair + auto-prunes
```

**Features:**
- Code block rendering with syntax highlighting + copy/download/VS Code buttons
- Cost tracking per message (aggregated in parent component)
- Model tag on each assistant message
- Clear history action
- Responsive: full-width under 500px

### 12. Agent Memory System

Agents build persistent memory from interactions, allowing them to recall past conversations, task outcomes, and meeting context. Memory is encrypted at rest (AES-256-GCM) and scoped per-desk.

**Three-Layer Architecture:**

| Layer | Purpose | Storage | Tier |
|-------|---------|---------|------|
| Episodic | Per-interaction summaries (chat sessions, tasks, meetings) | `agent_episodic_memories` | All |
| Semantic | Distilled long-term facts compressed from episodic memories | `agent_semantic_memories` | Pro/Enterprise |
| Retrieval | Combines recency-weighted + vector similarity search | pgvector cosine similarity | All (vector for Pro+) |

**Database Schema:**
```sql
-- Episodic memories (one per interaction)
create table agent_episodic_memories (
  id uuid primary key default gen_random_uuid(),
  desk_id uuid not null references desks(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  source varchar(20) not null,        -- 'chat' | 'task' | 'meeting'
  source_id text,
  summary_encrypted text not null,    -- AES-256-GCM encrypted
  embedding vector(1536),             -- OpenAI text-embedding-3-small
  metadata jsonb default '{}',
  interaction_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Semantic memories (compressed long-term facts)
create table agent_semantic_memories (
  id uuid primary key default gen_random_uuid(),
  desk_id uuid not null references desks(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  fact_encrypted text not null,
  category varchar(50) not null,
  confidence numeric(3,2) default 0.8,
  source_memory_ids uuid[] default '{}',
  embedding vector(1536),
  last_refreshed timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Compression audit log
create table memory_compression_log (
  id uuid primary key default gen_random_uuid(),
  desk_id uuid not null references desks(id) on delete cascade,
  episodic_count int not null,
  facts_generated int not null,
  facts_updated int not null,
  model_used varchar(100) not null,
  created_at timestamptz not null default now()
);
```

**Memory Generation Flow:**
```
Chat session ends (4+ messages) / Task completes / Meeting ends
         |
         v
memoryGenerator.ts (fire-and-forget)
  |-- sanitize content (strip secrets, PII patterns)
  |-- summarize via cheapest AI model (cheapAICaller.ts)
  |-- generate embedding (embeddingService.ts, 1536-dim)
  |-- encrypt summary (AES-256-GCM)
  |-- insert into agent_episodic_memories
         |
         v (daily cron, Pro/Enterprise only)
memoryCompressor.ts
  |-- batch episodic memories (30+ uncompressed)
  |-- AI extracts facts, categories, confidence scores
  |-- upsert into agent_semantic_memories
  |-- log compression run
```

**Memory Retrieval (injected into AI system prompt):**
```
buildMemoryContext(deskId, currentMessages)
  |-- Recent episodic: last 5 memories by interaction_at
  |-- Relevant episodic: top 3 by vector similarity to current conversation
  |-- Semantic facts: all facts for desk (Pro/Enterprise)
  |-- Deduplicate, format as "What You Remember" prompt block
  |-- Injected at all 4 AI callpoints (task exec, task chat, desk chat, meetings)
```

**Memory API Endpoints:**
```
GET    /api/memory/:deskId              # List episodic memories (paginated, decrypted)
GET    /api/memory/:deskId/facts        # List semantic facts (decrypted)
DELETE /api/memory/:deskId/:memoryId    # Delete single memory
DELETE /api/memory/:deskId              # Wipe all memories for desk
POST   /api/chat-history/:deskId/end-session  # Signal session end, triggers memory generation
```

**Memory Viewer UI (AgentChat panel):**
- Brain icon button in AgentChat header toggles collapsible memory section (max-height 320px, internal scroll)
- Shows episodic memory list with source icons (chat/task/meeting), summary, relative time, hover-delete
- Shows semantic facts sub-section (Pro/Enterprise only) with category badges and confidence percentages
- "Wipe All" button with two-click confirmation
- Purple accent (#a29bfe) to distinguish from personality (orange) and main theme (blue)

**Memory Indicators (Office + Dashboard):**
- **OfficeCanvas:** Purple dot at bottom-right of agent avatar (canvas-rendered, pulsing opacity via `Math.sin`)
- **DashboardView:** Purple dot at bottom-right of agent card avatar (CSS-rendered with glow shadow)
- Only visible when agent has `memoryCount > 0`

**Memory Generation Animation:**
- When a memory is generated (chat close or task complete), the agent's pixel avatar shows:
  - Expanding purple ring around avatar (grows outward over 3 seconds)
  - 3 small purple particles rising upward with sinusoidal drift
  - All elements fade out via `globalAlpha` over the 3-second duration
- Triggered via `onMemoryGenerated` callback from AgentChat to OfficeCanvas

**Tier Limits:**

| Feature | Free | Pro | Enterprise |
|---------|------|-----|------------|
| Episodic memories / desk | 50 | 500 | Unlimited |
| Semantic compression | No | Yes (daily) | Yes (hourly) |
| Vector similarity search | No | Yes | Yes |
| Memory viewer UI | Yes | Yes | Yes |

**Key Files:**
- `migrations/019_agent_memory.sql` — Tables, RLS, IVFFlat indexes
- `src/utils/memorySanitizer.ts` — Strips secrets before storage
- `src/utils/embeddingService.ts` — OpenAI text-embedding-3-small
- `src/utils/cheapAICaller.ts` — Resolves cheapest AI for background summarisation
- `src/utils/memoryGenerator.ts` — generateChatMemory, generateTaskMemory, generateMeetingMemory
- `src/utils/buildMemoryContext.ts` — "What You Remember" prompt block builder
- `src/utils/memoryCompressor.ts` — Episodic to semantic compression
- `src/routes/memory.ts` — CRUD API
- `src/jobs/memoryCompression.ts` — Daily compression scheduler
- `src/api/memory.ts` (frontend) — API client

---

## Implementation Phases

**Phase 1 (MVP - 4 weeks):**
- Backend API with auth
- Single provider (OpenAI) support
- Basic cost tracking
- Real-time office sync

**Phase 2 (v1.0 - 4 more weeks):**
- Multi-provider support
- Team management
- Whiteboard persistence
- Billing/subscriptions

**Phase 2.5 (File Export):**
- [x] Browser download utility (`src/utils/download.ts`)
- [x] Download buttons on code blocks and task results
- [ ] Local Agent CLI (Pro tier) -- design + prototype
- [ ] Local Agent pairing flow (QR/token)
- [ ] Auto-export watch mode
- [ ] VS Code extension (optional, evaluate demand)

**Phase 2.7 (Rules + Agent Chat):**
- [x] Rules migration (`009_rules.sql`, `010_core_rules_preset.sql`)
- [x] Chat messages migration (`011_chat_messages.sql`)
- [x] Rules CRUD API (9 endpoints)
- [x] Chat history API (3 endpoints)
- [x] Core rules presets (5 presets, onboarding integration)
- [x] Rule injection at all AI callpoints (tasks, chat, meetings)
- [x] AI rule suggestion engine (fire-and-forget after tasks)
- [x] Tier-limited rule creation (`enforceRuleLimit` middleware)
- [x] Rules Dashboard UI (4-tab modal: Core / Team / Desk / Suggestions)
- [x] Agent Chat panel (glass-morphic floating panel, history persistence)
- [ ] Rules analytics (most-triggered rules, suggestion acceptance rate)

**Phase 2.8 (Agent Memory):**
- [x] Memory migration (`019_agent_memory.sql` — 3 tables, pgvector, RLS, IVFFlat indexes)
- [x] Memory sanitizer (strips secrets, API keys, PII patterns before storage)
- [x] Embedding service (OpenAI text-embedding-3-small, 1536 dimensions)
- [x] Cheap AI caller (resolves lowest-cost model for background summarisation)
- [x] Memory generators (chat sessions, task completions, meeting endings)
- [x] Memory context builder ("What You Remember" prompt block, injected at all AI callpoints)
- [x] Memory compressor (episodic to semantic compression, Pro/Enterprise daily cron)
- [x] Memory CRUD API (list, facts, delete, wipe, end-session endpoints)
- [x] Memory Viewer UI (Brain icon in AgentChat, collapsible section with list/facts/wipe)
- [x] Memory Indicator — OfficeCanvas (purple dot on pixel avatar, canvas-rendered with pulse)
- [x] Memory Indicator — DashboardView (purple dot on agent card, CSS-rendered with glow)
- [x] Memory Generation Animation (expanding purple ring + rising sparkle particles, 3s duration)
- [ ] Memory search UI (search across memories within the viewer)
- [ ] Memory export (download memory dump as JSON)

**Phase 3 (Scale):**
- Advanced analytics
- Custom agents
- API access for teams
- Enterprise features

## Critical Decisions

1. **Self-hosted vs Managed:** Start with managed (Render/Railway), migrate to K8s at scale
2. **WebSocket vs SSE:** WebSocket for bidirectional, SSE fallback
3. **Cost tracking:** Real-time via webhooks + daily reconciliation job
4. **Data retention:** 90 days hot, 2 years cold (S3)
5. **Local Agent tech:** Node.js CLI (lowest cost) vs Tauri (best UX) -- decide after Pro tier launch
6. **Rules storage:** Presets hardcoded in app code (not DB rows) — avoids migration churn, keeps presets versioned with code. Custom rules in DB.
7. **Chat history cap:** 50 messages per desk, auto-pruned on insert — keeps storage bounded without needing a background cleanup job.
8. **Memory encryption:** All memory content (episodic summaries, semantic facts) encrypted with AES-256-GCM at rest. Decrypted only on read via authenticated API endpoints.
9. **Memory tier gating via backend:** Frontend has no tier checks for memory. Backend returns empty facts array for Free tier; UI simply hides the section when `facts.length === 0`. Memory limits enforced server-side.
10. **Client-side memory counts:** Rather than adding memory counts to the desks API, the frontend fetches `getAgentMemories(deskId, 1, 0)` (limit=1) per desk to get the `total` count. Lightweight, zero backend changes needed.

**Estimated infra cost at 100 teams:** ~$500/month (before profit)
