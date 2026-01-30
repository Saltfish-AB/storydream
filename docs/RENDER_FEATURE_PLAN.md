# Video Rendering Feature Plan

Server-side video rendering using Kubernetes Jobs.

## Overview

Add a "Render Video" button that triggers a Kubernetes Job to render the video using Remotion CLI. The job runs in an isolated pod with Chrome Headless + FFmpeg, renders the video, and uploads to Cloud Storage.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           FRONTEND                                   │
│  ┌─────────────────┐                                                │
│  │  Render Button  │─── onClick ───┐                                │
│  └─────────────────┘                │                                │
│  ┌─────────────────┐                │                                │
│  │ Progress Modal  │◄── WebSocket ──┼────────────────┐              │
│  └─────────────────┘                │                │              │
└─────────────────────────────────────┼────────────────┼──────────────┘
                                      │                │
                    POST /api/projects/:id/render      │
                                      │                │
┌─────────────────────────────────────▼────────────────┼──────────────┐
│                           BACKEND                    │              │
│  ┌─────────────────┐    ┌─────────────────┐         │              │
│  │  Render API     │───►│  K8s Job Create │         │              │
│  └─────────────────┘    └────────┬────────┘         │              │
│                                  │                   │              │
│  ┌─────────────────┐             │            ┌─────┴─────┐        │
│  │  Job Watcher    │◄────────────┼───────────►│ WebSocket │        │
│  └─────────────────┘             │            └───────────┘        │
└──────────────────────────────────┼──────────────────────────────────┘
                                   │
                          Create K8s Job
                                   │
┌──────────────────────────────────▼──────────────────────────────────┐
│                      KUBERNETES CLUSTER                              │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    RENDER JOB (one-shot)                       │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │ │
│  │  │ Init:        │  │ Main:        │  │ Output:              │ │ │
│  │  │ Download src │─►│ Bundle +     │─►│ Upload to GCS        │ │ │
│  │  │ from GCS     │  │ Render video │  │ Mark job complete    │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      CLOUD STORAGE (GCS)                             │
│  gs://storydream-projects/{projectId}/                               │
│  ├── src/                   (source code - input)                    │
│  └── renders/                                                        │
│      └── {renderId}.mp4     (rendered video - output)                │
└──────────────────────────────────────────────────────────────────────┘
```

## Components to Build

### 1. Render Container Image

New Docker image optimized for Remotion rendering.

**Location:** `render-container/`

**Contents:**
- Chrome Headless Shell (for screenshots)
- FFmpeg (for encoding)
- Node.js + Remotion CLI
- Render script

**Dockerfile outline:**
```dockerfile
FROM node:20-slim

# Install Chrome dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    ffmpeg \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnss3 \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Install Remotion CLI
RUN npm install -g @remotion/cli

WORKDIR /app

COPY render.sh /app/render.sh
RUN chmod +x /app/render.sh

ENTRYPOINT ["/app/render.sh"]
```

**render.sh script:**
```bash
#!/bin/bash
set -e

# Environment variables expected:
# - PROJECT_ID: Project identifier
# - RENDER_ID: Unique render job ID
# - GCS_BUCKET: Storage bucket name
# - COMPOSITION_ID: Which composition to render (default: MyVideo)
# - OUTPUT_FORMAT: mp4 or webm (default: mp4)

# 1. Download source from GCS
gsutil -m cp -r "gs://${GCS_BUCKET}/${PROJECT_ID}/src/*" /app/src/

# 2. Install dependencies
cd /app/src
npm install

# 3. Bundle and render
npx remotion render \
    --composition="${COMPOSITION_ID:-MyVideo}" \
    --output="/tmp/output.${OUTPUT_FORMAT:-mp4}" \
    --codec="${OUTPUT_FORMAT:-h264}" \
    --concurrency=2

# 4. Upload to GCS
gsutil cp "/tmp/output.${OUTPUT_FORMAT:-mp4}" \
    "gs://${GCS_BUCKET}/${PROJECT_ID}/renders/${RENDER_ID}.${OUTPUT_FORMAT:-mp4}"

# 5. Signal completion (write metadata)
echo '{"status":"completed","timestamp":"'$(date -Iseconds)'"}' | \
    gsutil cp - "gs://${GCS_BUCKET}/${PROJECT_ID}/renders/${RENDER_ID}.meta.json"

echo "Render complete!"
```

### 2. Backend: Render API & Job Management

**New file:** `backend/src/render.ts`

```typescript
import * as k8s from '@kubernetes/client-node';
import { v4 as uuidv4 } from 'uuid';

interface RenderJobOptions {
  projectId: string;
  compositionId?: string;
  format?: 'mp4' | 'webm';
}

interface RenderJob {
  renderId: string;
  projectId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  outputUrl?: string;
  error?: string;
}

// Store active render jobs (use Firestore in production)
const activeJobs = new Map<string, RenderJob>();

export async function createRenderJob(options: RenderJobOptions): Promise<RenderJob> {
  const renderId = uuidv4();
  const { projectId, compositionId = 'MyVideo', format = 'mp4' } = options;

  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  const batchApi = kc.makeApiClient(k8s.BatchV1Api);

  const namespace = process.env.K8S_NAMESPACE || 'default';
  const gcsBucket = process.env.GCS_BUCKET || 'storydream-projects';

  const job: k8s.V1Job = {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: `render-${renderId.slice(0, 8)}`,
      namespace,
      labels: {
        app: 'storydream-render',
        projectId,
        renderId,
      },
    },
    spec: {
      ttlSecondsAfterFinished: 3600, // Cleanup after 1 hour
      backoffLimit: 1,
      template: {
        spec: {
          restartPolicy: 'Never',
          containers: [
            {
              name: 'render',
              image: 'gcr.io/YOUR_PROJECT/storydream-render:latest',
              env: [
                { name: 'PROJECT_ID', value: projectId },
                { name: 'RENDER_ID', value: renderId },
                { name: 'GCS_BUCKET', value: gcsBucket },
                { name: 'COMPOSITION_ID', value: compositionId },
                { name: 'OUTPUT_FORMAT', value: format },
              ],
              resources: {
                requests: { cpu: '2', memory: '4Gi' },
                limits: { cpu: '4', memory: '8Gi' },
              },
            },
          ],
          serviceAccountName: 'storydream-render', // Needs GCS access
        },
      },
    },
  };

  await batchApi.createNamespacedJob(namespace, job);

  const renderJob: RenderJob = {
    renderId,
    projectId,
    status: 'pending',
    createdAt: new Date(),
  };

  activeJobs.set(renderId, renderJob);

  // Start watching job status
  watchJobStatus(renderId, namespace);

  return renderJob;
}

async function watchJobStatus(renderId: string, namespace: string): Promise<void> {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  const batchApi = kc.makeApiClient(k8s.BatchV1Api);

  const jobName = `render-${renderId.slice(0, 8)}`;

  const pollInterval = setInterval(async () => {
    try {
      const { body: job } = await batchApi.readNamespacedJob(jobName, namespace);
      const renderJob = activeJobs.get(renderId);

      if (!renderJob) {
        clearInterval(pollInterval);
        return;
      }

      if (job.status?.succeeded) {
        renderJob.status = 'completed';
        renderJob.completedAt = new Date();
        renderJob.outputUrl = `https://storage.googleapis.com/${process.env.GCS_BUCKET}/${renderJob.projectId}/renders/${renderId}.mp4`;
        clearInterval(pollInterval);

        // Notify via WebSocket
        notifyRenderComplete(renderJob);
      } else if (job.status?.failed) {
        renderJob.status = 'failed';
        renderJob.error = 'Render job failed';
        clearInterval(pollInterval);

        notifyRenderFailed(renderJob);
      } else if (job.status?.active) {
        renderJob.status = 'running';
      }
    } catch (error) {
      console.error('Error watching job:', error);
    }
  }, 5000); // Poll every 5 seconds
}

export function getRenderJob(renderId: string): RenderJob | undefined {
  return activeJobs.get(renderId);
}

export function getProjectRenders(projectId: string): RenderJob[] {
  return Array.from(activeJobs.values())
    .filter(job => job.projectId === projectId);
}
```

**Add to API routes:** `backend/src/api.ts`

```typescript
// POST /api/projects/:projectId/render
app.post('/api/projects/:projectId/render', async (req, res) => {
  const { projectId } = req.params;
  const { compositionId, format } = req.body;

  try {
    const job = await createRenderJob({ projectId, compositionId, format });
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create render job' });
  }
});

// GET /api/projects/:projectId/renders
app.get('/api/projects/:projectId/renders', async (req, res) => {
  const { projectId } = req.params;
  const renders = getProjectRenders(projectId);
  res.json(renders);
});

// GET /api/renders/:renderId
app.get('/api/renders/:renderId', async (req, res) => {
  const { renderId } = req.params;
  const render = getRenderJob(renderId);

  if (!render) {
    return res.status(404).json({ error: 'Render not found' });
  }

  res.json(render);
});
```

### 3. WebSocket Events for Render Progress

**Add to:** `backend/src/websocket.ts`

```typescript
// New event types
interface RenderStartEvent {
  type: 'render:started';
  renderId: string;
  projectId: string;
}

interface RenderProgressEvent {
  type: 'render:progress';
  renderId: string;
  progress: number; // 0-100
  currentFrame?: number;
  totalFrames?: number;
}

interface RenderCompleteEvent {
  type: 'render:complete';
  renderId: string;
  outputUrl: string;
}

interface RenderFailedEvent {
  type: 'render:failed';
  renderId: string;
  error: string;
}

// Notify functions (called from render.ts)
export function notifyRenderComplete(job: RenderJob): void {
  const projectSessions = getSessionsByProject(job.projectId);
  projectSessions.forEach(session => {
    session.ws.send(JSON.stringify({
      type: 'render:complete',
      renderId: job.renderId,
      outputUrl: job.outputUrl,
    }));
  });
}

export function notifyRenderFailed(job: RenderJob): void {
  const projectSessions = getSessionsByProject(job.projectId);
  projectSessions.forEach(session => {
    session.ws.send(JSON.stringify({
      type: 'render:failed',
      renderId: job.renderId,
      error: job.error,
    }));
  });
}
```

### 4. Frontend: Render Button & Progress UI

**Add to:** `frontend/src/components/VideoPreview.tsx`

```tsx
import { useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

interface RenderState {
  isRendering: boolean;
  renderId?: string;
  progress: number;
  status: 'idle' | 'pending' | 'running' | 'completed' | 'failed';
  outputUrl?: string;
  error?: string;
}

export function RenderButton({ projectId }: { projectId: string }) {
  const [renderState, setRenderState] = useState<RenderState>({
    isRendering: false,
    progress: 0,
    status: 'idle',
  });

  const { sendMessage, subscribe } = useWebSocket();

  // Subscribe to render events
  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.type === 'render:progress') {
        setRenderState(prev => ({
          ...prev,
          progress: event.progress,
          status: 'running',
        }));
      } else if (event.type === 'render:complete') {
        setRenderState(prev => ({
          ...prev,
          isRendering: false,
          status: 'completed',
          outputUrl: event.outputUrl,
          progress: 100,
        }));
      } else if (event.type === 'render:failed') {
        setRenderState(prev => ({
          ...prev,
          isRendering: false,
          status: 'failed',
          error: event.error,
        }));
      }
    });

    return unsubscribe;
  }, [subscribe]);

  const handleRender = async () => {
    setRenderState({
      isRendering: true,
      progress: 0,
      status: 'pending',
    });

    try {
      const response = await fetch(`/api/projects/${projectId}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'mp4' }),
      });

      const job = await response.json();
      setRenderState(prev => ({
        ...prev,
        renderId: job.renderId,
      }));
    } catch (error) {
      setRenderState({
        isRendering: false,
        progress: 0,
        status: 'failed',
        error: 'Failed to start render',
      });
    }
  };

  return (
    <div className="render-controls">
      <button
        onClick={handleRender}
        disabled={renderState.isRendering}
        className="render-button"
      >
        {renderState.isRendering ? 'Rendering...' : 'Render Video'}
      </button>

      {renderState.isRendering && (
        <div className="render-progress">
          <div
            className="progress-bar"
            style={{ width: `${renderState.progress}%` }}
          />
          <span>{renderState.progress}%</span>
        </div>
      )}

      {renderState.status === 'completed' && renderState.outputUrl && (
        <a
          href={renderState.outputUrl}
          download
          className="download-button"
        >
          Download Video
        </a>
      )}

      {renderState.status === 'failed' && (
        <div className="render-error">
          {renderState.error}
        </div>
      )}
    </div>
  );
}
```

### 5. Remotion Project Configuration

**Add to:** `project-container/remotion-app/remotion.config.ts`

```typescript
import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setConcurrency(2);

// For server-side rendering
Config.setChromiumOpenGlRenderer('angle');
```

**Add to:** `project-container/remotion-app/src/Root.tsx` (new file)

```tsx
import { Composition } from 'remotion';
import { MyVideo } from './compositions/MyVideo';

// Root component required for Remotion CLI
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MyVideo"
        component={MyVideo}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
```

## Implementation Phases

### Phase 1: Render Container (Day 1)
- [ ] Create `render-container/` directory
- [ ] Write Dockerfile with Chrome + FFmpeg
- [ ] Write render.sh script
- [ ] Test locally with Docker
- [ ] Push to container registry

### Phase 2: Backend API (Day 2)
- [ ] Create `backend/src/render.ts`
- [ ] Add K8s Job creation logic
- [ ] Add job status polling
- [ ] Add API routes for render operations
- [ ] Add WebSocket events for progress

### Phase 3: Frontend UI (Day 3)
- [ ] Add RenderButton component
- [ ] Add progress bar UI
- [ ] Add download link when complete
- [ ] Handle error states
- [ ] Add render history list (optional)

### Phase 4: Remotion Config (Day 3)
- [ ] Add remotion.config.ts
- [ ] Create Root.tsx with Composition
- [ ] Update package.json with render script
- [ ] Test full flow

### Phase 5: Production Hardening (Day 4)
- [ ] Add render job persistence to Firestore
- [ ] Add job timeout handling
- [ ] Add cleanup for failed jobs
- [ ] Add render queue limits per user
- [ ] Add signed URLs for downloads

## Kubernetes Resources Needed

```yaml
# Service Account for render jobs
apiVersion: v1
kind: ServiceAccount
metadata:
  name: storydream-render
  annotations:
    iam.gke.io/gcp-service-account: storydream-render@PROJECT.iam.gserviceaccount.com

---
# Resource quota for render jobs
apiVersion: v1
kind: ResourceQuota
metadata:
  name: render-quota
spec:
  hard:
    requests.cpu: "16"
    requests.memory: "32Gi"
    limits.cpu: "32"
    limits.memory: "64Gi"
    count/jobs.batch: "10"
```

## Cost Considerations

- **CPU/Memory:** Each render job uses 2-4 CPU cores, 4-8GB RAM
- **Duration:** ~1-2 minutes for a 30-second video
- **Storage:** Output videos stored in GCS (~50MB per minute of video)
- **Recommendation:** Consider adding render quotas per project/user

## Future Enhancements

1. **Progress Streaming:** Use K8s logs API to stream real-time progress
2. **Quality Options:** Let users choose 720p/1080p/4K
3. **Format Options:** MP4, WebM, GIF
4. **Render Queue:** Priority queue for paid users
5. **GPU Rendering:** Use GPU nodes for faster rendering
6. **Webhook Notifications:** Notify external services when render completes
