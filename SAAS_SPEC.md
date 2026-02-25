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
                    ┌──────────────────────┼──────────────────────┐
                    ▼                      ▼                      ▼
              ┌──────────┐          ┌──────────┐          ┌──────────┐
              │ OpenAI   │          │ Anthropic│          │ Moonshot │
              │ API      │          │ API      │          │ API      │
              └──────────┘          └──────────┘          └──────────┘
```

## Key Architecture Decisions (2026-02-18)

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
```

**AI Proxy Service:**
```typescript
interface AIRequest {
  provider: 'openai' | 'anthropic' | 'moonshot';
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

**Estimated infra cost at 100 teams:** ~$500/month (before profit)
