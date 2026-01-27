# Coding Conventions

**Analysis Date:** 2026-01-27

## Naming Patterns

**Files:**
- Lowercase with hyphens for configs: `tsconfig.json`, `vite.config.ts`
- PascalCase for React components: `Dashboard.tsx`, `Chat.tsx`, `VideoPreview.tsx`
- camelCase for utility/service files: `api.ts`, `firestore.ts`, `storage.ts`, `websocket.ts`, `projects.ts`
- camelCase for hooks: `useWebSocket.ts`
- Grouping by feature: components in `src/components/`, hooks in `src/hooks/`

**Functions:**
- camelCase throughout all code
- Async functions prefixed with descriptive verbs: `createProject()`, `getProject()`, `initializeProjectRepo()`, `downloadSessionData()`
- Handler functions prefixed with `handle`: `handleMessage()`, `handleSessionStart()`, `handleMessageSend()`
- Internal helpers prefixed or inlined: `formatDate()`, `formatErrorReport()`, `mapToolToActionType()`

**Variables:**
- camelCase for all variables and constants: `isLoading`, `projectId`, `previewUrl`, `isSessionActive`
- UPPER_CASE for module-level constants: `SESSION_CLEANUP_DELAY`, `TEMPLATE_REPO_PATH`, `BUCKET_NAME`, `GCP_PROJECT_ID`
- React state variables use descriptive names: `showCreateModal`, `newProjectName`, `currentAssistantResponse`
- Refs use `Ref` suffix: `wsRef`, `messagesEndRef`, `currentAssistantMessage`, `errorTimeoutRef`

**Types:**
- PascalCase for interfaces: `Project`, `ChatMessage`, `CreateProjectRequest`, `ClientConnection`
- PascalCase for type aliases: `AgentAction`
- Descriptive names indicating purpose: `UseWebSocketOptions`, `UseWebSocketReturn`, `ProjectParams`

## Code Style

**Formatting:**
- TypeScript 5.4 with `target: ES2022` (backend) and `target: ES2020` (frontend)
- No explicit formatter config found (prettier not in package.json)
- Indentation appears to be 2 spaces (standard Node.js)
- Line length: no enforced limit observed
- Arrow functions preferred: `async (data) => { ... }` over function declarations

**Linting:**
- No ESLint config found in repository
- TypeScript strict mode enabled across all projects
- Frontend tsconfig includes strict checking: `noUnusedLocals: true`, `noUnusedParameters: true`, `noFallthroughCasesInSwitch: true`

## Import Organization

**Order:**
1. External packages: `import express from 'express'`
2. Local modules: `import { createProject } from './projects.js'`
3. Type imports when needed: `import type { Project, ChatMessage } from './types.js'`

**Path Aliases:**
- No aliases configured in tsconfig files
- Relative imports with `.js` extensions used in backend (ESM module requirement)
- Frontend uses `.ts`/`.tsx` imports without extensions

**Sample import patterns:**
```typescript
// Backend example (projects.ts)
import { v4 as uuidv4 } from 'uuid';
import { createProject as createProjectInDb } from './firestore.js';
import type { Project, ChatMessage } from './types.js';

// Frontend example (Dashboard.tsx)
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listProjects, createProject } from '../api';
import type { Project } from '../types';
```

## Error Handling

**Patterns:**
- Async functions wrapped in try-catch blocks in event handlers and route handlers
- API errors caught and logged with `console.error()`, user-friendly message sent to client
- Critical errors thrown with descriptive messages: `throw new Error(\`Project ${projectId} not found\`)`
- Null/undefined checks for optional data: `if (!project) return null;` or `if (!doc.exists) return null;`
- WebSocket errors logged and gracefully handled without crashing connection
- Backend route handlers use status codes: 400 for bad requests, 404 for not found, 500 for server errors

**Backend example from api.ts:**
```typescript
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
```

**Frontend example from Dashboard.tsx:**
```typescript
async function loadProjects() {
  try {
    setIsLoading(true);
    const data = await listProjects();
    setProjects(data);
    setError(null);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to load projects');
  } finally {
    setIsLoading(false);
  }
}
```

## Logging

**Framework:** Native `console` object throughout codebase

**Patterns:**
- `console.log()` for informational messages: connection events, operation start/completion, state changes
- `console.error()` for error conditions: failed operations, WebSocket errors, async task failures
- Context-rich messages with string interpolation:
  ```typescript
  console.log(`Starting session${projectId ? ` for project ${projectId}` : ''}...`);
  console.log(`Created project: ${id} - ${data.name}`);
  console.error(`Failed to save assistant message:`, error);
  ```
- Sensitive info not logged (credentials, tokens)
- Long content truncated for readability: `content.substring(0, 100)`

## Comments

**When to Comment:**
- Complex logic blocks explained with block comments
- Business logic intent documented: Why something is done, not how
- Non-obvious workarounds noted
- Configuration decisions explained

**JSDoc/TSDoc:**
- Functions have docstrings describing purpose, parameters, and return values
- Example from projects.ts:
  ```typescript
  /**
   * Create a new project with initialized git repo
   */
  export async function createProject(data: { ... }): Promise<Project>

  /**
   * Get conversation context for agent initialization
   * Returns recent messages formatted for injection into agent context
   */
  export async function getConversationContext( ... ): Promise<string>
  ```

## Function Design

**Size:** Functions are focused and medium-sized (20-80 lines typical)
- Smaller handlers for specific operations: `handleSessionStart()`, `handleMessageSend()`
- Larger orchestration functions break down into helpers: `createProject()` calls `initializeProjectRepo()` then `createProjectInDb()`

**Parameters:**
- Specific parameters for simple operations
- Objects for complex configuration: `{ name, description, userId }`
- Options objects for hook configuration: `UseWebSocketOptions` with `projectId?: string; initialMessages?: ChatMessage[]`

**Return Values:**
- Promises with typed returns: `Promise<Project>`, `Promise<{ project: Project; messages: ChatMessage[] }>`
- Null for optional queries: `Promise<Project | null>`
- Void for side-effect-only operations: `Promise<void>`

## Module Design

**Exports:**
- Named exports for reusable functions: `export async function createProject(...)`
- Default exports not used
- Type exports use `export type`: `export type { Project }`

**Barrel Files:**
- Not used; imports are direct from source files

**File Responsibilities:**
- `api.ts` - REST route handlers and server setup
- `websocket.ts` - WebSocket server and message routing
- `firestore.ts` - Firestore database operations
- `storage.ts` - Cloud Storage and git repo operations
- `projects.ts` - Project business logic coordinating db/storage
- `types.ts` - Shared type definitions
- `components/` - React UI components with local state
- `hooks/` - Custom React hooks with logic

---

*Convention analysis: 2026-01-27*
