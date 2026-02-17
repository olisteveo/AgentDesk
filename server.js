import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Simple in-memory storage for when OpenClaw is local
const messages = [];

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Ready for local OpenClaw integration' });
});

// Placeholder: Receive messages from React app
// When OpenClaw is local, this will forward to it
app.post('/api/chat', (req, res) => {
  const { message, meetingTopic } = req.body;
  console.log(`[Meeting: ${meetingTopic}] User: ${message}`);
  
  // For now, just echo back
  // When OpenClaw is local, this will be: openclaw.send(message)
  res.json({
    content: "OpenClaw is not connected yet. Set up local OpenClaw for real responses.",
    senderName: 'System',
    senderAvatar: '⚙️'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server ready on http://localhost:${PORT}`);
  console.log('⏳ Waiting for local OpenClaw connection...');
});
