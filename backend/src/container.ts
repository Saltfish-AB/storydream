import Docker from 'dockerode';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import { downloadProjectSrc, uploadProjectSrc, downloadSessionData, uploadSessionData } from './storage.js';
import { updateProject, getProject } from './projects.js';

const docker = new Docker();

// Shared data directory - inside container and on host
const PROJECT_DATA_DIR = process.env.PROJECT_DATA_DIR || '/tmp';
const HOST_PROJECT_DATA_DIR = process.env.HOST_PROJECT_DATA_DIR || '/tmp';

const IMAGE_NAME = 'storydream-project';
const BASE_PREVIEW_PORT = 4100;
const BASE_AGENT_PORT = 4200;
const DOCKER_NETWORK = process.env.DOCKER_NETWORK || 'storydream_default';

interface Session {
  id: string;
  shortId: string; // First 8 chars of session ID
  projectId: string | null;
  containerId: string;
  containerName: string;
  podIp: null; // Not used in Docker mode, but included for interface compatibility
  previewPort: number;
  agentPort: number;
  localSrcPath: string | null; // Path to local copy of src/ for syncing
  localSessionPath: string | null; // Path to local copy of .claude/ for session persistence
  agentSessionId: string | null; // Claude Agent SDK session ID for resumption
  createdAt: Date;
}

const sessions = new Map<string, Session>();
let portCounter = 0;

export async function createSession(projectId?: string): Promise<Session> {
  const sessionId = uuidv4();
  const previewPort = BASE_PREVIEW_PORT + portCounter;
  const agentPort = BASE_AGENT_PORT + portCounter;
  portCounter++;
  const containerName = `storydream-${sessionId.substring(0, 8)}`;

  console.log(`Creating session ${sessionId}${projectId ? ` for project ${projectId}` : ''}...`);

  // If project ID provided, download src/ and session data from GCS
  let localSrcPath: string | null = null;
  let hostSrcPath: string | null = null;
  let localSessionPath: string | null = null;
  let hostSessionPath: string | null = null;
  let agentSessionId: string | null = null;
  const binds: string[] = [];

  if (projectId) {
    try {
      // Get project to retrieve existing agent session ID
      const project = await getProject(projectId);
      if (project?.agentSessionId) {
        agentSessionId = project.agentSessionId;
        console.log(`Found existing agent session ID: ${agentSessionId}`);
      }

      // Create a directory for the project's src files in the shared data dir
      const srcDirName = `src-${projectId.substring(0, 8)}-${sessionId.substring(0, 8)}`;
      localSrcPath = path.join(PROJECT_DATA_DIR, srcDirName);
      hostSrcPath = path.join(HOST_PROJECT_DATA_DIR, srcDirName);

      await fs.mkdir(localSrcPath, { recursive: true });
      console.log(`Downloading src/ for project ${projectId} to ${localSrcPath}...`);

      await downloadProjectSrc(projectId, localSrcPath);
      console.log(`Project src/ downloaded successfully`);

      // Mount only src/ into the container - use HOST path for Docker bind mount
      binds.push(`${hostSrcPath}:/app/remotion-app/src:rw`);

      // Create a directory for session data (.claude/)
      const sessionDirName = `claude-${projectId.substring(0, 8)}-${sessionId.substring(0, 8)}`;
      localSessionPath = path.join(PROJECT_DATA_DIR, sessionDirName);
      hostSessionPath = path.join(HOST_PROJECT_DATA_DIR, sessionDirName);

      await fs.mkdir(localSessionPath, { recursive: true });

      // Download existing session data if available
      if (agentSessionId) {
        console.log(`Downloading session data for project ${projectId}...`);
        await downloadSessionData(projectId, localSessionPath);
      }

      // Mount .claude/ into the container's home directory
      binds.push(`${hostSessionPath}:/home/node/.claude:rw`);
    } catch (error) {
      console.error(`Failed to set up project ${projectId}:`, error);
      // Clean up directories on failure
      if (localSrcPath) {
        await fs.rm(localSrcPath, { recursive: true, force: true }).catch(() => {});
      }
      if (localSessionPath) {
        await fs.rm(localSessionPath, { recursive: true, force: true }).catch(() => {});
      }
      throw error;
    }
  }

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
      NetworkMode: DOCKER_NETWORK,
      Binds: binds.length > 0 ? binds : undefined,
    },
    Env: [
      `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY}`,
      `PROJECT_ID=${projectId || ''}`,
      `AGENT_SESSION_ID=${agentSessionId || ''}`,
    ],
  });

  // Start container
  await container.start();

  const session: Session = {
    id: sessionId,
    shortId: sessionId.substring(0, 8),
    projectId: projectId || null,
    containerId: container.id,
    containerName,
    podIp: null, // Not used in Docker mode
    previewPort,
    agentPort,
    localSrcPath,
    localSessionPath,
    agentSessionId,
    createdAt: new Date(),
  };

  sessions.set(sessionId, session);

  console.log(`Session ${sessionId} created:`);
  console.log(`  - Preview: http://localhost:${previewPort}`);
  console.log(`  - Agent (internal): ws://${containerName}:3001`);
  if (localSrcPath) {
    console.log(`  - Local src: ${localSrcPath}`);
  }
  if (agentSessionId) {
    console.log(`  - Resuming agent session: ${agentSessionId}`);
  }

  return session;
}

export async function destroySession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) {
    console.log(`Session ${sessionId} not found`);
    return;
  }

  console.log(`Destroying session ${sessionId}...`);

  // Final sync before destroying (if project-based)
  if (session.projectId && session.localSrcPath) {
    try {
      await syncSession(sessionId);
    } catch (error) {
      console.error(`Final sync failed for session ${sessionId}:`, error);
    }
  }

  try {
    const container = docker.getContainer(session.containerId);
    await container.stop();
  } catch (error) {
    // Container might already be stopped
    console.log(`Container stop error (may be expected):`, error);
  }

  // Clean up local src directory
  if (session.localSrcPath) {
    try {
      await fs.rm(session.localSrcPath, { recursive: true, force: true });
      console.log(`Cleaned up local src: ${session.localSrcPath}`);
    } catch (error) {
      console.error(`Failed to cleanup local src:`, error);
    }
  }

  // Clean up local session directory
  if (session.localSessionPath) {
    try {
      await fs.rm(session.localSessionPath, { recursive: true, force: true });
      console.log(`Cleaned up local session: ${session.localSessionPath}`);
    } catch (error) {
      console.error(`Failed to cleanup local session:`, error);
    }
  }

  sessions.delete(sessionId);
  console.log(`Session ${sessionId} destroyed`);
}

/**
 * Sync session changes back to Cloud Storage
 * Uploads src/ directory and session data
 */
export async function syncSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) {
    console.log(`Session ${sessionId} not found for sync`);
    return;
  }

  if (!session.projectId || !session.localSrcPath) {
    console.log(`Session ${sessionId} has no project to sync`);
    return;
  }

  console.log(`Syncing session ${sessionId} for project ${session.projectId}...`);

  try {
    // Upload only src/ to Cloud Storage
    const versionId = await uploadProjectSrc(session.projectId, session.localSrcPath);
    console.log(`Uploaded src/ to GCS, version: ${versionId}`);

    // Upload session data to Cloud Storage (if available)
    if (session.localSessionPath) {
      await uploadSessionData(session.projectId, session.localSessionPath);
    }

    // Update project in Firestore with new version
    await updateProject(session.projectId, { currentCommitSha: versionId });
    console.log(`Updated project ${session.projectId} version`);
  } catch (error) {
    console.error(`Sync failed for session ${sessionId}:`, error);
    throw error;
  }
}

/**
 * Update the agent session ID for a session
 * Called when the agent reports its session ID
 */
export async function updateSessionAgentId(sessionId: string, agentSessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) {
    console.log(`Session ${sessionId} not found for agent ID update`);
    return;
  }

  session.agentSessionId = agentSessionId;

  // Also update in Firestore if we have a project
  if (session.projectId) {
    await updateProject(session.projectId, { agentSessionId });
    console.log(`Saved agent session ID ${agentSessionId} for project ${session.projectId}`);
  }
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
