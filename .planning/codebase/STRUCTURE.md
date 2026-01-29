# Codebase Structure

**Analysis Date:** 2026-01-27

## Directory Layout

```
storydream/
├── backend/                     # Node.js TypeScript server (REST API + WebSocket)
│   ├── src/
│   │   ├── index.ts            # Entry point: spawns WebSocket and REST servers
│   │   ├── api.ts              # Express REST API routes
│   │   ├── websocket.ts        # WebSocket server: client↔agent messaging
│   │   ├── container.ts        # Docker session management (dev/Docker mode)
│   │   ├── kubernetes.ts       # Kubernetes session management (prod mode)
│   │   ├── projects.ts         # Project business logic
│   │   ├── firestore.ts        # Firestore CRUD for projects and messages
│   │   ├── storage.ts          # Cloud Storage git repo and file sync
│   │   └── types.ts            # Shared TypeScript types
│   ├── package.json
│   ├── package-lock.json
│   ├── Dockerfile
│   └── dist/                   # Compiled JavaScript (generated)
│
├── frontend/                    # React TypeScript SPA (Vite)
│   ├── src/
│   │   ├── main.tsx            # Entry point: React app mount
│   │   ├── App.tsx             # Router: /projects, /projects/:projectId
│   │   ├── api.ts              # HTTP client for backend /api
│   │   ├── types.ts            # Shared types (Project, ChatMessage)
│   │   ├── index.css           # Global styles (Tailwind)
│   │   ├── vite-env.d.ts       # Vite type definitions
│   │   ├── components/
│   │   │   ├── Landing.tsx     # Welcome page (unused currently)
│   │   │   ├── Dashboard.tsx   # Project list and create form
│   │   │   ├── ProjectWorkspace.tsx # Main editor view with chat + preview
│   │   │   ├── Chat.tsx        # Chat message display and input form
│   │   │   ├── VideoPreview.tsx # Embedded iframe for Remotion preview
│   │   │   └── Timeline.tsx    # Timeline UI for Remotion compositions
│   │   └── hooks/
│   │       └── useWebSocket.ts # WebSocket client hook for agent communication
│   ├── package.json
│   ├── package-lock.json
│   ├── Dockerfile
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── index.html
│
├── project-container/          # Remotion video editor (Docker container image)
│   └── remotion-app/           # Vite + Remotion app (runs inside session container)
│       ├── src/
│       │   ├── main.tsx        # Entry point: render App
│       │   ├── App.tsx         # Remotion Player + Timeline UI with error boundary
│       │   ├── remotion-wrapper.ts # Custom Sequence wrapper with registry
│       │   ├── components/
│       │   │   └── Timeline.tsx # Timeline UI: frame scrubber and sequence list
│       │   └── compositions/
│       │       └── MyVideo.tsx  # Default video composition (agent edits this)
│       ├── package.json
│       ├── Dockerfile
│       ├── vite.config.ts
│       ├── .claude/            # Claude Agent SDK session persistence
│       └── public/
│
├── k8s/                        # Kubernetes manifests (production deployment)
│   ├── backend.yaml            # Backend deployment and service
│   ├── frontend.yaml           # Frontend deployment and service
│   ├── ingress-wildcard.yaml   # Wildcard ingress for session subdomains (*.saltfish.ai)
│   └── ...
│
├── project-data/               # Runtime: project source files and session state
│   ├── src-{projectId}-{sessionId}/ # Project src/ mounted in container
│   ├── claude-{projectId}-{sessionId}/ # Agent session state (.claude/)
│   └── ...
│
├── docs/                       # Deployment and operations documentation
│   ├── CLOUDFLARE_SUBDOMAIN_DEPLOYMENT.md  # Subdomain routing setup guide
│   └── PREVIEW_PROXY_IMPLEMENTATION.md     # (Superseded) Path-based proxy approach
│
├── .planning/                  # GSD planning and analysis docs
│   └── codebase/              # Auto-generated architecture documentation
│       ├── ARCHITECTURE.md    # Architecture patterns and layers
│       ├── STRUCTURE.md       # This file
│       ├── STACK.md           # Technology stack
│       ├── INTEGRATIONS.md    # External services
│       ├── CONVENTIONS.md     # Coding standards
│       ├── TESTING.md         # Test patterns
│       └── CONCERNS.md        # Tech debt and issues
│
├── .claude/                    # Claude Agent SDK
│   └── skills/                # Reusable agent skills
│
├── .env                        # Local environment variables
├── .env.example                # Example .env template
├── docker-compose.yml          # Production: full stack compose
├── docker-compose.dev.yml      # Development: full stack with mounts
├── start.sh                    # Script to start development environment
├── stop.sh                     # Script to stop development environment
│
├── DESIGN_SPEC.md             # Original product specification
├── IMPLEMENTATION_GUIDE.md    # Implementation notes
└── spec.md                    # Requirements specification
```

## Directory Purposes

**backend/**
- Purpose: Node.js server managing communication, sessions, and data
- Contains: REST API, WebSocket server, container orchestration, storage sync
- Key files: `index.ts` (entry), `websocket.ts` (core event loop), `container.ts` (orchestration)
- Runs on ports 8080 (WebSocket), 8081 (REST API)

**frontend/**
- Purpose: React web UI for creating and editing video projects
- Contains: Page components, routing, WebSocket client hook, HTTP API client
- Key files: `App.tsx` (router), `ProjectWorkspace.tsx` (main editor), `useWebSocket.ts` (state)
- Runs on port 3000 (dev), served by nginx reverse proxy in prod

**project-container/remotion-app/**
- Purpose: Remotion video editor that runs inside dynamically spawned Docker containers
- Contains: Video compositions, Remotion player UI, custom sequence wrapper
- Key files: `App.tsx` (player + timeline), `compositions/MyVideo.tsx` (editable video)
- Runs on port 4100+ (preview), port 3001 (agent SDK)
- Mounted volumes: `src/` (editable), `.claude/` (session state)

**k8s/**
- Purpose: Kubernetes manifests for production deployment
- Contains: Service and Deployment definitions for backend, frontend, and session pods
- Used when `RUNNING_IN_KUBERNETES=true`

**project-data/**
- Purpose: Runtime directory for project files and session state (created dynamically)
- Contains: Snapshot copies of src/ and .claude/ directories
- Generated by: `backend/src/container.ts` during session creation
- Mounted by: Docker containers as volumes

**.planning/codebase/**
- Purpose: GSD-generated architecture documentation
- Contains: Analysis of patterns, conventions, testing, and technical concerns
- Generated by: `/gsd:map-codebase` commands
- Consumed by: `/gsd:plan-phase` and `/gsd:execute-phase` commands

## Key File Locations

**Entry Points:**
- `backend/src/index.ts`: Backend startup - initializes WebSocket and API servers
- `frontend/src/main.tsx`: Frontend startup - mounts React app
- `project-container/remotion-app/src/main.tsx`: Container startup - renders Remotion player

**Configuration:**
- `.env`: Runtime environment variables (API keys, GCP project, ports)
- `backend/package.json`: Backend dependencies (express, ws, @google-cloud/*, @anthropic/sdk)
- `frontend/package.json`: Frontend dependencies (react, react-router-dom, tailwind)
- `docker-compose.dev.yml`: Local development environment (all services + volumes)
- `k8s/*.yaml`: Kubernetes production manifests

**Core Logic:**
- `backend/src/websocket.ts`: Message routing, session lifecycle, agent communication
- `backend/src/api.ts`: REST endpoints for project CRUD
- `backend/src/container.ts`: Docker container lifecycle and file syncing
- `backend/src/projects.ts`: Project-level business logic
- `frontend/src/hooks/useWebSocket.ts`: Frontend WebSocket client state management
- `project-container/remotion-app/src/App.tsx`: Remotion player with error handling

**Testing:**
- No test files currently present - files would be named `*.test.ts` or `*.spec.ts`

## Naming Conventions

**Files:**
- Backend: `camelCase.ts` with clear purpose (e.g., `websocket.ts`, `firestore.ts`)
- Frontend components: PascalCase (e.g., `Chat.tsx`, `Dashboard.tsx`)
- Frontend utilities: camelCase (e.g., `api.ts`, `useWebSocket.ts`)
- Config files: lowercase with hyphens (e.g., `vite.config.ts`, `docker-compose.yml`)

**Directories:**
- Feature folders: lowercase (e.g., `components/`, `hooks/`, `compositions/`)
- Platform-specific: descriptive names (e.g., `backend/`, `frontend/`, `project-container/`)

**Variables/Functions:**
- Async operations: use `async/await` pattern
- React hooks: prefix with `use` (e.g., `useWebSocket`, `useState`, `useEffect`)
- Constants: SCREAMING_SNAKE_CASE (e.g., `WS_PORT`, `SESSION_CLEANUP_DELAY`)
- Event handlers: prefix with `handle` (e.g., `handleMessage`, `handleSessionStart`)

**Message Types:**
- WebSocket events: `snake:case` (e.g., `session:start`, `agent:complete`, `session:ready`)
- Firestore fields: camelCase (e.g., `agentSessionId`, `gitRepoPath`, `currentCommitSha`)

## Where to Add New Code

**New Feature in Frontend:**
- UI component: `frontend/src/components/NewFeature.tsx`
- Hook if component needs state: `frontend/src/hooks/useNewFeature.ts`
- Types: Add to `frontend/src/types.ts`
- Register route: Update `frontend/src/App.tsx`

**New Component/Module in Remotion Editor:**
- Composition: `project-container/remotion-app/src/compositions/NewComposition.tsx`
- Timeline component: `project-container/remotion-app/src/components/NewTimeline.tsx`
- Utility: `project-container/remotion-app/src/utils/newUtility.ts`
- Export from App.tsx if needed

**New Backend Route/Handler:**
- REST route: Add to `backend/src/api.ts` in router
- WebSocket handler: Add case to switch in `backend/src/websocket.ts:handleMessage()`
- Business logic: Extract to dedicated module like `backend/src/newFeature.ts`
- Type: Add to `backend/src/types.ts`

**New Integration/External Service:**
- Initialize client in new module: `backend/src/newService.ts`
- Add credential env vars to `.env` and `docker-compose.dev.yml`
- Document in `.planning/codebase/INTEGRATIONS.md`

**Database/Storage Operations:**
- Firestore CRUD: Add to `backend/src/firestore.ts`
- Cloud Storage operations: Add to `backend/src/storage.ts`
- Models: Update `backend/src/types.ts`

**Tests:**
- Unit tests: Create `src/__tests__/module.test.ts` alongside source
- Integration tests: Create in `tests/integration/`
- Use Jest/Vitest with existing patterns

## Special Directories

**project-data/**
- Purpose: Runtime working directory for session file snapshots
- Generated: Dynamically during `container.ts:createSession()`
- Committed: No (gitignored)
- Cleanup: Manual deletion or via backend shutdown
- Size: Can grow large if many sessions created (each has full src/ copy)

**node_modules/**
- Purpose: Installed dependencies
- Generated: By `npm install`
- Committed: No (gitignored)
- Per service: Each of `backend/`, `frontend/`, `project-container/remotion-app/` has own `node_modules/`

**dist/** (backend only)
- Purpose: Compiled JavaScript output from TypeScript
- Generated: By `npm run build`
- Committed: No (gitignored)
- Cleaned: `npm run clean` or delete manually

**.claude/** (project-container)
- Purpose: Claude Agent SDK session persistence directory
- Generated: Auto-created by Agent SDK during first run
- Committed: No (gitignored)
- Mounted: Into container at `/home/node/.claude` for session resumption

**k8s/**
- Purpose: Kubernetes manifests for production
- Not used: In Docker Compose dev/test environments
- Deployment: Applied via `kubectl apply -f k8s/`

---

*Structure analysis: 2026-01-27*
