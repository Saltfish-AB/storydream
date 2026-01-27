import { WebSocketServer, WebSocket } from 'ws';
// Use Kubernetes when running in K8s, Docker when running locally
const useKubernetes = process.env.RUNNING_IN_KUBERNETES === 'true';
const containerModule = useKubernetes
  ? await import('./kubernetes.js')
  : await import('./container.js');
const { createSession, destroySession, getSession, syncSession, updateSessionAgentId } = containerModule;
import { saveMessage, getRecentMessages } from './firestore.js';
import { getProject, updateProject } from './projects.js';
import type { AgentAction } from './types.js';

interface ClientConnection {
  ws: WebSocket;
  sessionId: string | null;
  projectId: string | null;
  agentWs: WebSocket | null;
  cleanupTimer: NodeJS.Timeout | null;
  // Track current assistant response for saving
  currentAssistantResponse: string;
  currentActions: AgentAction[];
}

const clients = new Map<WebSocket, ClientConnection>();
const SESSION_CLEANUP_DELAY = 30000; // 30 seconds grace period

export function createWebSocketServer(port: number): WebSocketServer {
  const wss = new WebSocketServer({ port });

  console.log(`Backend WebSocket server listening on port ${port}`);

  wss.on('connection', (ws: WebSocket) => {
    console.log('Frontend client connected');

    const client: ClientConnection = {
      ws,
      sessionId: null,
      projectId: null,
      agentWs: null,
      cleanupTimer: null,
      currentAssistantResponse: '',
      currentActions: [],
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

      // Schedule cleanup after grace period
      if (client.sessionId) {
        console.log(`Scheduling session ${client.sessionId} cleanup in ${SESSION_CLEANUP_DELAY / 1000}s...`);
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
      await handleSessionStart(client, message.projectId);
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

async function handleSessionStart(client: ClientConnection, projectId?: string): Promise<void> {
  console.log(`Starting session${projectId ? ` for project ${projectId}` : ''}...`);

  // Destroy existing session if any
  if (client.sessionId) {
    await destroySession(client.sessionId);
    if (client.agentWs) {
      client.agentWs.close();
      client.agentWs = null;
    }
  }

  // If projectId provided, verify it exists
  if (projectId) {
    const project = await getProject(projectId);
    if (!project) {
      sendToClient(client.ws, {
        type: 'error',
        message: `Project ${projectId} not found`,
      });
      return;
    }
    client.projectId = projectId;
  }

  // Create new session with project context
  const session = await createSession(projectId);
  client.sessionId = session.id;

  // Wait for container/pod to be ready and get agent WebSocket URL
  let agentUrl: string;
  if (useKubernetes) {
    // In Kubernetes, use pod IP directly
    agentUrl = `ws://${(session as any).podIp}:${session.agentPort}`;
  } else {
    // Docker mode: use container name in Docker network, localhost otherwise
    const isRunningInDocker = process.env.RUNNING_IN_DOCKER === 'true';
    agentUrl = isRunningInDocker
      ? `ws://${(session as any).containerName}:3001`
      : `ws://localhost:${session.agentPort}`;
  }
  await waitForPort(agentUrl, 300000); // 5 min timeout for K8s pod startup (includes image pulls)

  // Connect to agent WebSocket
  client.agentWs = new WebSocket(agentUrl);

  client.agentWs.on('open', () => {
    console.log(`Connected to agent for session ${session.id}`);
    // Session continuity is now handled via AGENT_SESSION_ID env var and SDK resume
  });

  client.agentWs.on('message', async (data: Buffer) => {
    const message = JSON.parse(data.toString());

    // Handle session ID notification from agent (for persistence)
    if (message.type === 'session_id' && message.sessionId && client.sessionId) {
      console.log(`Agent reported session ID: ${message.sessionId}`);
      await updateSessionAgentId(client.sessionId, message.sessionId);
      return; // Don't forward this internal message to frontend
    }

    // Track assistant response content
    if (message.type === 'agent_message') {
      // Accumulate text content from assistant messages
      if (message.data?.message?.content) {
        const content = message.data.message.content;
        if (typeof content === 'string') {
          client.currentAssistantResponse += content;
        } else if (Array.isArray(content)) {
          // Handle array of content blocks
          for (const block of content) {
            if (block.type === 'text') {
              client.currentAssistantResponse += block.text;
            }
          }
        }
      }

      // Track tool use / actions
      if (message.data?.message?.tool_use) {
        const toolUse = message.data.message.tool_use;
        client.currentActions.push({
          type: mapToolToActionType(toolUse.name),
          filePath: toolUse.input?.file_path || toolUse.input?.path,
          summary: `${toolUse.name}: ${JSON.stringify(toolUse.input).substring(0, 100)}`,
        });
      }
    }

    // Forward agent messages to frontend
    sendToClient(client.ws, {
      type: 'agent:message',
      data: message,
    });

    // When agent completes, save the assistant message and sync to storage
    if (message.type === 'complete') {
      sendToClient(client.ws, { type: 'agent:complete' });

      // Save assistant response to Firestore
      if (client.projectId && client.currentAssistantResponse) {
        try {
          await saveMessage(client.projectId, {
            role: 'assistant',
            content: client.currentAssistantResponse,
            actions: client.currentActions.length > 0 ? client.currentActions : undefined,
          });
          console.log(`Saved assistant message for project ${client.projectId}`);
        } catch (error) {
          console.error('Failed to save assistant message:', error);
        }
      }

      // Sync project changes to Cloud Storage (don't await - run in background)
      if (client.sessionId) {
        syncSession(client.sessionId).catch((err) => {
          console.error('Background sync failed:', err);
        });
      }

      // Reset tracking
      client.currentAssistantResponse = '';
      client.currentActions = [];
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
  // Preview URL depends on environment
  let previewUrl: string;
  if (useKubernetes) {
    // In K8s, preview is accessed via NodePort on node's external IP
    const NODE_EXTERNAL_IP = process.env.NODE_EXTERNAL_IP || '34.88.112.102';
    previewUrl = `http://${NODE_EXTERNAL_IP}:${session.previewPort}`;
  } else {
    previewUrl = `http://localhost:${session.previewPort}`;
  }

  console.log(`Sending session:ready to frontend - sessionId: ${session.id}, previewUrl: ${previewUrl}`);
  sendToClient(client.ws, {
    type: 'session:ready',
    sessionId: session.id,
    projectId: client.projectId,
    previewUrl,
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

  // Save user message to Firestore if we have a project
  if (client.projectId) {
    try {
      await saveMessage(client.projectId, {
        role: 'user',
        content,
      });
      console.log(`Saved user message for project ${client.projectId}`);
    } catch (error) {
      console.error('Failed to save user message:', error);
    }
  }

  // Reset assistant response tracking for new message
  client.currentAssistantResponse = '';
  client.currentActions = [];

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

  client.projectId = null;
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
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  throw new Error(`Timeout waiting for ${url}`);
}

function mapToolToActionType(toolName: string): AgentAction['type'] {
  if (toolName.toLowerCase().includes('edit') || toolName.toLowerCase().includes('write')) {
    return 'file_edit';
  }
  if (toolName.toLowerCase().includes('create')) {
    return 'file_create';
  }
  if (toolName.toLowerCase().includes('delete') || toolName.toLowerCase().includes('remove')) {
    return 'file_delete';
  }
  return 'command_run';
}
