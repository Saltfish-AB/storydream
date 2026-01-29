# Project Persistence Architecture

## Overview

Projects are persisted to Google Cloud Storage (GCS) so users can revisit and continue working on their videos. This document describes how project data flows between the session containers and cloud storage.

**Status:** Implemented and working.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Firestore (Metadata)                        │
│  - Project info (id, name, userId, currentCommitSha)           │
│  - Chat messages (role, content, actions)                       │
│  - Agent session ID (for conversation continuity)              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│               Google Cloud Storage (Binary Data)                │
│  gs://storydream-data/repos/{projectId}/                       │
│  ├── src/                    # Remotion source code            │
│  │   ├── compositions/       # Video compositions              │
│  │   │   └── MyVideo.tsx     # Main video file                 │
│  │   ├── components/         # Reusable components             │
│  │   ├── App.tsx                                               │
│  │   └── main.tsx                                              │
│  └── .claude/                # Agent session data              │
│      └── projects/-app-remotion-app/*.jsonl                    │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Project Creation

When a new project is created:

1. Generate UUID for project ID
2. Copy template `src/` from `gs://storydream-data/templates/default/src/` to `gs://storydream-data/repos/{projectId}/src/`
3. Initialize git repo metadata (for versioning)
4. Create Firestore document with project metadata

**File:** `backend/src/storage.ts:initializeProjectRepo()`

### 2. Session Start (Opening a Project)

When user opens an existing project:

1. **Init Container** (Kubernetes) downloads project files:
   ```bash
   gsutil -m cp -r gs://storydream-data/repos/{projectId}/src/* /project-src/
   gsutil -m cp -r gs://storydream-data/repos/{projectId}/.claude/* /session-data/
   ```

2. Files are mounted into the main container:
   - `/project-src` → `/app/remotion-app/src`
   - `/session-data` → `/home/node/.claude`

3. Agent resumes previous session using stored `agentSessionId`

**File:** `backend/src/kubernetes.ts:createSession()`

### 3. During Session (Syncing Changes)

After each agent response completes:

1. Backend calls `POST http://{podIp}:3002/sync` with `{ projectId }`
2. Agent's HTTP server uploads files:
   ```bash
   gsutil -m cp -r /app/remotion-app/src/* gs://storydream-data/repos/{projectId}/src/
   gsutil -m cp -r /home/node/.claude/* gs://storydream-data/repos/{projectId}/.claude/
   ```
3. Firestore `currentCommitSha` updated with timestamp

**Files:**
- `backend/src/websocket.ts:handleAgentMessage()` - triggers sync on complete
- `project-container/agent/src/server.ts` - HTTP sync endpoint

### 4. Session End

Final sync occurs when session is destroyed:

1. `destroySession()` calls `syncSession()` before cleanup
2. Pod is deleted
3. Local volumes are cleaned up

## Key Components

### Backend (`backend/src/`)

| File | Purpose |
|------|---------|
| `storage.ts` | GCS operations (upload/download directories) |
| `kubernetes.ts` | Pod lifecycle, sync trigger via HTTP |
| `websocket.ts` | Triggers background sync after agent responses |
| `firestore.ts` | Project metadata and chat history |
| `projects.ts` | Project CRUD operations |

### Project Container (`project-container/agent/src/`)

| File | Purpose |
|------|---------|
| `server.ts` | WebSocket (port 3001) + HTTP sync endpoint (port 3002) |

## Sync Endpoint

The project container exposes an HTTP endpoint for syncing:

```
POST http://{podIp}:3002/sync
Content-Type: application/json

{ "projectId": "uuid-here" }
```

Response:
```json
{ "success": true, "projectId": "uuid-here" }
```

## Image Pull Policy

Session pods use `imagePullPolicy: Always` to ensure the latest container image is pulled. This prevents issues where nodes have cached old images with the same tag.

**Note for future optimization:** When speed becomes critical, switch to `imagePullPolicy: IfNotPresent` and use unique image tags (e.g., `:v2-abc123`) for each deployment.

## Troubleshooting

### Sync not working

Check backend logs for sync status:
```bash
kubectl logs deployment/backend -n storydream | grep -i sync
```

Expected output after agent response:
```
Syncing session {sessionId} for project {projectId}...
Sync triggered for session {sessionId}
```

If you see "Sync endpoint not available", the pod may be using an old image without the sync endpoint.

### Verify GCS contents

```bash
gsutil ls -r gs://storydream-data/repos/{projectId}/
gsutil cat gs://storydream-data/repos/{projectId}/src/compositions/MyVideo.tsx
```

### Force re-pull of container image

Delete existing session pods to force new ones with fresh images:
```bash
kubectl delete pods -n storydream -l app=session
```

## Current Image Versions

| Image | Version | Purpose |
|-------|---------|---------|
| `project-container` | v2 | Session pods with sync endpoint |
| `backend` | v9 | Orchestrator with sync trigger |
