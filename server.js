const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Store pending messages and responses
const pendingResponses = new Map();

// Endpoint to send a message to OpenClaw
app.post('/api/chat', async (req, res) => {
  const { message, meetingTopic, participantId } = req.body;
  
  console.log(`[Chat] Message from meeting "${meetingTopic}": ${message}`);
  
  // Create a unique request ID
  const requestId = Date.now().toString();
  
  // Store the response promise
  const responsePromise = new Promise((resolve) => {
    pendingResponses.set(requestId, resolve);
    
    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingResponses.has(requestId)) {
        pendingResponses.delete(requestId);
        resolve({
          content: "I'm thinking about that...",
          senderName: 'OpenClaw',
          senderAvatar: '🦅'
        });
      }
    }, 30000);
  });
  
  // Send message to OpenClaw via sessions_send
  const openclawMessage = `[MEETING: ${meetingTopic}] User says: "${message}". Please respond as OpenClaw, the Operations Manager. Keep it conversational and helpful. Reply with just your response, no prefix.`;
  
  exec(`openclaw sessions send --sessionKey agent:main:main --message "${openclawMessage.replace(/"/g, '\\"')}"`, 
    { cwd: '/root/.openclaw/workspace/kreative-hq-react' },
    (error, stdout, stderr) => {
      if (error) {
        console.error('Error sending to OpenClaw:', error);
        return;
      }
      console.log('Message sent to OpenClaw:', stdout);
    }
  );
  
  // Wait for response
  const response = await responsePromise;
  res.json(response);
});

// Endpoint for OpenClaw to post responses
app.post('/api/response', (req, res) => {
  const { requestId, content, senderName, senderAvatar } = req.body;
  
  const resolve = pendingResponses.get(requestId);
  if (resolve) {
    resolve({ content, senderName, senderAvatar });
    pendingResponses.delete(requestId);
  }
  
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Chat bridge server running on http://localhost:${PORT}`);
});
