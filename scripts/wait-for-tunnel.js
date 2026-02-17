import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tunnelUrlFile = path.join(__dirname, '..', '.tunnel-url');

console.log('🚀 Starting Cloudflare tunnel...');
console.log('⏳ Waiting for tunnel URL...');

// Start cloudflared tunnel
const tunnel = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:3001'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let tunnelUrl = null;

// Parse output to find tunnel URL
tunnel.stdout.on('data', (data) => {
  const output = data.toString();
  console.log(output.trim());
  
  // Look for tunnel URL in output
  const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (match && !tunnelUrl) {
    tunnelUrl = match[0];
    console.log(`\n✅ Tunnel URL: ${tunnelUrl}`);
    console.log('📡 OpenClaw will connect to this URL\n');
    
    // Save to file for server to read
    fs.writeFileSync(tunnelUrlFile, tunnelUrl);
  }
});

tunnel.stderr.on('data', (data) => {
  const output = data.toString();
  // Only log errors, not regular info
  if (output.includes('ERR') || output.includes('error')) {
    console.error('Tunnel error:', output.trim());
  }
});

// Handle cleanup
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down tunnel...');
  tunnel.kill();
  if (fs.existsSync(tunnelUrlFile)) {
    fs.unlinkSync(tunnelUrlFile);
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  tunnel.kill();
  if (fs.existsSync(tunnelUrlFile)) {
    fs.unlinkSync(tunnelUrlFile);
  }
  process.exit(0);
});
