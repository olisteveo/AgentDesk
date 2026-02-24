# Agent Desk

A SaaS workspace platform for managing AI agent teams. Agent Desk provides collaboration, cost tracking, and workflow management for teams that use multiple AI providers. Built with React 19, TypeScript, Express, and PostgreSQL.

Agent Desk is a **BYOK** (Bring Your Own Keys) platform. Users connect their own API keys from providers like OpenAI, Anthropic, Google, and Moonshot. Agent Desk never charges for AI usage — only for workspace features.

## Architecture

```
Frontend (React 19 + Vite)          Backend (Express + TypeScript)
├── Auth flow (JWT + Google OAuth)  ├── Authentication & authorization
├── Canvas-based office UI          ├── Encrypted API key storage (AES-256-GCM)
├── Provider management panel       ├── Multi-provider AI proxy
├── Desk & agent management         ├── Cost tracking & analytics
├── Meeting room UI                 ├── Row-level security (PostgreSQL)
├── Whiteboard                      ├── Plan-based feature gating
└── Cost analytics dashboard        └── Budget enforcement middleware
```

### Key Directories

```
Agent_desk/                         agentDesk_backend/
├── src/                            ├── src/
│   ├── api/                        │   ├── routes/
│   │   ├── client.ts               │   │   ├── auth.ts
│   │   ├── auth.ts                 │   │   ├── ai.ts
│   │   ├── chat.ts                 │   │   ├── providers.ts
│   │   ├── providers.ts            │   │   ├── desks.ts
│   │   ├── desks.ts                │   │   ├── tasks.ts
│   │   ├── tasks.ts                │   │   ├── meetings.ts
│   │   ├── meetings.ts             │   │   ├── team.ts
│   │   └── team.ts                 │   │   └── whiteboard.ts
│   ├── components/                 │   ├── middleware/
│   │   ├── OfficeCanvas.tsx        │   │   ├── auth.ts
│   │   ├── auth/                   │   │   ├── budget.ts
│   │   └── modals/                 │   │   ├── tierLimits.ts
│   ├── contexts/                   │   │   └── rls.ts
│   │   └── AuthContext.tsx         │   ├── config/
│   ├── pages/                      │   │   ├── database.ts
│   ├── types/                      │   │   └── encryption.ts
│   └── utils/                      │   └── types/
│       └── constants.ts            │       └── index.ts
└── public/                         └── migrations/
    └── assets/                         ├── 001_core.sql
                                        ├── 002_whiteboard.sql
                                        └── ...
```

## Features

### Workspace

- Gamified virtual office with HTML5 Canvas rendering
- Desk-based AI agent management (create, assign models, customise)
- Multi-agent meeting room with conversation history
- Strategy whiteboard with tabbed categories
- Task assignment and execution tracking

### AI Integration

- Multi-provider support: OpenAI, Anthropic, Google, Moonshot
- Encrypted API key storage (AES-256-GCM at rest)
- Validate-before-save key verification
- Per-desk model assignment (1-4 models per desk, primary selection)
- Live model discovery from provider APIs
- Chat completions proxied through backend with cost tracking

### Cost Management

- Per-call cost recording with token counts
- Daily and monthly spend aggregation
- Per-desk and per-user cost breakdowns
- Configurable daily budget enforcement with alerts
- Model pricing table with input/output rates

### Plan Tiers

| Feature | Starter (Free) | Pro ($29/mo) | Team ($79/mo) |
|---------|---------------|--------------|---------------|
| Users | 1 | 5 | Unlimited |
| AI Agent Desks | 3 | 6 | 20 |
| Provider Connections | 3 | 6 | Unlimited |
| Task Management | Basic | Advanced | Advanced |
| Analytics | Basic cost overview | Full dashboard | Full dashboard |
| Meeting Room | -- | Yes | Yes |
| Whiteboard | 2 tabs | 6 tabs | Unlimited |
| Support | Community | Priority email | Dedicated |

### Authentication

- Email/password with bcrypt hashing
- Google OAuth integration
- JWT access + refresh token flow
- Email verification via Resend
- Rate-limited registration and email resend
- Account deletion with security confirmation

## Prerequisites

- Node.js 18+
- PostgreSQL 15+
- npm

## Setup

### Backend

```bash
cd agentDesk_backend

# Install dependencies
npm install

# Create .env from example
cp .env.example .env
# Edit .env with your database URL, JWT secrets, encryption key, etc.

# Run database migrations
npm run migrate

# Start development server
npm run dev
```

The backend runs on `http://localhost:3001`.

### Frontend

```bash
cd Agent_desk

# Install dependencies
npm install

# Start development server
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies API requests to the backend.

### Environment Variables

#### Backend (.env)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `ENCRYPTION_KEY` | 32-byte base64 key for API key encryption |
| `JWT_SECRET` | Secret for signing access tokens |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `RESEND_API_KEY` | Resend API key for email delivery |
| `FRONTEND_URL` | Frontend origin for CORS |

## API Endpoints

### Authentication
- `POST /api/auth/register` -- Create team + owner
- `POST /api/auth/login` -- Password login
- `POST /api/auth/google` -- Google OAuth
- `POST /api/auth/refresh` -- Refresh access token
- `POST /api/auth/verify-email` -- Email verification
- `PATCH /api/auth/select-plan` -- Plan selection
- `PATCH /api/auth/onboarding` -- CEO name + avatar

### AI
- `POST /api/ai/chat` -- Chat completion (proxied to provider)

### Providers
- `GET /api/providers` -- List connections (masked keys)
- `POST /api/providers` -- Add API key (encrypted)
- `POST /api/providers/validate` -- Test key before saving
- `POST /api/providers/:id/test` -- Test stored key
- `GET /api/providers/:id/models` -- Discover available models
- `PATCH /api/providers/:id` -- Rotate API key
- `DELETE /api/providers/:id` -- Disconnect provider

### Desks
- `GET /api/desks` -- List desks with models
- `POST /api/desks` -- Create desk
- `PATCH /api/desks/:id` -- Update desk
- `DELETE /api/desks/:id` -- Remove desk
- `GET /api/desks/:id/usage` -- Desk cost analytics

### Tasks
- `GET /api/tasks` -- List tasks (filterable)
- `POST /api/tasks` -- Create task
- `PATCH /api/tasks/:id` -- Update task
- `POST /api/tasks/:id/run` -- Execute task with AI

### Meetings
- `GET /api/meetings` -- List meetings
- `POST /api/meetings` -- Start meeting
- `POST /api/meetings/:id/ask` -- Query agent in meeting
- `PATCH /api/meetings/:id/end` -- End meeting

### Team
- `GET /api/team/usage` -- Cost dashboard
- `GET /api/team/usage/by-desk` -- Per-desk costs
- `GET /api/team/alerts` -- Budget alerts

## Security

- API keys encrypted at rest with AES-256-GCM (separate IV + auth tag per key)
- Row-level security in PostgreSQL (team isolation)
- JWT with short-lived access tokens (15m) and refresh tokens (7d)
- Rate limiting on registration and sensitive endpoints
- CORS restricted to frontend origin
- Keys never logged or exposed in API responses (masked only)

## Database

PostgreSQL with migration tracking. Migrations are in `agentDesk_backend/migrations/` and run sequentially. Key tables:

- `teams` -- Workspace with plan tier and budget
- `users` -- Team members with roles (owner/admin/member)
- `provider_credentials` -- Encrypted API keys
- `desks` -- AI agent desks with metadata
- `desk_models` -- Model assignments per desk
- `tasks` -- Task records with AI results
- `ai_usage` -- Per-call cost and token tracking
- `meetings` -- Multi-agent discussion sessions
- `cost_alerts` -- Budget threshold notifications

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, HTML5 Canvas, Lucide React
- **Backend**: Express, TypeScript, PostgreSQL, node-postgres
- **Auth**: JWT (jsonwebtoken), bcryptjs, Google OAuth (google-auth-library)
- **Email**: Resend
- **Encryption**: Node.js crypto (AES-256-GCM)

## Supported AI Providers & Models

### OpenAI
GPT-4.1, GPT-4.1 Mini, GPT-4.1 Nano, GPT-4o, GPT-4o Mini, O3, O3 Mini, O4 Mini, Codex Mini

### Anthropic
Claude Opus 4, Claude Sonnet 4, Claude Sonnet 4.5, Claude Haiku 3.5

### Google
Gemini 2.5 Pro, Gemini 2.5 Flash, Gemini 2.0 Flash, Gemini 2.0 Flash Lite

### Moonshot
Kimi K2.5, Kimi K1.5

## License

MIT
