import * as k8s from '@kubernetes/client-node';
import { v4 as uuidv4 } from 'uuid';
import { bucket } from './storage.js';

// Types
export interface RenderJobOptions {
  projectId: string;
  compositionId?: string;
  format?: 'mp4' | 'webm';
}

export interface RenderJob {
  renderId: string;
  projectId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  outputUrl?: string;
  error?: string;
  progress?: number;
}

// Event types for WebSocket notifications
export interface RenderStartEvent {
  type: 'render:started';
  renderId: string;
  projectId: string;
}

export interface RenderProgressEvent {
  type: 'render:progress';
  renderId: string;
  progress: number;
}

export interface RenderCompleteEvent {
  type: 'render:complete';
  renderId: string;
  projectId: string;
  outputUrl: string;
}

export interface RenderFailedEvent {
  type: 'render:failed';
  renderId: string;
  projectId: string;
  error: string;
}

export type RenderEvent = RenderStartEvent | RenderProgressEvent | RenderCompleteEvent | RenderFailedEvent;

// Store active render jobs in memory (use Firestore in production for persistence)
const activeJobs = new Map<string, RenderJob>();

// Event listeners for WebSocket notifications
type RenderEventListener = (event: RenderEvent) => void;
const eventListeners: RenderEventListener[] = [];

export function addRenderEventListener(listener: RenderEventListener): void {
  eventListeners.push(listener);
}

export function removeRenderEventListener(listener: RenderEventListener): void {
  const index = eventListeners.indexOf(listener);
  if (index > -1) {
    eventListeners.splice(index, 1);
  }
}

function emitRenderEvent(event: RenderEvent): void {
  eventListeners.forEach(listener => {
    try {
      listener(event);
    } catch (error) {
      console.error('Error in render event listener:', error);
    }
  });
}

// Load Kubernetes config
const kc = new k8s.KubeConfig();
if (process.env.RUNNING_IN_KUBERNETES === 'true') {
  kc.loadFromCluster();
} else {
  kc.loadFromDefault();
}

const batchApi = kc.makeApiClient(k8s.BatchV1Api);
const coreApi = kc.makeApiClient(k8s.CoreV1Api);

const NAMESPACE = process.env.K8S_NAMESPACE || 'storydream';
const GCS_BUCKET = process.env.STORAGE_BUCKET || 'storydream-data';
const RENDER_IMAGE = process.env.RENDER_CONTAINER_IMAGE ||
  'europe-north1-docker.pkg.dev/saltfish-434012/storydream/render-container:latest';

/**
 * Create a new render job
 */
export async function createRenderJob(options: RenderJobOptions): Promise<RenderJob> {
  const renderId = uuidv4();
  const { projectId, compositionId = 'MyVideo', format = 'mp4' } = options;

  console.log(`Creating render job ${renderId} for project ${projectId}...`);

  const jobName = `render-${renderId.slice(0, 8)}`;

  const job: k8s.V1Job = {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: jobName,
      namespace: NAMESPACE,
      labels: {
        app: 'storydream-render',
        'project-id': projectId,
        'render-id': renderId,
      },
    },
    spec: {
      ttlSecondsAfterFinished: 3600, // Cleanup after 1 hour
      backoffLimit: 1, // Only retry once on failure
      activeDeadlineSeconds: 600, // 10 minute timeout
      template: {
        metadata: {
          labels: {
            app: 'storydream-render',
            'project-id': projectId,
            'render-id': renderId,
          },
        },
        spec: {
          restartPolicy: 'Never',
          serviceAccountName: 'storydream-render',
          containers: [
            {
              name: 'render',
              image: RENDER_IMAGE,
              env: [
                { name: 'PROJECT_ID', value: projectId },
                { name: 'RENDER_ID', value: renderId },
                { name: 'GCS_BUCKET', value: GCS_BUCKET },
                { name: 'COMPOSITION_ID', value: compositionId },
                { name: 'OUTPUT_FORMAT', value: format },
              ],
              resources: {
                requests: { cpu: '2', memory: '4Gi' },
                limits: { cpu: '4', memory: '8Gi' },
              },
            },
          ],
        },
      },
    },
  };

  try {
    await batchApi.createNamespacedJob({ namespace: NAMESPACE, body: job });
    console.log(`K8s Job ${jobName} created`);
  } catch (error: any) {
    console.error('Failed to create render job:', error.body?.message || error.message);
    throw new Error(`Failed to create render job: ${error.body?.message || error.message}`);
  }

  const renderJob: RenderJob = {
    renderId,
    projectId,
    status: 'pending',
    createdAt: new Date(),
    progress: 0,
  };

  activeJobs.set(renderId, renderJob);

  // Emit started event
  emitRenderEvent({
    type: 'render:started',
    renderId,
    projectId,
  });

  // Start watching job status
  watchJobStatus(renderId, jobName);

  return renderJob;
}

/**
 * Read render metadata from GCS
 */
async function readRenderMetadata(projectId: string, renderId: string): Promise<{
  status: string;
  outputUrl?: string;
  error?: string;
} | null> {
  try {
    const metaPath = `repos/${projectId}/renders/${renderId}.meta.json`;
    const file = bucket.file(metaPath);
    const [exists] = await file.exists();

    if (!exists) {
      return null;
    }

    const [content] = await file.download();
    return JSON.parse(content.toString());
  } catch (error) {
    console.error(`Failed to read render metadata:`, error);
    return null;
  }
}

/**
 * Watch a K8s job and update render status
 */
async function watchJobStatus(renderId: string, jobName: string): Promise<void> {
  const pollInterval = setInterval(async () => {
    const renderJob = activeJobs.get(renderId);
    if (!renderJob) {
      clearInterval(pollInterval);
      return;
    }

    try {
      const job = await batchApi.readNamespacedJob({ name: jobName, namespace: NAMESPACE });

      if (job.status?.succeeded && job.status.succeeded > 0) {
        // Job completed successfully - read metadata from GCS for output URL
        clearInterval(pollInterval);

        const metadata = await readRenderMetadata(renderJob.projectId, renderId);

        renderJob.status = 'completed';
        renderJob.completedAt = new Date();
        renderJob.progress = 100;
        renderJob.outputUrl = metadata?.outputUrl ||
          `https://storage.googleapis.com/${GCS_BUCKET}/repos/${renderJob.projectId}/renders/${renderId}.mp4`;

        console.log(`Render job ${renderId} completed successfully`);
        emitRenderEvent({
          type: 'render:complete',
          renderId,
          projectId: renderJob.projectId,
          outputUrl: renderJob.outputUrl,
        });
      } else if (job.status?.failed && job.status.failed > 0) {
        // Job failed - try to get error from metadata
        clearInterval(pollInterval);

        const metadata = await readRenderMetadata(renderJob.projectId, renderId);

        renderJob.status = 'failed';
        renderJob.error = metadata?.error || 'Render job failed - check K8s logs for details';

        console.error(`Render job ${renderId} failed: ${renderJob.error}`);
        emitRenderEvent({
          type: 'render:failed',
          renderId,
          projectId: renderJob.projectId,
          error: renderJob.error,
        });
      } else if (job.status?.active && job.status.active > 0) {
        // Job is running
        if (renderJob.status !== 'running') {
          renderJob.status = 'running';
          renderJob.progress = 10; // Initial progress when running

          emitRenderEvent({
            type: 'render:progress',
            renderId,
            progress: 10,
          });
        }
      }
    } catch (error: any) {
      // Job might have been deleted
      if (error.statusCode === 404) {
        console.log(`Job ${jobName} not found, checking metadata...`);

        // Check if we have metadata file indicating completion
        const metadata = await readRenderMetadata(renderJob.projectId, renderId);

        if (metadata?.status === 'completed' && metadata.outputUrl) {
          renderJob.status = 'completed';
          renderJob.completedAt = new Date();
          renderJob.progress = 100;
          renderJob.outputUrl = metadata.outputUrl;

          emitRenderEvent({
            type: 'render:complete',
            renderId,
            projectId: renderJob.projectId,
            outputUrl: renderJob.outputUrl,
          });
        } else if (metadata?.status === 'failed') {
          renderJob.status = 'failed';
          renderJob.error = metadata.error || 'Render failed';

          emitRenderEvent({
            type: 'render:failed',
            renderId,
            projectId: renderJob.projectId,
            error: renderJob.error,
          });
        } else {
          renderJob.status = 'failed';
          renderJob.error = 'Job not found and no metadata available';
        }

        clearInterval(pollInterval);
      } else {
        console.error(`Error watching job ${jobName}:`, error.body?.message || error.message);
      }
    }
  }, 5000); // Poll every 5 seconds

  // Stop watching after 15 minutes regardless
  setTimeout(() => {
    clearInterval(pollInterval);
    const renderJob = activeJobs.get(renderId);
    if (renderJob && renderJob.status === 'pending' || renderJob?.status === 'running') {
      renderJob.status = 'failed';
      renderJob.error = 'Render job timed out';
      emitRenderEvent({
        type: 'render:failed',
        renderId,
        projectId: renderJob.projectId,
        error: 'Render job timed out',
      });
    }
  }, 15 * 60 * 1000);
}

/**
 * Get a render job by ID
 */
export function getRenderJob(renderId: string): RenderJob | undefined {
  return activeJobs.get(renderId);
}

/**
 * Get all render jobs for a project
 */
export function getProjectRenders(projectId: string): RenderJob[] {
  return Array.from(activeJobs.values())
    .filter(job => job.projectId === projectId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Cancel a render job
 */
export async function cancelRenderJob(renderId: string): Promise<boolean> {
  const renderJob = activeJobs.get(renderId);
  if (!renderJob || renderJob.status === 'completed' || renderJob.status === 'failed') {
    return false;
  }

  const jobName = `render-${renderId.slice(0, 8)}`;

  try {
    await batchApi.deleteNamespacedJob({
      name: jobName,
      namespace: NAMESPACE,
      propagationPolicy: 'Background',
    });

    renderJob.status = 'failed';
    renderJob.error = 'Cancelled by user';

    emitRenderEvent({
      type: 'render:failed',
      renderId,
      projectId: renderJob.projectId,
      error: 'Cancelled by user',
    });

    console.log(`Render job ${renderId} cancelled`);
    return true;
  } catch (error: any) {
    console.error(`Failed to cancel render job ${renderId}:`, error.body?.message || error.message);
    return false;
  }
}

/**
 * Get render job logs from K8s
 */
export async function getRenderJobLogs(renderId: string): Promise<string | null> {
  const renderJob = activeJobs.get(renderId);
  if (!renderJob) {
    return null;
  }

  try {
    // Find the pod for this job
    const pods = await coreApi.listNamespacedPod({
      namespace: NAMESPACE,
      labelSelector: `render-id=${renderId}`,
    });

    if (pods.items.length === 0) {
      return null;
    }

    const podName = pods.items[0].metadata?.name;
    if (!podName) {
      return null;
    }

    const logs = await coreApi.readNamespacedPodLog({
      name: podName,
      namespace: NAMESPACE,
      container: 'render',
    });

    return logs as string;
  } catch (error: any) {
    console.error(`Failed to get logs for render job ${renderId}:`, error.body?.message || error.message);
    return null;
  }
}
