# Testing Patterns

**Analysis Date:** 2026-01-27

## Test Framework

**Runner:**
- Not detected - no test runner configured

**Assertion Library:**
- Not detected - no testing framework installed

**Run Commands:**
```bash
# No test commands currently available
# Testing is not currently implemented in this codebase
```

## Test File Organization

**Location:**
- No test files found in the codebase
- No `.test.ts`, `.spec.ts`, `.test.tsx`, or `.spec.tsx` files exist

**Naming:**
- Not applicable - no test files present

**Structure:**
- Not applicable - no test infrastructure in place

## Test Coverage

**Requirements:** None enforced

**Current State:** No tests exist

## Testing Gaps

The codebase lacks testing infrastructure across all modules. The following areas would benefit most from test coverage:

**Backend Service Layer (`backend/src/`):**
- `firestore.ts` - Database operations (create, read, update, delete projects and messages)
- `projects.ts` - Project orchestration logic (coordinating db and storage operations)
- `storage.ts` - Cloud Storage operations (upload/download git repos, session data)
- `websocket.ts` - WebSocket message handling and routing
- `api.ts` - REST endpoint validation and error handling

**Frontend Components (`frontend/src/components/`):**
- `Dashboard.tsx` - Project list loading, creation, deletion, error handling
- `Chat.tsx` - Message rendering, input validation, form submission
- `VideoPreview.tsx` - Preview URL handling, loading states
- `ProjectWorkspace.tsx` - Workspace initialization and component integration

**Frontend Hooks (`frontend/src/hooks/`):**
- `useWebSocket.ts` - Connection management, message handling, session lifecycle, error recovery

**Frontend API (`frontend/src/api.ts`):**
- API client error handling, request formatting, type safety

**API Routes (`backend/src/api.ts`):**
- Project CRUD endpoints (GET, POST, PATCH, DELETE)
- Message endpoints
- Parameter validation
- Error responses

## Testing Recommendations

**Framework Setup:**
Recommend installing Jest or Vitest for a modern TypeScript testing setup.

**Backend Testing Strategy:**
```typescript
// Example pattern for testing database operations
describe('Projects Service', () => {
  it('should create a project with initialized git repo', async () => {
    // Mock firestore and storage operations
    // Verify project created with correct data
    // Verify git repo initialized
  });

  it('should return null for non-existent project', async () => {
    // Query non-existent project
    // Assert returns null
  });
});
```

**Frontend Testing Strategy:**
```typescript
// Example pattern for testing React components
describe('Dashboard', () => {
  it('should load and display projects', async () => {
    // Mock listProjects API call
    // Render Dashboard component
    // Verify projects displayed
    // Verify loading state transitions
  });

  it('should handle deletion with confirmation', async () => {
    // Mock deleteProject
    // User clicks delete button
    // Confirm dialog shown
    // Verify API called when confirmed
  });
});
```

**Hook Testing Pattern:**
```typescript
// Example pattern for testing custom hooks
describe('useWebSocket', () => {
  it('should connect to backend on mount', () => {
    // Mock WebSocket
    // Render hook
    // Verify connection initiated
  });

  it('should handle session creation', async () => {
    // Mock WebSocket
    // Call startSession
    // Verify message sent to backend
    // Verify state updated on session:ready response
  });
});
```

**What to Test:**
- Error paths and edge cases (null inputs, missing data, API failures)
- State transitions and UI updates
- Message handling and routing in WebSocket
- Database operation consistency (create → read → update → delete)
- API validation (required fields, type checking)
- Async operations and loading states
- Event handlers and form submission

**What NOT to Mock:**
- Type definitions and interfaces
- Utilities that don't have side effects
- Core library functions (React hooks, Array methods)

**What to Mock:**
- External APIs (Firestore, Cloud Storage, Kubernetes)
- WebSocket connections
- Environment variables
- Date/time for reproducible tests

## Integration Testing Opportunities

**Frontend-Backend Integration:**
- Project creation flow (create button → API call → dashboard update)
- Chat message flow (send message → WebSocket → display response)
- Session lifecycle (start → send messages → end)

**Error Recovery:**
- Network failure handling
- API timeout behavior
- WebSocket reconnection logic

## Manual Testing Checklist

Current approach relies on manual testing. Key flows to verify:

**Project Management:**
- Create new project
- View project list
- Delete project with confirmation
- Open existing project

**Chat/Collaboration:**
- Send message and receive response
- Display loading states correctly
- Handle network errors gracefully
- Session persistence across page reload

**Preview:**
- Preview panel loads and displays content
- Updates reflect changes from agent
- Error display from preview works

---

*Testing analysis: 2026-01-27*
