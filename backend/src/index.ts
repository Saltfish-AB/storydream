import 'dotenv/config';
import { createWebSocketServer } from './websocket.js';
import { cleanupAllSessions } from './container.js';

// Load .env from parent directory
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '../.env') });

const PORT = parseInt(process.env.PORT || '8080');

console.log('Starting StoryDream backend...');

// Create WebSocket server
const wss = createWebSocketServer(PORT);

// Handle graceful shutdown
async function shutdown() {
  console.log('Shutting down backend...');

  // Close WebSocket server
  wss.close();

  // Cleanup all sessions
  await cleanupAllSessions();

  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log(`Backend ready on port ${PORT}`);
