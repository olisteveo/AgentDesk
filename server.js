import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Store pending messages and responses
const pendingResponses = new Map();
const messageQueue = [];

// Get tunnel URL if available
function getTunnelUrl() {
  const tunnelUrlFile = path.join(__dirname, '.tunnel-url');
  if (fs.existsSync(tunnelUrlFile)) {
    return fs.readFileSync(tunnelUrlFile, 'utf8').trim();
  }
  return null;
}

// Endpoint to send a message to OpenClaw
app.post('/api/chat', async (req, res) => {
  const { message, meetingTopic, participantId } = req.body;
  
  console.log(`[Chat] Message from meeting "${meetingTopic}": ${message}`);
  
  const tunnelUrl = getTunnelUrl();
  if (!tunnelUrl) {
    console.log('[Chat] No tunnel URL found, using fallback response');
    return res.json({
      content: "I'm here! (Tunnel not connected yet — responses are simulated)",
      senderName: 'OpenClaw',
      senderAvatar: '🦅'
    });
  }
  
  // Create a unique request ID
  const requestId = Date.now().toString();
  
  // Add to message queue for OpenClaw to pick up
  messageQueue.push({
    requestId,
    message,
    meetingTopic,
    tunnelUrl,
    timestamp: Date.now()
  });
  
  console.log(`[Chat] Message queued for OpenClaw at ${tunnelUrl}`);
  
  // Store the response promise
  const responsePromise = new Promise((resolve) => {
    pendingResponses.set(requestId, resolve);
    
    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingResponses.has(requestId)) {
        pendingResponses.delete(requestId);
        resolve({
          content: "I'm thinking about that... could you give me a moment?",
          senderName: 'OpenClaw',
          senderAvatar: '🦅'
        });
      }
    }, 30000);
  });
  
  // Wait for response (OpenClaw will call /api/respond)
  const response = await responsePromise;
  res.json(response);
});

// Endpoint for OpenClaw to check for new messages
app.get('/api/messages', (req, res) => {
  const messages = [...messageQueue];
  messageQueue.length = 0; // Clear queue
  res.json(messages);
});

// Endpoint for OpenClaw to post responses
app.post('/api/respond', (req, res) => {
  const { requestId, content } = req.body;
  
  console.log(`[Response] OpenClaw responded to ${requestId}: ${content}`);
  
  const resolve = pendingResponses.get(requestId);
  if (resolve) {
    resolve({ 
      content, 
      senderName: 'OpenClaw', 
      senderAvatar: '🦅' 
    });
    pendingResponses.delete(requestId);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Request not found or timed out' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const tunnelUrl = getTunnelUrl();
  res.json({ 
    status: 'ok', 
    tunnelUrl: tunnelUrl || null,
    hasTunnel: !!tunnelUrl
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Chat bridge server running on http://localhost:${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
  
  const tunnelUrl = getTunnelUrl();
  if (tunnelUrl) {
    console.log(`🔗 Tunnel URL: ${tunnelUrl}`);
  } else {
    console.log('⏳ Waiting for tunnel... Run `npm run tunnel` in another terminal');
  }
});
