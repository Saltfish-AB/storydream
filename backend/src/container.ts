import Docker from 'dockerode';
import { v4 as uuidv4 } from 'uuid';

const docker = new Docker();

const IMAGE_NAME = 'storydream-project';
const BASE_PREVIEW_PORT = 4100;
const BASE_AGENT_PORT = 4200;

interface Session {
  id: string;
  containerId: string;
  containerName: string;
  previewPort: number;
  agentPort: number;
  createdAt: Date;
}

const sessions = new Map<string, Session>();
let portCounter = 0;

export async function createSession(): Promise<Session> {
  const sessionId = uuidv4();
  const previewPort = BASE_PREVIEW_PORT + portCounter;
  const agentPort = BASE_AGENT_PORT + portCounter;
  portCounter++;
  const containerName = `storydream-${sessionId.substring(0, 8)}`;

  console.log(`Creating session ${sessionId}...`);

  // Create container on the same network as the backend
  const container = await docker.createContainer({
    Image: IMAGE_NAME,
    name: containerName,
    ExposedPorts: {
      '3000/tcp': {},
      '3001/tcp': {},
    },
    HostConfig: {
      PortBindings: {
        '3000/tcp': [{ HostPort: previewPort.toString() }],
        '3001/tcp': [{ HostPort: agentPort.toString() }],
      },
      AutoRemove: true,
      NetworkMode: 'storydream_default',
    },
    Env: [
      `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY}`,
    ],
  });

  // Start container
  await container.start();

  const session: Session = {
    id: sessionId,
    containerId: container.id,
    containerName,
    previewPort,
    agentPort,
    createdAt: new Date(),
  };

  sessions.set(sessionId, session);

  console.log(`Session ${sessionId} created:`);
  console.log(`  - Preview: http://localhost:${previewPort}`);
  console.log(`  - Agent (internal): ws://${containerName}:3001`);

  return session;
}

export async function destroySession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) {
    console.log(`Session ${sessionId} not found`);
    return;
  }

  console.log(`Destroying session ${sessionId}...`);

  try {
    const container = docker.getContainer(session.containerId);
    await container.stop();
  } catch (error) {
    // Container might already be stopped
    console.log(`Container stop error (may be expected):`, error);
  }

  sessions.delete(sessionId);
  console.log(`Session ${sessionId} destroyed`);
}

export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

export function getAllSessions(): Session[] {
  return Array.from(sessions.values());
}

// Cleanup all sessions on shutdown
export async function cleanupAllSessions(): Promise<void> {
  console.log('Cleaning up all sessions...');
  for (const session of sessions.values()) {
    await destroySession(session.id);
  }
}
