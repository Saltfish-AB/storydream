import { query } from '@anthropic-ai/claude-agent-sdk';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const PORT = 3001;
const HTTP_PORT = 3002;
const REMOTION_APP_PATH = '/app/remotion-app';
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || 'storydream-data';

// Read initial session ID from environment (for session persistence across container restarts)
const INITIAL_SESSION_ID = process.env.AGENT_SESSION_ID || null;

const wss = new WebSocketServer({ port: PORT });

console.log(`Agent WebSocket server listening on port ${PORT}`);
if (INITIAL_SESSION_ID) {
  console.log(`Will resume agent session: ${INITIAL_SESSION_ID}`);
}

wss.on('connection', (ws: WebSocket) => {
  console.log('Client connected');

  let currentQuery: AsyncGenerator | null = null;
  let abortController: AbortController | null = null;
  // Initialize with session ID from environment if available (for persistence)
  let sessionId: string | null = INITIAL_SESSION_ID;

  ws.on('message', async (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === 'prompt') {
        // Cancel any existing query
        if (abortController) {
          abortController.abort();
        }

        abortController = new AbortController();

        console.log('Received prompt:', message.content);
        console.log('Starting Claude query...', sessionId ? `(resuming session ${sessionId})` : '(new session)');

        // Build query options - use resume if we have a session ID
        const queryOptions: any = {
          model: 'claude-opus-4-5-20251101',
          cwd: REMOTION_APP_PATH,
          abortController,
          // Always bypass permissions (safe since agent runs in sandboxed container)
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          // Load skills and CLAUDE.md from project directory
          // All tools including Skill are allowed by default
          settingSources: ['user', 'project'],
        };

        // Only set systemPrompt for new sessions
        if (!sessionId) {
          queryOptions.systemPrompt = {
            type: 'preset',
            preset: 'claude_code',
          };
        } else {
          // Resume existing session to maintain conversation context
          queryOptions.resume = sessionId;
        }

        currentQuery = query({
          prompt: message.content,
          options: queryOptions,
        });

        // Stream messages back to client
        console.log('Starting to stream messages...');
        let messageCount = 0;
        for await (const sdkMessage of currentQuery) {
          messageCount++;
          console.log(`Message ${messageCount}:`, sdkMessage.type, JSON.stringify(sdkMessage).substring(0, 500));

          // Capture session ID from system init message for conversation continuity
          if (sdkMessage.type === 'system' && sdkMessage.subtype === 'init' && sdkMessage.session_id) {
            const newSessionId = sdkMessage.session_id;
            // Only notify backend if this is a new session (not resuming)
            if (newSessionId !== sessionId) {
              sessionId = newSessionId;
              console.log(`Captured new session ID: ${sessionId}`);
              // Notify backend of the new session ID for persistence
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'session_id',
                  sessionId: sessionId,
                }));
              }
            } else {
              console.log(`Resumed existing session: ${sessionId}`);
            }
          }

          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'agent_message',
              data: sdkMessage,
            }));
          } else {
            console.log('WebSocket not open, state:', ws.readyState);
          }
        }
        console.log(`Stream completed with ${messageCount} messages`);

        // Signal completion
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'complete' }));
          console.log('Sent complete signal');
        }

      } else if (message.type === 'cancel') {
        if (abortController) {
          abortController.abort();
          console.log('Query cancelled');
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        }));
      }
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    if (abortController) {
      abortController.abort();
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// HTTP server for sync endpoint
const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/sync') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const { projectId } = JSON.parse(body);

        if (!projectId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'projectId is required' }));
          return;
        }

        console.log(`Syncing project ${projectId} to GCS...`);

        // Upload src/ directory to GCS
        const srcPath = `gs://${STORAGE_BUCKET}/repos/${projectId}/src`;
        console.log(`Uploading src/ to ${srcPath}...`);

        try {
          const { stdout, stderr } = await execAsync(
            `gsutil -m cp -r ${REMOTION_APP_PATH}/src/* ${srcPath}/`,
            { timeout: 60000 }
          );
          if (stdout) console.log('gsutil stdout:', stdout);
          if (stderr) console.log('gsutil stderr:', stderr);
          console.log(`Successfully uploaded src/ for project ${projectId}`);
        } catch (uploadError: any) {
          console.error('Failed to upload src/:', uploadError.message);
          throw uploadError;
        }

        // Upload session data (.claude/) if it exists
        const claudeSessionPath = '/home/node/.claude';
        try {
          const sessionGcsPath = `gs://${STORAGE_BUCKET}/repos/${projectId}/.claude`;
          const { stdout, stderr } = await execAsync(
            `gsutil -m cp -r ${claudeSessionPath}/* ${sessionGcsPath}/ 2>/dev/null || true`,
            { timeout: 60000 }
          );
          if (stdout) console.log('Session upload stdout:', stdout);
          console.log(`Session data uploaded for project ${projectId}`);
        } catch (sessionError) {
          // Session data upload is optional, don't fail if it doesn't exist
          console.log('No session data to upload (or upload failed)');
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, projectId }));
      } catch (error: any) {
        console.error('Sync failed:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

httpServer.listen(HTTP_PORT, () => {
  console.log(`HTTP sync server listening on port ${HTTP_PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down agent server...');
  httpServer.close();
  wss.close(() => {
    process.exit(0);
  });
});
