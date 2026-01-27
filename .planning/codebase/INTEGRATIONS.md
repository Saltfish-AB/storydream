# External Integrations

**Analysis Date:** 2026-01-27

## APIs & External Services

**Anthropic AI:**
- Claude Agent SDK - Powered by Claude Opus 4.5 for conversational AI and code generation
  - SDK: @anthropic-ai/claude-agent-sdk v0.1.0
  - Auth: `ANTHROPIC_API_KEY` environment variable
  - Usage: Agent running in `project-container/agent/src/server.ts` communicates with Claude for code generation and project modifications
  - Integration: WebSocket connection from backend to agent service

## Data Storage

**Databases:**
- Google Cloud Firestore
  - Type: NoSQL document database
  - Connection: `process.env.GCP_PROJECT_ID || 'saltfish-434012'`
  - Database ID: 'saltfish'
  - Client: `@google-cloud/firestore` v8.2.0
  - Auth: Application default credentials (gcloud auth)
  - Usage: Stores projects, chat messages, and metadata
  - Key collections:
    - `projects` - Project metadata (id, name, description, gitRepoPath, currentCommitSha, timestamps)
    - `projects/{projectId}/messages` - Chat messages and agent actions per project

**File Storage:**
- Google Cloud Storage
  - Type: Object storage
  - Bucket name: `process.env.STORAGE_BUCKET || 'storydream-data'`
  - Client: `@google-cloud/storage` v7.18.0
  - Auth: Application default credentials
  - Usage: Stores project source code, git repositories, and Claude Code session data
  - Key paths:
    - `repos/{projectId}/` - Full project repository (git-tracked)
    - `repos/{projectId}/src/` - Optimized src directory download/upload
    - `repos/{projectId}/.claude/` - Claude Code session persistence files (.jsonl format)
    - `templates/default/` - Default Remotion template for new projects
  - Operations in `backend/src/storage.ts`:
    - `initializeProjectRepo()` - Creates new git repo and uploads template
    - `downloadProjectRepo()` - Downloads full project from GCS
    - `uploadProjectRepo()` - Uploads project changes to GCS
    - `downloadProjectSrc()` - Optimized download of src/ only
    - `uploadProjectSrc()` - Optimized upload of src/ only
    - `downloadSessionData()` - Retrieves Claude Code session state
    - `uploadSessionData()` - Persists Claude Code session state

**Caching:**
- Not detected - All data flows through Firestore and Cloud Storage

## Authentication & Identity

**Auth Provider:**
- Custom implementation - No external auth provider
- Current approach: `userId` field on projects, defaulting to 'anonymous'
- Implementation: User identifier passed in API requests and WebSocket messages
- Future: Placeholder in code for auth integration (`userId?: string` parameters throughout)

## Container Orchestration

**Docker:**
- Docker daemon communication via socket (`/var/run/docker.sock`)
- Client: `dockerode` v4.0.0
- Usage: Backend launches project containers for local development
- Network: `process.env.DOCKER_NETWORK || 'storydream_default'`
- Implementation: `backend/src/container.ts` - Creates/destroys containers on demand

**Kubernetes:**
- Kubernetes API client: `@kubernetes/client-node` v1.2.1
- Conditional activation: `process.env.RUNNING_IN_KUBERNETES === 'true'`
- Namespace: `process.env.K8S_NAMESPACE || 'storydream'`
- Usage: Alternative to Docker for production deployments
- Implementation: `backend/src/kubernetes.ts` - K8s-based session management
- Features:
  - Pod creation with init containers for data sync
  - Service creation for preview and agent port exposure
  - ConfigMap mounting for GCP credentials
  - Automatic cleanup on session end

## Monitoring & Observability

**Error Tracking:**
- Not detected - No external error tracking service configured

**Logs:**
- Console-based logging throughout backend (`console.log`, `console.error`)
- Frontend errors captured and reported to agent via WebSocket (`formatErrorReport()` in `frontend/src/hooks/useWebSocket.ts`)
- Kubernetes logs available via `kubectl logs` for containerized deployments

## CI/CD & Deployment

**Hosting:**
- Docker Compose - Local and cloud-based deployments
- Kubernetes - Scalable production deployments
- Google Cloud Platform - Firestore, Cloud Storage, GKE (implied)

**CI Pipeline:**
- Not detected - No GitHub Actions, GitLab CI, or other CI service configured

## Webhooks & Callbacks

**Incoming:**
- None detected - No external webhook endpoints

**Outgoing:**
- WebSocket communication between services:
  - Frontend ↔ Backend WebSocket server (port 8080)
  - Backend ↔ Project container agent (port 3001)
  - Project container ↔ Claude Agent SDK (internal process)

## Real-time Communication

**WebSocket:**
- Backend WebSocket server: `ws://localhost:8080` (or `wss://` in production via nginx)
- Client: `ws` v8.18.0
- Protocol: JSON message passing
- Message types:
  - `session:start` - Initialize Claude Code session
  - `message:send` - Send user message to agent
  - `session:end` - End session and cleanup
  - `agent:message` - Agent response stream
  - `agent:complete` - Agent finished processing
  - `session:ready` - Session initialized, preview URL available
  - `session:ended` - Session terminated

## Project Container Services

**Remotion App:**
- Vite dev server: `http://localhost:3000` (inside container)
- Player component for live video preview
- Hot module reloading for composition updates

**Claude Code Agent:**
- WebSocket server: `ws://localhost:3001` (inside container)
- Session persistence: Stores/loads from `.claude/` directory
- Integration: Backend connects to agent for code generation
- Skills library location: `project-container/remotion-app/.claude/skills/`

## Environment Configuration

**Required env vars:**
- `ANTHROPIC_API_KEY` - Essential for Claude operations
- `GCP_PROJECT_ID` - For Cloud Firestore and Storage access
- `STORAGE_BUCKET` - For project repository storage

**Secrets location:**
- `.env` file (local development) - Contains `ANTHROPIC_API_KEY`
- `.env.example` - Template showing required variables
- Kubernetes Secrets (production) - GCP credentials, API keys
- Docker environment variables (docker-compose.dev.yml)

**GCP Authentication:**
- Application default credentials used throughout
- Local development: `gcloud auth` setup required
- Containers: Service account credentials mounted via Kubernetes ConfigMap/Secret or GCP workload identity

---

*Integration audit: 2026-01-27*
