# StoryDream Production Implementation Guide

> **Note**: This document serves as architectural guidance for taking StoryDream to production. These are recommendations, not hard requirements - adapt as needed based on actual constraints and learnings.

## Table of Contents

1. [Current Architecture](#current-architecture)
2. [Target Production Architecture](#target-production-architecture)
3. [Persistence Layer](#persistence-layer)
4. [Project Recreation Flow](#project-recreation-flow)
5. [Implementation Phases](#implementation-phases)
6. [Cost Estimates](#cost-estimates)

---

## Current Architecture

### Overview

> **Note (Feb 2026)**: The StoryDream frontend has been integrated into Avatar Studio (`/repos/avatar-studio`). The frontend is served at the `/video` route in Avatar Studio and proxies API/WebSocket requests to the StoryDream backend in Kubernetes.

**Production Setup:**
```
┌─────────────────────────────────────────────────────────────────────┐
│                    Avatar Studio (separate repo)                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Frontend at /video route                                     │   │
│  │  - Proxies /storydream/api → storydream.saltfish.ai/api      │   │
│  │  - Proxies /storydream/ws  → storydream.saltfish.ai/ws       │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│               StoryDream Backend (Kubernetes - GKE)                  │
│                     storydream.saltfish.ai                          │
│  ┌──────────────┐    ┌───────────────────────────────────────────┐ │
│  │   Backend    │    │  Session Pods (dynamic, per project)      │ │
│  │   (Node.js)  │◄──►│  ┌─────────┐ ┌─────────┐ ┌─────────┐     │ │
│  │              │    │  │session-1│ │session-2│ │session-n│     │ │
│  └──────────────┘    │  │Remotion │ │Remotion │ │Remotion │     │ │
│         │            │  │+Agent   │ │+Agent   │ │+Agent   │     │ │
│         ▼            │  └─────────┘ └─────────┘ └─────────┘     │ │
│   K8s API            └───────────────────────────────────────────┘ │
│   (pod creation)                                                    │
└─────────────────────────────────────────────────────────────────────┘
```

**Development Setup (Docker Compose):**
```
┌─────────────────────────────────────────────────────────────────────┐
│                        Current Setup (Docker)                        │
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────────────┐ │
│  │   Frontend   │    │   Backend    │    │  Project Container    │ │
│  │   (React)    │◄──►│  (Node.js)   │◄──►│  (Remotion + Agent)   │ │
│  │   Port 3000  │    │  Port 8080   │    │  Ports 3000, 3001     │ │
│  └──────────────┘    └──────────────┘    └───────────────────────┘ │
│                             │                                        │
│                             ▼                                        │
│                      Docker Socket                                   │
│                   (container creation)                               │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Frontend** | React + Vite + Tailwind + shadcn/ui | Chat UI, video preview iframe, WebSocket client. **Lives in Avatar Studio repo** at `/video` route. |
| **Backend** | Node.js + WebSocket + K8s API | Session orchestration, message routing, pod lifecycle |
| **Project Container** | Remotion + Claude Agent SDK | Sandboxed code execution, video preview, AI agent |

### Current Data Flow

1. User clicks "Start Creating" → Frontend sends `session:start`
2. Backend creates Docker container with unique ports
3. Backend bridges WebSocket between frontend and container agent
4. Agent modifies code → Vite HMR reloads preview
5. Errors in preview auto-reported to agent for fixing

### Limitations of Current Setup

- Single host only (no horizontal scaling)
- No persistence (sessions lost on restart)
- No user authentication
- Docker socket access is a security concern at scale

---

## Target Production Architecture

### GKE (Google Kubernetes Engine) Setup

```
                          ┌──────────────────────────────────────────────────────┐
                          │                  Google Cloud                        │
                          │                                                       │
  Users ──── HTTPS ──────►│  Cloud Load Balancer                                 │
                          │        │                                              │
                          │        ▼                                              │
                          │  ┌─────────────────────────────────────────────┐     │
                          │  │ GKE Cluster (Autopilot)                     │     │
                          │  │                                              │     │
                          │  │  Ingress-nginx                               │     │
                          │  │    │                                         │     │
                          │  │    ├── /api/*  ──────► Backend Service       │     │
                          │  │    ├── /ws     ──────► Backend Service (WS)  │     │
                          │  │    └── /*      ──────► Frontend Service      │     │
                          │  │                                              │     │
                          │  │  ┌────────────┐    ┌──────────────────────┐ │     │
                          │  │  │ Frontend   │    │ Backend (2 replicas) │ │     │
                          │  │  │ Deployment │    │ - K8s API client     │ │     │
                          │  │  │ (nginx)    │    │ - WebSocket server   │ │     │
                          │  │  └────────────┘    │ - Session manager    │ │     │
                          │  │                     └──────────┬───────────┘ │     │
                          │  │                                │             │     │
                          │  │                     Creates/manages          │     │
                          │  │                                │             │     │
                          │  │                                ▼             │     │
                          │  │  ┌──────────────────────────────────────┐   │     │
                          │  │  │ Session Pods (dynamic, ephemeral)    │   │     │
                          │  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐│   │     │
                          │  │  │  │session-1│ │session-2│ │session-n││   │     │
                          │  │  │  │Remotion │ │Remotion │ │Remotion ││   │     │
                          │  │  │  │+Agent   │ │+Agent   │ │+Agent   ││   │     │
                          │  │  │  └─────────┘ └─────────┘ └─────────┘│   │     │
                          │  │  └──────────────────────────────────────┘   │     │
                          │  │                                              │     │
                          │  └─────────────────────────────────────────────┘     │
                          │                                                       │
                          │  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐ │
                          │  │  Firestore  │  │ Cloud       │  │ Memorystore  │ │
                          │  │  (Database) │  │ Storage     │  │ (Redis)      │ │
                          │  └─────────────┘  └─────────────┘  └──────────────┘ │
                          └──────────────────────────────────────────────────────┘
```

### Key Architectural Changes

| Aspect | Current (Docker) | Production (Kubernetes) |
|--------|-----------------|------------------------|
| Container creation | `dockerode` + Docker socket | Kubernetes API (`@kubernetes/client-node`) |
| Networking | Docker network, port mapping | K8s Services, ClusterIP, Ingress |
| Session state | In-memory on single backend | Redis (allows backend replicas) |
| Container cleanup | Manual + grace period | Pod TTL + cleanup controller |
| Scaling | Single host | Horizontal Pod Autoscaler |
| Persistence | None | Firestore + Cloud Storage |

### URL Structure

The frontend is served from Avatar Studio:

```
https://studio.saltfish.ai/video           → Project dashboard (list)
https://studio.saltfish.ai/video/{projectId} → Project workspace (chat + preview)
```

API and WebSocket endpoints are proxied:
```
/storydream/api/*  → https://storydream.saltfish.ai/api/*
/storydream/ws     → wss://storydream.saltfish.ai/ws
```

The frontend is a SPA with client-side routing integrated into Avatar Studio.

---

## Persistence Layer

### Storage Strategy

Different data types need different storage solutions:

| Data Type | Storage | Rationale |
|-----------|---------|-----------|
| **Chat messages** | Firestore | Structured data, real-time listeners, fast queries |
| **Project metadata** | Firestore | Same database, simple joins |
| **Project files (code)** | Cloud Storage (Git) | Version history, diffs, rollback capability |
| **User uploads (images)** | Cloud Storage | Large files, CDN delivery |
| **Active session state** | Redis | Ephemeral, fast access, pub/sub |

### Data Models

#### Firestore Collections

```typescript
// /projects/{projectId}
interface Project {
  id: string;                    // UUID - used in URL
  userId: string;                // Owner reference
  name: string;                  // Display name
  description?: string;

  // Git state reference
  gitRepoPath: string;           // "repos/{projectId}/repo.git"
  currentCommitSha: string;      // Latest commit hash

  // Metadata
  thumbnailUrl?: string;         // Preview image
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastOpenedAt: Timestamp;

  // Settings
  videoSettings?: {
    width: number;
    height: number;
    fps: number;
    durationInFrames: number;
  };
}

// /projects/{projectId}/messages/{messageId}
interface ChatMessage {
  id: string;
  projectId: string;

  role: 'user' | 'assistant' | 'system';
  content: string;

  // For assistant messages - track what changed
  actions?: AgentAction[];

  // Metadata
  createdAt: Timestamp;
  tokenCount?: number;           // For context management
}

interface AgentAction {
  type: 'file_edit' | 'file_create' | 'file_delete' | 'command_run';
  filePath?: string;
  summary: string;               // Human-readable description
  commitSha?: string;            // Git commit for this change
}

// /users/{userId}
interface User {
  id: string;
  email: string;
  displayName?: string;

  // Subscription/billing
  plan: 'free' | 'pro' | 'team';

  // Preferences
  preferences?: {
    theme: 'light' | 'dark';
    defaultVideoSettings?: VideoSettings;
  };

  createdAt: Timestamp;
  lastLoginAt: Timestamp;
}
```

### Cloud Storage Structure

```
gs://storydream-data/
├── repos/
│   └── {projectId}/
│       └── repo.git/              ← Bare git repository
│
├── assets/
│   └── {projectId}/
│       ├── thumbnail.png          ← Auto-generated preview
│       ├── exports/
│       │   └── video-2024-01-22.mp4
│       └── uploads/
│           └── user-uploaded-image.jpg
│
└── templates/
    └── default/
        └── repo.git/              ← Template for new projects
```

### Git-Based Code Persistence

Each project's code is stored as a bare git repository in Cloud Storage:

```bash
# Creating a new project (in backend)
gcloud storage cp -r gs://storydream-data/templates/default/repo.git \
                    gs://storydream-data/repos/${PROJECT_ID}/repo.git

# Session pod startup - clone project
gcloud storage cp -r gs://storydream-data/repos/${PROJECT_ID}/repo.git /tmp/repo.git
git clone /tmp/repo.git /app/remotion-app
cd /app/remotion-app && git checkout ${COMMIT_SHA}

# After agent makes changes - commit and push
cd /app/remotion-app
git add .
git commit -m "[Agent] ${CHANGE_SUMMARY}"
git push origin main
gcloud storage rsync /app/remotion-app/.git gs://storydream-data/repos/${PROJECT_ID}/repo.git
```

### Redis Session State

For active sessions only (ephemeral):

```typescript
// Key patterns
`session:${sessionId}` → {
  projectId: string;
  podName: string;
  podIP: string;
  userId: string;
  createdAt: number;
  lastActivity: number;
}

`project:${projectId}:active` → sessionId  // Quick lookup

// Pub/sub channels for multi-replica backend
`session-events` → { type: 'created' | 'destroyed', sessionId, projectId }
```

---

## Project Recreation Flow

When a user opens an existing project, the system needs to restore both the conversation context and the code state.

### Sequence Diagram

```
User opens /projects/abc123
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 1. AUTHENTICATE & AUTHORIZE                                         │
│    - Verify user session/JWT                                        │
│    - Check user has access to project abc123                        │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. LOAD PROJECT METADATA                                            │
│    Firestore: GET /projects/abc123                                  │
│    → { name, gitRepoPath, currentCommitSha, videoSettings }        │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. LOAD CHAT HISTORY                                                │
│    Firestore: GET /projects/abc123/messages                         │
│               ORDER BY createdAt ASC                                │
│    → Display immediately in chat UI (before pod is ready)          │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. CHECK FOR EXISTING SESSION                                       │
│    Redis: GET project:abc123:active                                 │
│    If exists → reuse existing pod (skip to step 6)                 │
│    If not → create new session pod                                  │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5. CREATE SESSION POD                                               │
│    K8s API: Create pod with:                                        │
│    - Image: storydream-session:latest                               │
│    - Env: PROJECT_ID, COMMIT_SHA, ANTHROPIC_API_KEY                │
│    - Resources: 512Mi-2Gi RAM, 0.25-1 CPU                          │
│                                                                     │
│    Pod startup script:                                              │
│    a) Clone git repo from Cloud Storage                             │
│    b) Checkout specific commit SHA                                  │
│    c) npm install (cached when possible)                            │
│    d) Start Vite dev server (port 3000)                            │
│    e) Start Agent WebSocket server (port 3001)                      │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 6. CONNECT & INJECT CONTEXT                                         │
│                                                                     │
│    Backend connects WebSocket to pod:3001                           │
│                                                                     │
│    First message to agent includes conversation context:            │
│    {                                                                │
│      type: 'init',                                                  │
│      context: {                                                     │
│        projectId: 'abc123',                                        │
│        conversationSummary: '...',  // Or full message history     │
│        currentFiles: ['MyVideo.tsx', 'components/Scene1.tsx']      │
│      }                                                              │
│    }                                                                │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 7. READY                                                            │
│    - Frontend: sessionReady event received                          │
│    - Chat: Shows full history, input enabled                        │
│    - Preview: Iframe loads pod's Vite server                        │
│    - User can continue conversation                                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Conversation Context Strategies

Two approaches for giving the agent context about previous conversation:

#### Option A: Summary Injection (Recommended for Long Conversations)

```typescript
function buildContextPrompt(messages: ChatMessage[]): string {
  // Summarize if conversation is long
  if (messages.length > 30) {
    return `
## Project Context

This is a continuation of project "${projectName}".

### Conversation Summary
${generateSummary(messages)}

### Recent Messages (last 10)
${formatMessages(messages.slice(-10))}

### Current Project State
The code has been restored to the latest saved state.
Read the files if you need to understand the current implementation.
`;
  }

  // Include full history if short
  return `
## Project Context

Previous conversation:
${formatMessages(messages)}
`;
}
```

#### Option B: Full Message Replay (For Short Conversations)

```typescript
// Pass full message history to Claude API
const response = await claude.messages.create({
  model: 'claude-sonnet-4-20250514',
  system: systemPrompt,
  messages: previousMessages.map(m => ({
    role: m.role,
    content: m.content
  }))
});
```

### Handling Long-Running Projects

For projects with extensive history:

1. **Conversation summarization**: Periodically summarize older messages
2. **Token budgeting**: Keep recent messages + summary within context limits
3. **Semantic search**: For very long projects, retrieve relevant past messages based on current query

---

## Implementation Phases

### Phase 1: Add Persistence (Current Docker Setup)

Add persistence while keeping the existing Docker-based architecture:

**Tasks:**
- [ ] Set up Firestore and create collections
- [ ] Add project CRUD endpoints to backend
- [ ] Add chat message persistence (save on send/receive)
- [ ] Add git initialization for new projects
- [ ] Modify session pod to clone from git on startup
- [ ] Add auto-commit after agent changes
- [ ] Update frontend with project routes and dashboard

**Files to modify/create:**
```
backend/
├── src/
│   ├── firestore.ts       (new - Firestore client)
│   ├── storage.ts         (new - Cloud Storage client)
│   ├── projects.ts        (new - Project CRUD)
│   └── websocket.ts       (modify - add persistence)

project-container/
├── start.sh               (modify - add git clone)
└── agent/src/
    └── git-persist.ts     (new - auto-commit logic)

# Frontend changes are in avatar-studio repo:
avatar-studio/app/src/features/storydream/
├── api/storydreamApi.js   (existing - add project CRUD)
├── components/
│   ├── StorydreamDashboard.jsx  (existing)
│   └── StorydreamWorkspace.jsx  (existing)
└── hooks/
    └── useProject.js      (new - project state management)
```

### Phase 2: Kubernetes Migration

Migrate from Docker to Kubernetes:

**Tasks:**
- [ ] Create GKE cluster (Autopilot recommended)
- [ ] Set up Artifact Registry for container images
- [ ] Create Kubernetes manifests (Deployments, Services, Ingress)
- [ ] Replace dockerode with @kubernetes/client-node
- [ ] Set up Redis (Memorystore) for session state
- [ ] Configure Ingress for WebSocket support
- [ ] Set up CI/CD pipeline (Cloud Build)

**New files:**
```
k8s/
├── namespace.yaml
├── frontend-deployment.yaml
├── frontend-service.yaml
├── backend-deployment.yaml
├── backend-service.yaml
├── backend-rbac.yaml          (permissions to create pods)
├── ingress.yaml
├── session-pod-template.yaml
└── secrets.yaml

cloudbuild.yaml                (CI/CD pipeline)
```

### Phase 3: Authentication & Multi-tenancy

Add user accounts and proper isolation:

**Tasks:**
- [ ] Integrate Firebase Auth (or Auth0, Clerk)
- [ ] Add authentication middleware to backend
- [ ] Implement Firestore security rules
- [ ] Add user-project authorization checks
- [ ] Create user onboarding flow
- [ ] Add project sharing (optional)

### Phase 4: Production Hardening

Prepare for real users:

**Tasks:**
- [ ] Set up monitoring (Cloud Monitoring, Prometheus)
- [ ] Add structured logging (Cloud Logging)
- [ ] Configure alerts for errors and resource usage
- [ ] Add rate limiting
- [ ] Set up backup strategy for Firestore
- [ ] Load testing and performance optimization
- [ ] Security audit

---

## Cost Estimates

### GKE Autopilot (Small Scale: 1-10 Concurrent Users)

| Resource | Specification | Monthly Cost (Est.) |
|----------|---------------|---------------------|
| GKE Autopilot | Base cluster fee | ~$70 |
| Backend pods | 2× (0.5 vCPU, 1GB) | ~$30 |
| Session pods | 10 concurrent × (1 vCPU, 2GB) × 8hr/day | ~$50-100 |
| Memorystore Redis | 1GB basic tier | ~$35 |
| Cloud Load Balancer | 1 forwarding rule | ~$20 |
| Firestore | Free tier likely sufficient | ~$0 |
| Cloud Storage | <10GB | ~$1 |
| **Total** | | **~$200-250/month** |

### Scaling Considerations

- Session pods are the main variable cost
- Consider pod idle timeout to reduce costs (destroy after 30min inactivity)
- Preemptible/Spot VMs can reduce session pod costs by 60-80%
- Node auto-scaling handles traffic spikes

---

## Reference: Session Pod Resource Limits

```yaml
resources:
  requests:
    memory: "512Mi"    # Minimum guaranteed
    cpu: "250m"        # 0.25 CPU cores
  limits:
    memory: "2Gi"      # Chromium for Remotion needs memory
    cpu: "1000m"       # 1 full CPU core max
```

---

## Reference: Backend Kubernetes Permissions

The backend needs RBAC permissions to create session pods:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: session-manager
  namespace: storydream-sessions
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["create", "delete", "get", "list", "watch"]
- apiGroups: [""]
  resources: ["services"]
  verbs: ["create", "delete", "get", "list"]
- apiGroups: [""]
  resources: ["pods/log"]
  verbs: ["get"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: backend-session-manager
  namespace: storydream-sessions
subjects:
- kind: ServiceAccount
  name: backend-sa
  namespace: storydream
roleRef:
  kind: Role
  name: session-manager
  apiGroup: rbac.authorization.k8s.io
```

---

## Next Steps

1. **Start with Phase 1** - Add persistence to the current Docker setup
2. **Validate the data model** - Make sure the schema works for your use cases
3. **Set up GCP project** - Create project, enable APIs, set up billing alerts
4. **Iterate** - This guide is a starting point; adapt based on what you learn

---

*Last updated: January 2025*
