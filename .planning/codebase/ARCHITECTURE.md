# Architecture

**Analysis Date:** 2026-01-27

## Pattern Overview

**Overall:** Microservices with dual-channel communication pattern (REST API + WebSocket) coupled with dynamic containerization and agent-driven orchestration.

**Key Characteristics:**
- Frontend-to-backend communication via REST (project management) and WebSocket (real-time agent interaction)
- Backend manages two distinct server processes: REST API (port 8081) and WebSocket server (port 8080)
- Dynamic container lifecycle: each session spawns an isolated Docker container running Remotion project + Claude agent
- Session state persisted across disconnects via Google Cloud Storage and Firestore
- Project repositories stored as versioned Git repos in Cloud Storage with per-session binary snapshots
- Agent-driven code modifications with automatic sync-back to storage

## Layers

**Presentation Layer (Frontend):**
- Purpose: User interface for project management, chat interaction, and video preview
- Location: `frontend/src/`
- Contains: React components, hooks for WebSocket, HTTP API client
- Depends on: React Router, Tailwind CSS, native fetch API
- Used by: Browser clients

**Communication Layer (Backend):**
- Purpose: Bridges frontend, agent containers, and persistent storage
- Location: `backend/src/websocket.ts`, `backend/src/api.ts`
- Contains: WebSocket server for real-time agent communication, Express REST API
- Depends on: ws (WebSocket), Express, Firestore SDK, Cloud Storage SDK
- Used by: Frontend clients, session containers

**Session/Orchestration Layer (Backend):**
- Purpose: Manages container lifecycle and session state
- Location: `backend/src/container.ts` (Docker), `backend/src/kubernetes.ts` (K8s)
- Contains: Docker API client, session creation/destruction, local file syncing
- Depends on: Dockerode, fs/promises, Cloud Storage for uploads/downloads
- Used by: WebSocket handler during session lifecycle

**Data Persistence Layer (Backend):**
- Purpose: Stores project metadata, chat history, and project source code
- Location: `backend/src/firestore.ts`, `backend/src/storage.ts`, `backend/src/projects.ts`
- Contains: Firestore operations (projects, messages), Cloud Storage Git repos, local sync operations
- Depends on: Google Cloud Firestore, Google Cloud Storage, Git CLI
- Used by: API layer, WebSocket handlers, container orchestration

**Project Layer (Container):**
- Purpose: Remotion video editing environment with error reporting
- Location: `project-container/remotion-app/src/`
- Contains: Remotion compositions (video scenes), timeline UI, error boundary, local changes
- Depends on: Remotion player, Claude Agent SDK (via process env), React
- Used by: Browser via Docker container preview port, Agent via mounted file volumes

## Data Flow

**Session Initialization Flow:**

1. Frontend sends `session:start` message via WebSocket with optional projectId
2. Backend validates project exists in Firestore
3. Backend downloads project src/ from Cloud Storage to local disk (mount point)
4. Backend downloads .claude/ session state if project has agentSessionId
5. Backend spawns Docker container with src/ and .claude/ mounted as volumes
6. Backend connects to agent WebSocket inside container (waits for port readiness)
7. Backend sends `session:ready` to frontend with sessionId and previewUrl

**Conversation Flow:**

1. Frontend sends `message:send` with user prompt via WebSocket
2. Backend saves message to Firestore (role: 'user')
3. Backend forwards to agent via agent WebSocket
4. Agent processes prompt, performs file modifications in mounted /app/remotion-app/src
5. Agent sends back `agent_message` events with response content and tool_use actions
6. Backend tracks assistant response and accumulates actions
7. When agent sends `complete`, backend saves full assistant message + actions to Firestore
8. Backend triggers background `syncSession()` to upload modified src/ back to Cloud Storage
9. Frontend receives `agent:complete` to show response finished

**Preview Updates:**

1. Remotion app in container watches src/ via Vite HMR
2. On src/ file changes, Vite rebuilds and hot-reloads preview
3. Browser shows updated video via preview iframe
4. If React error occurs, ErrorBoundary catches and posts to parent window
5. Frontend receives error, formats report, and sends to agent for auto-fix

**Session Cleanup:**

1. Frontend disconnects or sends `session:end`
2. Backend schedules cleanup after 30-second grace period (allows reconnection)
3. After timeout, backend destroys Docker container
4. If reconnected during grace period, timer is cancelled and session continues

**State Preservation Flow:**

1. Agent receives AGENT_SESSION_ID env var from backend
2. Agent SDK resumes from previous checkpoint automatically
3. Agent reports sessionId back to backend via `session_id` message
4. Backend stores agentSessionId in Firestore project record
5. On next session start for same project, agent resumes where it left off

**Error Reporting:**

1. Remotion ErrorBoundary catches React errors
2. Posts error to parent window (frontend iframe) via postMessage
3. Frontend receives `remotion:error` and formats detailed report
4. Frontend sends error report as user message to agent
5. Agent reads MyVideo.tsx, identifies issue, auto-fixes, saves to mounted src/
6. Vite HMR reloads preview with fixed code

## Key Abstractions

**Session:**
- Purpose: Encapsulates one user's Docker container, agent connection, and state
- Examples: `backend/src/container.ts:createSession()`, `backend/src/websocket.ts:ClientConnection`
- Pattern: Map-based tracking with UUID generation, explicit state machine for lifecycle

**Project:**
- Purpose: User's video project with git repo, metadata, and chat history
- Examples: `backend/src/types.ts:Project`, `backend/src/projects.ts`
- Pattern: Stored in Firestore, git repo in Cloud Storage, loaded/saved via dedicated module

**ClientConnection:**
- Purpose: Tracks WebSocket client state: session, agent connection, message tracking
- Examples: `backend/src/websocket.ts:ClientConnection`
- Pattern: Map-based by WebSocket instance, accumulates assistant response text and actions across events

**SequenceRegistry:**
- Purpose: Global registry of Remotion sequences for timeline UI
- Examples: `project-container/remotion-app/src/remotion-wrapper.ts`
- Pattern: In-memory Map with listener callbacks, auto-registers on Sequence mount

## Entry Points

**Backend Entry Point:**
- Location: `backend/src/index.ts`
- Triggers: Server startup
- Responsibilities: Load environment config, spawn WebSocket and REST API servers, handle process signals

**Frontend Entry Point:**
- Location: `frontend/src/main.tsx`
- Triggers: Browser load
- Responsibilities: Render React app into DOM, mount routing

**Container Entry Point:**
- Location: `project-container/remotion-app/src/main.tsx` (Vite dev server entry)
- Triggers: Docker container start via `npm run dev`
- Responsibilities: Serve Remotion preview app and listen for agent on port 3001 via Agent SDK

**API Routes (Backend):**
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create new project
- `GET /api/projects/:projectId` - Get project + messages
- `PATCH /api/projects/:projectId` - Update project metadata
- `DELETE /api/projects/:projectId` - Delete project
- `GET /api/projects/:projectId/messages` - List messages
- `GET /api/health` - Health check

**WebSocket Messages (Backend):**
- Client → Backend: `session:start`, `message:send`, `session:end`
- Backend → Client: `session:ready`, `agent:message`, `agent:complete`, `error`
- Agent → Backend: `agent_message`, `complete`, `session_id`
- Backend → Agent: `prompt` (user message)

## Error Handling

**Strategy:** Layered error catching with user-friendly messages, logging, and graceful degradation.

**Patterns:**
- API routes catch exceptions and return 500 with error description
- WebSocket sends `error` messages back to frontend on handler failures
- Container creation failures clean up partial state (directories)
- Agent connection timeouts (5 min) throw with clear error message
- Remotion errors caught by ErrorBoundary and reported to agent via parent postMessage
- Session cleanup errors logged but don't prevent shutdown

## Cross-Cutting Concerns

**Logging:**
- Approach: Console.log with structured prefix (session/project IDs, operation names)
- Files: Every major operation logs before/after (session start, container create, sync complete)
- Example: `console.log(`Session ${sessionId} cleanup in ${delay}s...`)`

**Validation:**
- API routes validate request.body presence and required fields
- Project existence checked before session start
- WebSocket message type validated against switch statement
- No centralized validator library; inline checks per route

**Authentication:**
- Approach: Placeholder (userId optional in requests, defaults to 'anonymous')
- Current state: No authentication implemented; all projects visible to all users
- Will be added later with auth provider

**Async Concurrency:**
- Backend handles multiple concurrent WebSocket clients via event-driven architecture
- Container creation sequential per session (one-at-a-time, no race conditions)
- Firestore operations use async/await with error propagation
- Background sync (syncSession) doesn't block message responses

---

*Architecture analysis: 2026-01-27*
