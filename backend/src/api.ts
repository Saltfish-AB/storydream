import express, { Request, Response, Router } from 'express';
import cors from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';
import {
  createProject,
  getProject,
  getProjectWithHistory,
  listProjects,
  updateProject,
  deleteProject,
} from './projects.js';
import { getMessages } from './firestore.js';
import {
  createRenderJob,
  getRenderJob,
  getProjectRenders,
  cancelRenderJob,
  getRenderJobLogs,
} from './render.js';

// Use Kubernetes when running in K8s, Docker when running locally
const useKubernetes = process.env.RUNNING_IN_KUBERNETES === 'true';

// Dynamic import to load the correct container module
const containerModule = useKubernetes
  ? await import('./kubernetes.js')
  : await import('./container.js');
const { getSession } = containerModule;

// Get getSessionByShortId only in Kubernetes mode
const getSessionByShortId = useKubernetes
  ? (await import('./kubernetes.js')).getSessionByShortId
  : null;

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Subdomain routing middleware - routes {shortId}.storydream.saltfish.ai to pod IPs
// This handles requests coming through the wildcard ingress
if (useKubernetes && getSessionByShortId) {
  const subdomainProxy = createProxyMiddleware({
    changeOrigin: true,
    ws: true,
    router: (req) => {
      const host = req.headers.host || '';
      const match = host.match(/^([a-f0-9]{8})\.saltfish\.ai/);
      const shortId = match?.[1];

      if (!shortId || !getSessionByShortId) {
        return 'http://localhost:3000'; // fallback
      }

      const session = getSessionByShortId(shortId);
      if (!session?.podIp) {
        console.log(`[Subdomain Router] Session not found for shortId: ${shortId}`);
        return 'http://localhost:3000';
      }

      const target = `http://${session.podIp}:3000`;
      console.log(`[Subdomain Router] ${host} -> ${target}`);
      return target;
    },
    on: {
      proxyReq: (proxyReq, req) => {
        console.log(`[Subdomain Proxy] ${req.method} ${req.headers.host}${req.url}`);
      },
      error: (err, req) => {
        console.error(`[Subdomain Proxy Error] ${err.message} for ${req.headers.host}${req.url}`);
      },
    },
  });

  // Match requests from session subdomains
  app.use((req, res, next) => {
    const host = req.headers.host || '';
    const match = host.match(/^([a-f0-9]{8})\.saltfish\.ai/);

    if (match) {
      const shortId = match[1];
      const session = getSessionByShortId!(shortId);

      if (!session?.podIp) {
        res.status(404).json({ error: 'Session not found or pod not ready' });
        return;
      }

      // Proxy to the session pod
      subdomainProxy(req, res, next);
      return;
    }

    // Not a session subdomain, continue to other routes
    next();
  });
}

// Preview proxy middleware - routes /preview/{sessionId}/* to pod IPs
// Only needed in Kubernetes mode (local Docker mode uses direct localhost access)
if (useKubernetes) {
  const previewProxy = createProxyMiddleware({
    changeOrigin: true,
    ws: true, // Support WebSocket for Remotion HMR
    router: (req) => {
      // Session was attached by the middleware below
      const session = (req as any).previewSession;
      if (!session || !session.podIp) {
        console.log('[Proxy Router] No session attached, using fallback');
        return 'http://localhost:3000';
      }
      const target = `http://${session.podIp}:3000`;
      console.log(`[Proxy Router] Routing to ${target}`);
      return target;
    },
    on: {
      proxyReq: (proxyReq, req, res) => {
        console.log(`[Proxy] Forwarding ${req.method} ${req.url} -> ${proxyReq.path}`);
      },
      proxyRes: (proxyRes, req, res) => {
        console.log(`[Proxy] Response: ${proxyRes.statusCode} for ${req.url}`);
      },
      error: (err, req, res) => {
        console.error(`[Proxy Error] ${err.message} for ${req.url}`);
      },
    },
  });

  app.use('/preview/:sessionId', (req, res, next) => {
    const { sessionId } = req.params;
    console.log(`[Preview Middleware] Request for session ${sessionId}, URL: ${req.url}`);

    // Look up session to get pod IP
    const session = getSession(sessionId);
    if (!session || !session.podIp) {
      console.log(`[Preview Middleware] Session ${sessionId} not found`);
      res.status(404).json({ error: 'Session not found or pod not ready' });
      return;
    }

    console.log(`[Preview Middleware] Found session, podIp: ${session.podIp}`);
    // Attach session to request for the proxy router to use
    (req as any).previewSession = session;
    // Forward to proxy
    previewProxy(req, res, next);
  });

  // Catch Vite HMR paths that use absolute URLs (/@react-refresh, /src/*, etc.)
  // These come from the iframe but have absolute paths, so we use Referer to find the session
  const viteHmrPaths = ['/@react-refresh', '/@vite', '/src/', '/node_modules/', '/@fs/'];
  app.use((req, res, next) => {
    // Check if this is a Vite HMR path
    const isVitePath = viteHmrPaths.some(p => req.path.startsWith(p));
    if (!isVitePath) {
      return next();
    }

    // Extract sessionId from Referer header
    const referer = req.headers.referer;
    const match = referer?.match(/\/preview\/([^/]+)/);
    const sessionId = match?.[1];

    if (!sessionId) {
      console.log(`[Vite HMR] No session in referer for ${req.path}, referer: ${referer}`);
      return next();
    }

    const session = getSession(sessionId);
    if (!session || !session.podIp) {
      console.log(`[Vite HMR] Session ${sessionId} not found for ${req.path}`);
      return next();
    }

    console.log(`[Vite HMR] Routing ${req.path} to session ${sessionId}`);
    (req as any).previewSession = session;
    previewProxy(req, res, next);
  });
}

// Create router for API routes
const router = Router();

// Type for route params
interface ProjectParams {
  projectId: string;
}

// ============ Project Routes ============

// List all projects
router.get('/projects', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string | undefined;
    const projects = await listProjects(userId);
    res.json({ projects });
  } catch (error) {
    console.error('Error listing projects:', error);
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

// Create a new project
router.post('/projects', async (req: Request, res: Response) => {
  try {
    const { name, description, userId } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Project name is required' });
      return;
    }

    const project = await createProject({ name, description, userId });
    res.status(201).json({ project });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Get a project by ID (includes messages)
router.get('/projects/:projectId', async (req: Request<ProjectParams>, res: Response) => {
  try {
    const { projectId } = req.params;
    const result = await getProjectWithHistory(projectId);

    if (!result) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json(result);
  } catch (error) {
    console.error('Error getting project:', error);
    res.status(500).json({ error: 'Failed to get project' });
  }
});

// Update a project
router.patch('/projects/:projectId', async (req: Request<ProjectParams>, res: Response) => {
  try {
    const { projectId } = req.params;
    const { name, description } = req.body;

    const project = await getProject(projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    await updateProject(projectId, { name, description });
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// Delete a project
router.delete('/projects/:projectId', async (req: Request<ProjectParams>, res: Response) => {
  try {
    const { projectId } = req.params;

    const project = await getProject(projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    await deleteProject(projectId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// ============ Message Routes ============

// Get messages for a project
router.get('/projects/:projectId/messages', async (req: Request<ProjectParams>, res: Response) => {
  try {
    const { projectId } = req.params;

    const project = await getProject(projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const messages = await getMessages(projectId);
    res.json({ messages });
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// ============ Render Routes ============

interface RenderParams {
  projectId: string;
}

interface RenderIdParams {
  renderId: string;
}

// Create a new render job
router.post('/projects/:projectId/render', async (req: Request<RenderParams>, res: Response) => {
  try {
    const { projectId } = req.params;
    const { compositionId, format } = req.body;

    // Verify project exists
    const project = await getProject(projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const job = await createRenderJob({ projectId, compositionId, format });
    res.status(201).json(job);
  } catch (error) {
    console.error('Error creating render job:', error);
    res.status(500).json({ error: 'Failed to create render job' });
  }
});

// Get all renders for a project
router.get('/projects/:projectId/renders', async (req: Request<RenderParams>, res: Response) => {
  try {
    const { projectId } = req.params;

    // Verify project exists
    const project = await getProject(projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const renders = getProjectRenders(projectId);
    res.json({ renders });
  } catch (error) {
    console.error('Error getting renders:', error);
    res.status(500).json({ error: 'Failed to get renders' });
  }
});

// Get a specific render job
router.get('/renders/:renderId', async (req: Request<RenderIdParams>, res: Response) => {
  try {
    const { renderId } = req.params;
    const render = getRenderJob(renderId);

    if (!render) {
      res.status(404).json({ error: 'Render not found' });
      return;
    }

    res.json(render);
  } catch (error) {
    console.error('Error getting render:', error);
    res.status(500).json({ error: 'Failed to get render' });
  }
});

// Cancel a render job
router.delete('/renders/:renderId', async (req: Request<RenderIdParams>, res: Response) => {
  try {
    const { renderId } = req.params;
    const success = await cancelRenderJob(renderId);

    if (!success) {
      res.status(404).json({ error: 'Render not found or already completed' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error cancelling render:', error);
    res.status(500).json({ error: 'Failed to cancel render' });
  }
});

// Get render job logs
router.get('/renders/:renderId/logs', async (req: Request<RenderIdParams>, res: Response) => {
  try {
    const { renderId } = req.params;
    const logs = await getRenderJobLogs(renderId);

    if (logs === null) {
      res.status(404).json({ error: 'Logs not found' });
      return;
    }

    res.json({ logs });
  } catch (error) {
    console.error('Error getting render logs:', error);
    res.status(500).json({ error: 'Failed to get render logs' });
  }
});

// ============ Health Check ============

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount router
app.use('/api', router);

// Export app and a function to start the server
export { app };

export function startApiServer(port: number): void {
  app.listen(port, () => {
    console.log(`API server listening on http://localhost:${port}`);
  });
}
