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

// Store messages and responses
const messageQueue = [];
const responses = new Map(); // requestId -> response content

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
    timestamp: Date.now(),
    responded: false
  });
  
  console.log(`[Chat] Message queued: ${requestId}`);
  
  // Return immediately with requestId - client will poll for response
  res.json({
    requestId,
    status: 'pending',
    message: 'Message sent to OpenClaw, waiting for response...'
  });
});

// Endpoint for client to poll for response
app.get('/api/response/:requestId', (req, res) => {
  const { requestId } = req.params;
  const response = responses.get(requestId);
  
  if (response) {
    responses.delete(requestId); // Clean up
    res.json({
      status: 'complete',
      content: response.content,
      senderName: response.senderName,
      senderAvatar: response.senderAvatar
    });
  } else {
    // Check if message is still pending
    const message = messageQueue.find(m => m.requestId === requestId);
    if (message) {
      res.json({ status: 'pending' });
    } else {
      res.json({ status: 'not_found' });
    }
  }
});

// Endpoint for OpenClaw to check for new messages
app.get('/api/messages', (req, res) => {
  // Return only unresponded messages
  const unresponded = messageQueue.filter(m => !m.responded);
  res.json(unresponded);
});

// Endpoint for OpenClaw to mark message as responded (optional cleanup)
app.post('/api/messages/:requestId/ack', (req, res) => {
  const { requestId } = req.params;
  const message = messageQueue.find(m => m.requestId === requestId);
  if (message) {
    message.responded = true;
  }
  res.json({ success: true });
});

// Endpoint for OpenClaw to post responses
app.post('/api/respond', (req, res) => {
  const { requestId, content } = req.body;
  
  console.log(`[Response] OpenClaw responded to ${requestId}: ${content}`);
  
  // Store the response
  responses.set(requestId, {
    content,
    senderName: 'OpenClaw',
    senderAvatar: '🦅'
  });
  
  // Mark message as responded
  const message = messageQueue.find(m => m.requestId === requestId);
  if (message) {
    message.responded = true;
  }
  
  res.json({ success: true });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const tunnelUrl = getTunnelUrl();
  res.json({ 
    status: 'ok', 
    tunnelUrl: tunnelUrl || null,
    hasTunnel: !!tunnelUrl,
    pendingMessages: messageQueue.filter(m => !m.responded).length
  });
});

// Cleanup old messages every minute
setInterval(() => {
  const now = Date.now();
  const cutoff = now - 5 * 60 * 1000; // 5 minutes
  
  // Remove old messages from queue
  for (let i = messageQueue.length - 1; i >= 0; i--) {
    if (messageQueue[i].timestamp < cutoff) {
      messageQueue.splice(i, 1);
    }
  }
  
  // Remove old responses
  for (const [requestId, response] of responses.entries()) {
    if (response.timestamp < cutoff) {
      responses.delete(requestId);
    }
  }
}, 60000);

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
