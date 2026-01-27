# Technology Stack

**Analysis Date:** 2026-01-27

## Languages

**Primary:**
- TypeScript 5.4.0 - All backend services, frontend, Remotion app, and Claude Agent
- JSX/TSX - React components across frontend and project container

**Secondary:**
- Bash - Start scripts for orchestration (e.g., `start.sh`)
- YAML - Docker Compose and Kubernetes configuration

## Runtime

**Environment:**
- Node.js 20 (slim) - All JavaScript/TypeScript services
- Chromium - Required for Remotion video rendering in project container

**Package Manager:**
- npm - All Node.js projects
- Lockfiles: `package-lock.json` present in all subdirectories

## Frameworks

**Core:**
- Express 5.2.1 - REST API server in `backend/src/api.ts`
- React 18.3.1 - UI components in `frontend/` and `project-container/remotion-app/`
- Remotion 4.0.0 - Programmatic video composition in `project-container/remotion-app/`
- WebSocket (ws 8.18.0) - Real-time communication between frontend and backend

**Frontend Build:**
- Vite 5.4.0 - Development server and build tool for both frontend and Remotion app
- TailwindCSS 3.4.0 - Styling for frontend UI
- PostCSS 8.4.0 - CSS processing
- Autoprefixer 10.4.0 - Vendor prefix automation

**Backend/Agent:**
- Claude Agent SDK (@anthropic-ai/claude-agent-sdk 0.1.0) - Agent orchestration in `project-container/agent/`
- tsx 4.19.0 - TypeScript execution and watch mode (dev dependency across projects)

## Key Dependencies

**Critical:**
- @google-cloud/firestore 8.2.0 - Document database for projects and chat messages (`backend/src/firestore.ts`)
- @google-cloud/storage 7.18.0 - Cloud Storage for project repos and session data (`backend/src/storage.ts`)
- @kubernetes/client-node 1.2.1 - Kubernetes API client for container orchestration (`backend/src/kubernetes.ts`)
- dockerode 4.0.0 - Docker daemon communication for local container management (`backend/src/container.ts`)

**Infrastructure:**
- uuid 10.0.0 - ID generation for projects, messages, and sessions
- cors 2.8.6 - Cross-origin resource sharing middleware
- dotenv 17.2.3 - Environment variable loading from `.env` files
- http-proxy-middleware 3.0.5 - HTTP proxying (used in Docker/K8s setup)
- @remotion/media 4.0.407 - Media utilities for Remotion compositions
- @remotion/player 4.0.0 - Remotion preview player component

**Type Definitions:**
- @types/express 5.0.6
- @types/cors 2.8.19
- @types/react 18.3.0
- @types/react-dom 18.3.0
- @types/uuid 10.0.0
- @types/ws 8.5.0
- @types/dockerode 3.3.0

## Configuration

**Environment:**
- Backend port configuration: `WS_PORT` (default 8080), `API_PORT` (default 8081)
- Frontend port: `5173` (Vite dev server)
- Remotion app port: `3000` (Vite dev server)
- Agent port: `3001` (WebSocket server)

**Key Environment Variables (backend):**
- `ANTHROPIC_API_KEY` - Anthropic API authentication
- `GCP_PROJECT_ID` - Google Cloud project ID (default: 'saltfish-434012')
- `STORAGE_BUCKET` - Cloud Storage bucket name (default: 'storydream-data')
- `RUNNING_IN_KUBERNETES` - Boolean flag for K8s vs Docker mode
- `RUNNING_IN_DOCKER` - Boolean flag for Docker environment detection
- `K8S_NAMESPACE` - Kubernetes namespace (default: 'storydream')
- `PROJECT_CONTAINER_IMAGE` - Container image URI for project sessions
- `NODE_EXTERNAL_IP` - External IP for preview URL construction (default: '34.88.112.102')
- `PROJECT_DATA_DIR` - Local temp directory for project data (default: '/tmp')
- `DOCKER_NETWORK` - Docker network name (default: 'storydream_default')

**Key Environment Variables (frontend):**
- `VITE_API_URL` - Backend API URL (default: http://localhost:8081/api for local, /api for production)
- `VITE_BACKEND_URL` - WebSocket backend URL (auto-detected via proxy or localhost)

**Build Configuration:**
- `tsconfig.json` in each project directory (backend, frontend, remotion-app):
  - Backend: Target ES2022, module ESNext, strict type checking
  - Frontend: Target ES2020, DOM lib included, strict checking with unused detection
  - Remotion app: Target ES2020, similar to frontend

**Vite Configuration:**
- `frontend/vite.config.ts` - React plugin, port 5173, host binding
- `project-container/remotion-app/vite.config.ts` - React plugin, port 3000, custom import aliases for Remotion wrapper

## Platform Requirements

**Development:**
- Node.js 20 or higher
- Docker (for container management) or Kubernetes cluster access
- Google Cloud credentials configured (for GCS access)
- Anthropic API key

**Production:**
- Docker container runtime (for Docker Compose) or Kubernetes cluster
- Google Cloud Storage bucket and Firestore database
- Chromium binary (included in container image)
- Google Cloud SDK (for gcloud auth in project container)

## Docker Images

**Services:**
- `node:20-slim` - Base image for all Node.js services
- `storydream-project` - Custom image built from `project-container/Dockerfile` (includes Remotion, Claude Code CLI, GCP SDK)

**Docker Compose Setup:**
- Frontend container: Builds from `frontend/Dockerfile`
- Backend container: Builds from `backend/Dockerfile` (with Docker socket mount for local container management)
- Project image: Dependency builder (ensures image exists for backend to launch)

**Kubernetes Setup:**
- Project container image deployed via Kubernetes manifests in `k8s/` directory
- Service discovery via Kubernetes DNS

---

*Stack analysis: 2026-01-27*
