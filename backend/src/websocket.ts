import { WebSocketServer, WebSocket } from 'ws';
import { createSession, destroySession, getSession } from './container.js';

interface ClientConnection {
  ws: WebSocket;
  sessionId: string | null;
  agentWs: WebSocket | null;
  cleanupTimer: NodeJS.Timeout | null;
}

const clients = new Map<WebSocket, ClientConnection>();
const SESSION_CLEANUP_DELAY = 30000; // 30 seconds grace period before destroying session

export function createWebSocketServer(port: number): WebSocketServer {
  const wss = new WebSocketServer({ port });

  console.log(`Backend WebSocket server listening on port ${port}`);

  wss.on('connection', (ws: WebSocket) => {
    console.log('Frontend client connected');

    const client: ClientConnection = {
      ws,
      sessionId: null,
      agentWs: null,
      cleanupTimer: null,
    };
    clients.set(ws, client);

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        await handleMessage(client, message);
      } catch (error) {
        console.error('Error handling message:', error);
        sendToClient(ws, {
          type: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    ws.on('close', async () => {
      console.log('Frontend client disconnected');

      // Schedule cleanup after grace period (allows for reconnects)
      if (client.sessionId) {
        console.log(`Scheduling session ${client.sessionId} cleanup in ${SESSION_CLEANUP_DELAY/1000}s...`);
        client.cleanupTimer = setTimeout(async () => {
          console.log(`Cleaning up session ${client.sessionId} after grace period`);
          if (client.sessionId) {
            await destroySession(client.sessionId);
          }
          if (client.agentWs) {
            client.agentWs.close();
          }
        }, SESSION_CLEANUP_DELAY);
      }

      clients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  return wss;
}

async function handleMessage(client: ClientConnection, message: any): Promise<void> {
  switch (message.type) {
    case 'session:start':
      await handleSessionStart(client);
      break;

    case 'message:send':
      await handleMessageSend(client, message.content);
      break;

    case 'session:end':
      await handleSessionEnd(client);
      break;

    default:
      console.log('Unknown message type:', message.type);
  }
}

async function handleSessionStart(client: ClientConnection): Promise<void> {
  console.log('Starting new session...');

  // Destroy existing session if any
  if (client.sessionId) {
    await destroySession(client.sessionId);
    if (client.agentWs) {
      client.agentWs.close();
      client.agentWs = null;
    }
  }

  // Create new session
  const session = await createSession();
  client.sessionId = session.id;

  // Wait for container to be ready (use container name and internal port)
  const agentUrl = `ws://${session.containerName}:3001`;
  await waitForPort(agentUrl, 30000);

  // Connect to agent WebSocket
  client.agentWs = new WebSocket(agentUrl);

  client.agentWs.on('open', () => {
    console.log(`Connected to agent for session ${session.id}`);
  });

  client.agentWs.on('message', (data: Buffer) => {
    // Forward agent messages to frontend
    const message = JSON.parse(data.toString());
    sendToClient(client.ws, {
      type: 'agent:message',
      data: message,
    });

    if (message.type === 'complete') {
      sendToClient(client.ws, { type: 'agent:complete' });
    }
  });

  client.agentWs.on('error', (error) => {
    console.error('Agent WebSocket error:', error);
    sendToClient(client.ws, {
      type: 'error',
      message: 'Agent connection error',
    });
  });

  client.agentWs.on('close', () => {
    console.log(`Agent connection closed for session ${session.id}`);
  });

  // Send session ready to frontend
  sendToClient(client.ws, {
    type: 'session:ready',
    sessionId: session.id,
    previewUrl: `http://localhost:${session.previewPort}`,
  });
}

async function handleMessageSend(client: ClientConnection, content: string): Promise<void> {
  if (!client.agentWs || client.agentWs.readyState !== WebSocket.OPEN) {
    sendToClient(client.ws, {
      type: 'error',
      message: 'No active session or agent not connected',
    });
    return;
  }

  console.log('Forwarding message to agent:', content.substring(0, 100));

  // Forward to agent
  client.agentWs.send(JSON.stringify({
    type: 'prompt',
    content,
  }));
}

async function handleSessionEnd(client: ClientConnection): Promise<void> {
  if (client.sessionId) {
    await destroySession(client.sessionId);
    client.sessionId = null;
  }

  if (client.agentWs) {
    client.agentWs.close();
    client.agentWs = null;
  }

  sendToClient(client.ws, { type: 'session:ended' });
}

function sendToClient(ws: WebSocket, message: any): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

async function waitForPort(url: string, timeout: number): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      const ws = new WebSocket(url);
      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          ws.close();
          resolve();
        });
        ws.on('error', reject);
      });
      console.log(`${url} is ready`);
      return;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  throw new Error(`Timeout waiting for ${url}`);
}
