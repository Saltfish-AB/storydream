import * as k8s from '@kubernetes/client-node';
import { v4 as uuidv4 } from 'uuid';
import { downloadProjectSrc, uploadProjectSrc, downloadSessionData, uploadSessionData } from './storage.js';
import { updateProject, getProject } from './projects.js';

// Load Kubernetes config (in-cluster when running in K8s, or from kubeconfig locally)
const kc = new k8s.KubeConfig();
if (process.env.RUNNING_IN_KUBERNETES === 'true') {
  kc.loadFromCluster();
} else {
  kc.loadFromDefault();
}

const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

const NAMESPACE = process.env.K8S_NAMESPACE || 'storydream';
const PROJECT_CONTAINER_IMAGE = process.env.PROJECT_CONTAINER_IMAGE ||
  'europe-north1-docker.pkg.dev/saltfish-434012/storydream/project-container:v2';

interface Session {
  id: string;
  shortId: string;
  projectId: string | null;
  podName: string;
  serviceName: string;
  podIp: string | null;
  previewPort: number;  // NodePort for preview
  agentPort: number;    // Container port (always 3001)
  agentSessionId: string | null;
  createdAt: Date;
}

const sessions = new Map<string, Session>();

/**
 * Create a new session by spinning up a Kubernetes pod
 */
export async function createSession(projectId?: string): Promise<Session> {
  const sessionId = uuidv4();
  const shortId = sessionId.substring(0, 8);
  const podName = `session-${shortId}`;
  const serviceName = `session-${shortId}-svc`;

  console.log(`Creating session ${sessionId}${projectId ? ` for project ${projectId}` : ''}...`);

  // Get existing agent session ID if available
  let agentSessionId: string | null = null;
  if (projectId) {
    try {
      const project = await getProject(projectId);
      if (project?.agentSessionId) {
        agentSessionId = project.agentSessionId;
        console.log(`Found existing agent session ID: ${agentSessionId}`);
      }
    } catch (error) {
      console.error(`Failed to get project ${projectId}:`, error);
    }
  }

  // Create the pod specification
  const pod: k8s.V1Pod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name: podName,
      namespace: NAMESPACE,
      labels: {
        app: 'session',
        'session-id': sessionId,
        'session-short-id': shortId,
        'project-id': projectId || 'none',
      },
    },
    spec: {
      restartPolicy: 'Never',
      serviceAccountName: 'session-sa',
      // Init container to download project data from GCS and set permissions
      initContainers: projectId ? [
        {
          name: 'init-project',
          image: 'google/cloud-sdk:slim',
          command: ['/bin/sh', '-c'],
          args: [
            `
            set -e
            echo "Downloading project src from GCS..."
            gsutil -m cp -r gs://${process.env.STORAGE_BUCKET || 'storydream-data'}/repos/${projectId}/src/* /project-src/ || echo "No src files found, using defaults"
            echo "Downloading session data from GCS..."
            gsutil -m cp -r gs://${process.env.STORAGE_BUCKET || 'storydream-data'}/repos/${projectId}/.claude/* /session-data/ 2>/dev/null || echo "No session data found"
            echo "Setting permissions for node user (UID 1000)..."
            chown -R 1000:1000 /project-src /session-data
            chmod -R 755 /project-src /session-data
            echo "Init complete"
            ls -la /project-src/ || true
            ls -la /session-data/ || true
            `
          ],
          volumeMounts: [
            { name: 'project-src', mountPath: '/project-src' },
            { name: 'session-data', mountPath: '/session-data' },
          ],
        },
      ] : undefined,
      containers: [
        {
          name: 'project-container',
          image: PROJECT_CONTAINER_IMAGE,
          imagePullPolicy: 'Always',
          ports: [
            { containerPort: 3000, name: 'preview' },
            { containerPort: 3001, name: 'agent-ws' },
            { containerPort: 3002, name: 'agent-http' },
          ],
          env: [
            { name: 'PROJECT_ID', value: projectId || '' },
            { name: 'AGENT_SESSION_ID', value: agentSessionId || '' },
            { name: 'GCP_PROJECT_ID', value: process.env.GCP_PROJECT_ID || 'saltfish-434012' },
            { name: 'STORAGE_BUCKET', value: process.env.STORAGE_BUCKET || 'storydream-data' },
            {
              name: 'ANTHROPIC_API_KEY',
              valueFrom: {
                secretKeyRef: {
                  name: 'storydream-secrets',
                  key: 'anthropic-api-key',
                },
              },
            },
          ],
          resources: {
            requests: { memory: '1Gi', cpu: '500m' },
            limits: { memory: '4Gi', cpu: '2000m' },
          },
          volumeMounts: [
            { name: 'project-src', mountPath: '/app/remotion-app/src' },
            { name: 'session-data', mountPath: '/home/node/.claude' },
          ],
          readinessProbe: {
            httpGet: { path: '/', port: 3000 as any },
            initialDelaySeconds: 5,
            periodSeconds: 2,
            failureThreshold: 30,
          },
        },
      ],
      volumes: [
        { name: 'project-src', emptyDir: {} },
        { name: 'session-data', emptyDir: {} },
      ],
      // Auto-terminate after 1 hour
      activeDeadlineSeconds: 3600,
    },
  };

  // Create the pod
  try {
    await k8sApi.createNamespacedPod({ namespace: NAMESPACE, body: pod });
    console.log(`Pod ${podName} created`);
  } catch (error: any) {
    console.error('Failed to create pod:', error.body?.message || error.message);
    throw error;
  }

  // Wait for pod to be ready and get its IP
  const podIp = await waitForPodReady(podName, 300000); // 5 minute timeout

  // No longer creating NodePort service - preview is accessed via backend proxy

  const session: Session = {
    id: sessionId,
    shortId,
    projectId: projectId || null,
    podName,
    serviceName,
    podIp,
    previewPort: 3000,  // Internal pod port, accessed via proxy
    agentPort: 3001,
    agentSessionId,
    createdAt: new Date(),
  };

  sessions.set(sessionId, session);

  console.log(`Session ${sessionId} created:`);
  console.log(`  - Pod: ${podName}`);
  console.log(`  - Pod IP: ${podIp}`);
  console.log(`  - Preview: /preview/${sessionId} (via proxy)`);
  console.log(`  - Agent WS: ws://${podIp}:3001`);

  return session;
}

/**
 * Wait for a pod to be ready and return its IP address
 */
async function waitForPodReady(podName: string, timeout: number): Promise<string> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      const response = await k8sApi.readNamespacedPod({ name: podName, namespace: NAMESPACE });
      const pod = response;
      const status = pod.status;

      if (status?.phase === 'Failed' || status?.phase === 'Unknown') {
        throw new Error(`Pod ${podName} failed: ${status.message || status.reason || 'unknown reason'}`);
      }

      // Check if pod is ready
      const containerStatuses = status?.containerStatuses || [];
      const allReady = containerStatuses.length > 0 &&
        containerStatuses.every(cs => cs.ready === true);

      if (allReady && status?.podIP) {
        return status.podIP;
      }

      // Log progress
      const phase = status?.phase || 'Unknown';
      const conditions = status?.conditions?.map(c => `${c.type}=${c.status}`).join(', ') || 'none';
      console.log(`Waiting for pod ${podName}: phase=${phase}, conditions=${conditions}`);
    } catch (error: any) {
      if (error.statusCode !== 404) {
        console.error(`Error checking pod ${podName}:`, error.body?.message || error.message);
      }
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  throw new Error(`Timeout waiting for pod ${podName} to be ready`);
}

/**
 * Destroy a session by deleting its pod
 */
export async function destroySession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) {
    console.log(`Session ${sessionId} not found`);
    return;
  }

  console.log(`Destroying session ${sessionId}...`);

  // Sync before destroying if project-based
  if (session.projectId) {
    try {
      await syncSession(sessionId);
    } catch (error) {
      console.error(`Final sync failed for session ${sessionId}:`, error);
    }
  }

  // Delete the pod (no NodePort service to delete - preview is accessed via proxy)
  try {
    await k8sApi.deleteNamespacedPod({
      name: session.podName,
      namespace: NAMESPACE,
      gracePeriodSeconds: 10,
    });
    console.log(`Pod ${session.podName} deleted`);
  } catch (error: any) {
    if (error.statusCode !== 404) {
      console.error(`Error deleting pod ${session.podName}:`, error.body?.message || error.message);
    }
  }

  sessions.delete(sessionId);
  console.log(`Session ${sessionId} destroyed`);
}

/**
 * Sync session changes back to Cloud Storage
 */
export async function syncSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session || !session.projectId || !session.podIp) {
    return;
  }

  console.log(`Syncing session ${sessionId} for project ${session.projectId}...`);

  try {
    const response = await fetch(`http://${session.podIp}:3002/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: session.projectId }),
    }).catch(() => null);

    if (response?.ok) {
      console.log(`Sync triggered for session ${sessionId}`);
    } else {
      console.log(`Sync endpoint not available, skipping sync for now`);
    }
  } catch (error) {
    console.error(`Sync failed for session ${sessionId}:`, error);
  }
}

/**
 * Update the agent session ID for a session
 */
export async function updateSessionAgentId(sessionId: string, agentSessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }

  session.agentSessionId = agentSessionId;

  if (session.projectId) {
    await updateProject(session.projectId, { agentSessionId });
    console.log(`Saved agent session ID ${agentSessionId} for project ${session.projectId}`);
  }
}

export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

export function getSessionByShortId(shortId: string): Session | undefined {
  for (const session of sessions.values()) {
    if (session.shortId === shortId) {
      return session;
    }
  }
  return undefined;
}

export function getAllSessions(): Session[] {
  return Array.from(sessions.values());
}

/**
 * Get the WebSocket URL for connecting to a session's agent
 */
export function getAgentWebSocketUrl(session: Session): string {
  return `ws://${session.podIp}:${session.agentPort}`;
}

/**
 * Get the preview URL for a session
 * In Kubernetes: uses subdomain (e.g., abc12345.storydream.saltfish.ai)
 * Locally: uses localhost with port
 */
export function getPreviewUrl(session: Session): string {
  if (process.env.RUNNING_IN_KUBERNETES === 'true') {
    return `https://${session.shortId}.storydream.saltfish.ai`;
  }
  return `http://localhost:${session.previewPort}`;
}

/**
 * Cleanup all sessions on shutdown
 */
export async function cleanupAllSessions(): Promise<void> {
  console.log('Cleaning up all sessions...');
  for (const session of sessions.values()) {
    await destroySession(session.id);
  }
}
