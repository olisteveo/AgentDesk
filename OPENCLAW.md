# 🦅 OpenClaw Integration

This project includes built-in integration with OpenClaw (AI Operations Manager) for real-time chat in the meeting room.

## Quick Start

### Prerequisites
- Node.js 18+
- cloudflared (install with `brew install cloudflared` on Mac)

### Option 1: One-Command Start (Recommended)

```bash
npm run dev:with-claw
```

This starts:
1. The chat bridge server (port 3001)
2. Cloudflare tunnel (creates public URL)
3. React dev server (port 5173)

### Option 2: Manual Start

Terminal 1 - Start the server:
```bash
npm run server
```

Terminal 2 - Create tunnel:
```bash
npm run tunnel
```

Terminal 3 - Start React app:
```bash
npm run dev
```

## How It Works

1. **User sends message** in meeting room → React app → Local server
2. **Server creates tunnel** → Public URL via Cloudflare
3. **OpenClaw polls** the tunnel URL for new messages
4. **OpenClaw responds** via the `/api/respond` endpoint
5. **Response appears** in the meeting chat

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│  React App  │────▶│ Local Server│────▶│ Cloudflare Tunnel│
│  (Port 5173)│     │ (Port 3001) │     │ (Public URL)     │
└─────────────┘     └─────────────┘     └─────────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  OpenClaw   │
                                        │  (Remote)   │
                                        └─────────────┘
```

## API Endpoints

- `POST /api/chat` - Send a message to OpenClaw
- `GET /api/messages` - Poll for new messages (OpenClaw uses this)
- `POST /api/respond` - OpenClaw posts responses here
- `GET /api/health` - Check tunnel status

## Troubleshooting

**"Tunnel not connected" message in chat:**
- Make sure `cloudflared` is installed: `brew install cloudflared`
- Check tunnel is running: `npm run tunnel`
- Verify health: `curl http://localhost:3001/api/health`

**No response from OpenClaw:**
- The tunnel URL must be accessible from the internet
- Check the tunnel URL in the terminal output
- Verify OpenClaw is polling the correct URL

## Security Notes

- The tunnel is temporary and changes each time you restart
- Only use for development, not production
- The tunnel exposes your local server to the internet
