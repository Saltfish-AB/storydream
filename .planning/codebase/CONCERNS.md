# Codebase Concerns

**Analysis Date:** 2026-01-27

## Security Concerns

**Exposed API Key in Version Control:**
- Issue: The Anthropic API key is committed to `.env` file in the repository
- Files: `/Users/magnusfriberg/repos/storydream/.env`
- Impact: Complete unauthorized access to Anthropic API, potential financial fraud, data leakage
- Fix approach:
  - Immediately rotate the compromised key at api.anthropic.com
  - Add `.env` to `.gitignore`
  - Use `.env.example` as template with placeholder values
  - Implement secrets management (GitHub Secrets, CI/CD secrets, or external vault)
  - Never commit real secrets to version control
- Severity: **CRITICAL**

**Missing Input Validation on API Routes:**
- Issue: POST/PATCH requests accept user input without validation. Project name, description, and all request bodies are used without sanitization
- Files: `backend/src/api.ts` (lines 42-57 for POST, lines 78-95 for PATCH)
- Impact: NoSQL injection, invalid data corruption in Firestore, potential XSS if data is displayed unsanitized
- Fix approach:
  - Add schema validation using a library like `zod`, `joi`, or `valibot`
  - Validate project names (length limits, character restrictions)
  - Validate descriptions (length limits)
  - Sanitize all input before database operations
  - Implement proper error responses for validation failures
- Severity: **HIGH**

**Insecure WebSocket Communication:**
- Issue: WebSocket connections in `backend/src/websocket.ts` lack authentication/authorization checks. Any client can connect and start sessions
- Files: `backend/src/websocket.ts` (lines 26-84 connection handler)
- Impact: Unauthorized session creation, denial of service via resource exhaustion, ability to spy on other users' projects
- Fix approach:
  - Implement WebSocket authentication via token/JWT in initial connection
  - Validate user permissions before allowing session operations
  - Rate limit session creation per user/IP
  - Close unauthorized connections immediately
- Severity: **HIGH**

**Hardcoded Configuration in Code:**
- Issue: Sensitive configuration values are hardcoded (GCP project ID, GCS bucket, Kubernetes namespace, NODE_EXTERNAL_IP)
- Files:
  - `backend/src/storage.ts` line 12 (GCP_PROJECT_ID)
  - `backend/src/kubernetes.ts` lines 16-19 (namespace, image, node IP)
  - `backend/src/container.ts` line 14 (docker network)
- Impact: Configuration drift between environments, inability to use multiple GCP projects, hardcoding IP addresses breaks in different networks
- Fix approach:
  - Move all hardcoded values to environment variables
  - Create environment-specific config files
  - Use configuration validation at startup to ensure all required vars are set
  - Document required environment variables in README
- Severity: **MEDIUM**

**Unvalidated Docker Socket Access:**
- Issue: Backend container has direct access to `/var/run/docker.sock` (docker-compose.yml line 22) for arbitrary container operations
- Files: `docker-compose.yml` line 22
- Impact: Container escape, host compromise, ability to break out and run arbitrary commands on host
- Fix approach:
  - Minimize Docker socket access - use REST API instead if possible
  - Implement audit logging for all Docker operations
  - Use Docker user namespace remapping
  - Consider switching to Kubernetes in production (already supported)
  - Document security implications in deployment guide
- Severity: **HIGH**

## Performance Bottlenecks

**Inefficient File Synchronization:**
- Issue: Project source files are synced by downloading entire `src/` directory on every session startup, even when only some files changed
- Files: `backend/src/container.ts` line 69, `backend/src/kubernetes.ts` lines 87-88
- Impact: Slow session startup (especially for large projects), wasted bandwidth, poor user experience
- Improvement path:
  - Track which files were actually modified since last sync
  - Only download changed files
  - Use Git delta operations instead of full downloads
  - Implement caching of downloaded files locally
- Severity: **MEDIUM**

**No Connection Pooling for Firestore:**
- Issue: Firestore is initialized once globally but no connection pooling or connection reuse strategy is documented
- Files: `backend/src/firestore.ts` lines 7-11
- Impact: Potential connection exhaustion under high concurrent load, slower queries
- Improvement path:
  - Review Firestore client library connection handling
  - Add metrics/monitoring for connection pool usage
  - Consider batch operations for bulk writes
  - Test concurrent load scenarios
- Severity: **LOW**

**Memory Leaks in Session Management:**
- Issue: Sessions stored in memory Map (`backend/src/container.ts` line 32, `backend/src/kubernetes.ts` line 34) with no automatic cleanup if destroySession fails
- Files: `backend/src/container.ts` lines 158-206, `backend/src/kubernetes.ts` lines 279-326
- Impact: Long-running backend accumulates stale session references, memory growth over time, resource exhaustion
- Improvement path:
  - Add periodic cleanup of stale sessions (sessions older than TTL)
  - Implement proper cleanup on all error paths
  - Add memory usage monitoring/alerts
  - Implement session timeout with automatic destruction
  - Add metrics for active sessions
- Severity: **MEDIUM**

**Blocking I/O in Storage Operations:**
- Issue: File operations and directory traversal in `backend/src/storage.ts` use blocking fs functions without streaming
- Files: `backend/src/storage.ts` lines 186-229
- Impact: Slow uploads/downloads for large project directories, blocking other operations, poor scalability
- Improvement path:
  - Use streams for large file operations
  - Implement parallel upload/download with concurrency limits
  - Add progress reporting
  - Cache commonly accessed files
- Severity: **MEDIUM**

## Error Handling & Robustness

**No Retry Logic for Transient Failures:**
- Issue: GCS, Firestore, and Kubernetes API calls have no retry logic for transient errors
- Files: `backend/src/storage.ts`, `backend/src/firestore.ts`, `backend/src/kubernetes.ts`
- Impact: Operations fail permanently on temporary network issues, poor resilience
- Fix approach:
  - Implement exponential backoff retry logic
  - Distinguish between transient and permanent errors
  - Add circuit breaker pattern for cascading failures
  - Document retry strategy
- Severity: **HIGH**

**Unhandled Promise Rejections in WebSocket:**
- Issue: Background sync operation at `backend/src/websocket.ts` line 220 has `.catch()` but only logs error without recovery
- Files: `backend/src/websocket.ts` lines 218-223
- Impact: Silent failures in syncing - user doesn't know their changes weren't saved, data loss possible
- Fix approach:
  - Implement queue for failed syncs with retry
  - Notify user of sync failures
  - Store unsaved changes in local buffer
  - Retry on reconnection
- Severity: **HIGH**

**Missing Error Context in API Responses:**
- Issue: API error responses are generic (e.g., "Failed to create project" line 55) with no details for debugging
- Files: `backend/src/api.ts` (multiple lines)
- Impact: Difficult to debug issues, poor user experience, missing valuable error context
- Fix approach:
  - Log full error details server-side with correlation IDs
  - Return error IDs to client for support ticket reference
  - Include actionable error messages to client
  - Implement structured error responses
- Severity: **MEDIUM**

**Type Safety Issues with `any` Types:**
- Issue: Multiple uses of TypeScript `any` type bypass type checking: message parameters, session type casts, error handling
- Files:
  - `backend/src/websocket.ts` line 86 (message: any)
  - `backend/src/websocket.ts` line 138 (session as any)
  - `backend/src/kubernetes.ts` multiple lines (error: any, port: 3000 as any)
- Impact: Runtime errors go undetected at compile time, refactoring becomes risky, type safety is compromised
- Fix approach:
  - Define proper TypeScript interfaces instead of using `any`
  - Use strict TypeScript settings in tsconfig
  - Add eslint rule to forbid `any`
  - Refactor existing `any` types incrementally
- Severity: **MEDIUM**

## Testing & Coverage

**No Automated Tests:**
- Issue: Zero test files exist for backend or frontend code
- Files: None found
- Impact: No regression detection, risky refactoring, undocumented behavior, quality issues discovered only in production
- Fix approach:
  - Implement unit tests for:
    - API route handlers
    - Session management (create, destroy, sync)
    - File storage operations
    - Firestore operations
  - Implement integration tests for:
    - Full session lifecycle
    - File upload/download/sync
    - WebSocket communication
  - Aim for minimum 70% coverage
  - Set up test runner (Jest or Vitest)
- Severity: **HIGH**

## Scalability Concerns

**Single Backend Instance:**
- Issue: Backend runs as single instance in containers/K8s with no load balancing or horizontal scaling
- Files: Architecture wide - `backend/src/index.ts`, `docker-compose.yml`, `k8s/`
- Impact: Single point of failure, cannot handle traffic spikes, limited concurrent users
- Fix approach:
  - Deploy multiple backend replicas
  - Add load balancer/reverse proxy for traffic distribution
  - Move session state to external store (Redis) instead of in-memory Map
  - Use Kubernetes StatefulSet or Deployment
  - Test horizontal scaling under load
- Severity: **HIGH**

**No Rate Limiting:**
- Issue: No rate limiting on API endpoints or WebSocket connections
- Files: `backend/src/api.ts`, `backend/src/websocket.ts`
- Impact: Vulnerable to DoS attacks, abuse, resource exhaustion
- Fix approach:
  - Implement rate limiting middleware on all routes
  - Add per-user/per-IP limits
  - Return 429 Too Many Requests with retry-after headers
  - Log and alert on rate limit violations
  - Use Redis for distributed rate limiting (multi-instance)
- Severity: **MEDIUM**

## Data & Session Management

**No Session Persistence Between Backend Restarts:**
- Issue: All sessions stored in-memory Maps. Backend restart loses all sessions immediately
- Files: `backend/src/container.ts` line 32, `backend/src/kubernetes.ts` line 34
- Impact: Users disconnected on any deployment/restart, work-in-progress lost, poor availability
- Fix approach:
  - Use Redis or Firestore for session state
  - Implement session resume on reconnection
  - Save session metadata before restart
  - Document session timeout behavior
- Severity: **MEDIUM**

**Race Condition in Session Cleanup:**
- Issue: Session cleanup timer at `backend/src/websocket.ts` lines 62-73 can fire while session is still active if client rapidly reconnects
- Files: `backend/src/websocket.ts` lines 58-76
- Impact: Session destroyed while in use, unexpected disconnections, data loss
- Fix approach:
  - Use lock/mutex for session state updates
  - Cancel cleanup timer if new connection to same session detected
  - Validate session is still needed before cleanup
  - Add tests for rapid reconnect scenarios
- Severity: **MEDIUM**

**Weak Session Isolation:**
- Issue: No validation that users can only access their own projects. All project data is exposed via projectId
- Files: `backend/src/api.ts`, `backend/src/websocket.ts`
- Impact: Any user can access any project if they know the ID, data leakage, privacy violation
- Fix approach:
  - Add authentication/authorization checks
  - Validate user owns project before allowing access
  - Use middleware for permission checks
  - Add audit logging for access
  - Test for authorization bypass
- Severity: **CRITICAL**

## Deployment & Infrastructure

**Kubernetes Image Hardcoding:**
- Issue: Container image URL is hardcoded to specific GCP project
- Files: `backend/src/kubernetes.ts` line 17-18
- Impact: Cannot deploy to different environments/projects, requires code changes for different deployments
- Fix approach:
  - Move image URL to environment variable
  - Support image pull from multiple registries
  - Implement image version management
- Severity: **MEDIUM**

**Node External IP Hardcoding:**
- Issue: ~~Kubernetes NodePort IP hardcoded to specific cluster IP~~ **RESOLVED**
- Files: `backend/src/websocket.ts` line 248, `backend/src/kubernetes.ts` line 19
- Impact: ~~Preview URLs break if node changes, hardcoded for specific infrastructure~~
- Resolution: Implemented subdomain-based routing (`{shortId}.saltfish.ai`) using:
  - Cloudflare wildcard DNS (`*.saltfish.ai` → GKE ingress IP)
  - Kubernetes wildcard ingress (`k8s/ingress-wildcard.yaml`)
  - Backend subdomain router (`backend/src/api.ts` lines 34-91)
  - See `docs/CLOUDFLARE_SUBDOMAIN_DEPLOYMENT.md` for details
- Status: **RESOLVED** (2026-01-29)

**No Health Checks or Probes:**
- Issue: Backend has no comprehensive health check endpoint. WebSocket server has no liveliness probe
- Files: `backend/src/api.ts` has simple `/health` endpoint (lines 139-141) but WebSocket server lacks monitoring
- Impact: Load balancers cannot detect unhealthy instances, failed containers stay in rotation
- Fix approach:
  - Add readiness probe (returns 503 if dependencies down)
  - Add liveness probe (returns 200 if process alive)
  - Check Firestore connectivity
  - Check GCS connectivity
  - Include in Kubernetes pod specs
- Severity: **MEDIUM**

## Code Quality

**Inconsistent Error Handling:**
- Issue: Some code silently ignores errors (e.g., cleanup operations), others throw. No consistent error handling strategy
- Files: `backend/src/container.ts` lines 93-98, `backend/src/kubernetes.ts` lines 304-308
- Impact: Errors disappear, debugging difficult, inconsistent behavior
- Fix approach:
  - Define error handling strategy (log, retry, fail, etc.)
  - Use consistent error types
  - Document error handling approach
  - Never silently ignore errors
- Severity: **MEDIUM**

**Large Files with Multiple Concerns:**
- Issue: Some files handle multiple unrelated concerns:
  - `websocket.ts` (353 lines): WebSocket protocol + session management + message routing
  - `kubernetes.ts` (403 lines): Kubernetes API + pod management + networking
  - `storage.ts` (295 lines): GCS operations + git operations + file handling
- Files: All core backend files
- Impact: Difficult to test, maintain, and understand. High cyclomatic complexity
- Fix approach:
  - Split into smaller focused modules
  - Extract session management into separate service
  - Extract Kubernetes operations into separate service
  - Extract storage operations into separate service
  - Use dependency injection for better testability
- Severity: **MEDIUM**

**Limited Logging and Observability:**
- Issue: Only console.log used for logging, no structured logging, no log levels
- Files: All backend files
- Impact: Difficult to debug production issues, no audit trail, hard to correlate events
- Fix approach:
  - Implement structured logging library (winston, pino)
  - Add correlation IDs for request tracing
  - Implement log levels (DEBUG, INFO, WARN, ERROR)
  - Add metrics/monitoring library
  - Send logs to centralized storage
- Severity: **MEDIUM**

## Frontend Concerns

**Missing TypeScript Strict Mode:**
- Issue: Frontend tsconfig may not have strict type checking enabled
- Files: `frontend/tsconfig.json`
- Impact: Type safety issues slip through to production
- Fix approach:
  - Enable strict mode in tsconfig
  - Add eslint with strict rules
  - Migrate away from `any` types
- Severity: **LOW**

**No Error Boundary:**
- Issue: Frontend has no error boundary to catch component errors
- Files: `frontend/src/App.tsx`, React app structure
- Impact: Single component error crashes entire app
- Fix approach:
  - Implement error boundary component
  - Add fallback UI for errors
  - Log errors to tracking service
- Severity: **LOW**

**Manual WebSocket Management:**
- Issue: WebSocket connection state manually managed without reconnection logic
- Files: Frontend WebSocket connection logic not visible in reviewed files
- Impact: Lost messages if connection drops, poor UX on network interruption
- Fix approach:
  - Implement automatic reconnection with exponential backoff
  - Queue messages while disconnected
  - Notify user of connection status
  - Handle out-of-order messages
- Severity: **MEDIUM**

---

*Concerns audit: 2026-01-27*
