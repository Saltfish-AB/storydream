# StoryDream - AI-Powered Remotion Video Generator

## Overview
A Lovable-style application for creating Remotion videos through natural language prompts. Users chat with an AI agent that generates and modifies Remotion video code in real-time, with live preview updating via HMR.

## Problem Statement
Creating programmatic videos with Remotion requires React/TypeScript knowledge. This tool democratizes video creation by letting users describe what they want and having an AI agent generate the code.

## Target Users
- Content creators who want programmatic videos without coding
- Developers who want to prototype Remotion videos quickly
- Marketing teams needing quick video iterations

## Core Features (MVP)

### UI/UX
- **Landing page**: Clean entry point with prompt input
- **Chat interface** (left panel): Conversation with the AI agent
- **Video preview** (right panel): Live Remotion Player via iframe pointing to container's dev server

### User Flow
1. User lands on homepage, enters initial prompt
2. System spins up a Docker container with Remotion project template
3. Container runs `npm run dev` (Vite dev server)
4. Chat UI opens with video preview iframe pointing to container's dev server
5. User describes changes → Agent edits files → Vite HMR updates preview automatically

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (Vite + React)                │
│  ┌─────────────────────┐    ┌────────────────────────────┐  │
│  │   Chat Panel        │    │   Video Preview (iframe)   │  │
│  │   - Message history │    │   → points to container's  │  │
│  │   - Input box       │    │     Vite dev server port   │  │
│  └─────────────────────┘    └────────────────────────────┘  │
└───────────────┬─────────────────────────────────────────────┘
                │ WebSocket
┌───────────────▼─────────────────────────────────────────────┐
│                 Backend (Orchestrator)                      │
│  - Manages WebSocket connections from frontend              │
│  - Orchestrates container lifecycle (create/destroy)        │
│  - Routes messages between frontend and containers          │
│  - Tracks active sessions                                   │
└───────────────┬─────────────────────────────────────────────┘
                │ Docker API + WebSocket to container
┌───────────────▼─────────────────────────────────────────────┐
│              Project Container (per session)                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Claude Agent (Agent SDK + claude_code preset)         │ │
│  │  - Receives prompts via WebSocket                      │ │
│  │  - Has direct filesystem access                        │ │
│  │  - Edits composition files                             │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Remotion App (Vite + @remotion/player)                │ │
│  │  - Dev server with HMR                                 │ │
│  │  - Renders Player with compositions                    │ │
│  │  - Auto-updates when agent edits files                 │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Technical Stack

### Frontend
- **Framework**: Vite + React
- **Styling**: TBD (Tailwind?)
- **WebSocket**: Native WebSocket or socket.io-client
- **State**: React state or Zustand

### Backend (Orchestrator)
- **Runtime**: Node.js + TypeScript
- **WebSocket**: ws or socket.io (routes messages to containers)
- **Container management**: dockerode (Docker API client)
- **Role**: Lifecycle management and message routing only (no agent logic)

### Project Container (self-contained per session)
- **Base**: Node.js image with Remotion + Agent SDK pre-installed
- **Agent**: Claude Agent SDK with `claude_code` preset - receives prompts, edits files
- **Remotion App**: Custom React app with `@remotion/player` (NOT Remotion Studio/CLI)
- **Dev server**: Vite dev server with HMR, exposed port for iframe preview
- **Communication**: WebSocket server for agent prompts/responses

## Agent SDK Integration (runs inside container)

### Remotion Skill Integration

The official Remotion skill (`remotion-best-practices`) provides domain-specific knowledge for video creation. The skill must be placed in `.claude/skills/` inside the container for the Agent SDK to discover it.

**Skill location in container:**
```
/app/
├── .claude/
│   └── skills/
│       └── remotion-best-practices/
│           ├── SKILL.md
│           └── rules/
│               ├── animations.md
│               ├── compositions.md
│               ├── timing.md
│               ├── sequencing.md
│               └── ... (25+ rule files)
└── remotion-app/
    └── src/
```

### Agent Server Implementation

```typescript
// Inside project container: agent-server.ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ port: 3001 });

wss.on("connection", (ws) => {
  ws.on("message", async (data) => {
    const { prompt } = JSON.parse(data.toString());

    const result = query({
      prompt,
      options: {
        cwd: "/app/remotion-app",
        model: "claude-opus-4-5-20250101",

        // Use Claude Code system prompt with Remotion-specific additions
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: `
You are a Remotion video creation assistant. Create programmatic videos
using Remotion and @remotion/player.

IMPORTANT: Use the remotion-best-practices skill for domain knowledge.
The skill contains rules for animations, timing, sequencing, and more.

Project structure:
- src/App.tsx - Main app with <Player> component
- src/compositions/ - Video compositions (edit these)
- src/compositions/MyVideo.tsx - Default composition

The preview updates automatically via Vite HMR when you edit files.
          `
        },

        // Load skills from filesystem (required for Skill tool)
        settingSources: ['project'],

        // Enable Skill tool + file editing tools
        allowedTools: [
          'Skill',      // Loads remotion-best-practices when relevant
          'Read',
          'Write',
          'Edit',
          'Glob',
          'Grep',
          'Bash'
        ],

        // Auto-accept file edits (sandboxed in container)
        permissionMode: 'acceptEdits'
      }
    });

    // Stream responses back via WebSocket
    for await (const message of result) {
      ws.send(JSON.stringify(message));
    }
  });
});
```

### How the Skill Works

1. **Auto-discovery**: Agent SDK scans `.claude/skills/` on startup
2. **On-demand loading**: When user asks about animations, timing, etc., Claude invokes the skill
3. **Progressive disclosure**: Only ~100 tokens for metadata scan; full rules load when needed
4. **Domain expertise**: 25+ rule files covering all Remotion patterns (animations, sequencing, audio, 3D, etc.)

## Container Lifecycle

1. **On session start**:
   - Backend creates container from project-container image
   - Image includes:
     - Pre-installed dependencies (Remotion, Agent SDK, etc.)
     - Remotion skill at `/app/remotion-app/.claude/skills/remotion-best-practices/`
     - Default composition template
   - Container runs `start.sh` which launches:
     - Agent WebSocket server (port 3001)
     - Vite dev server (port 3000)
   - Backend returns both URLs to frontend

2. **During session**:
   - Frontend sends prompts to backend → backend routes to container's agent
   - Agent edits files in `/app/remotion-app/src/compositions/`
   - Vite HMR picks up changes → iframe auto-updates
   - Agent streams responses back through WebSocket chain

3. **On session end / timeout**:
   - Backend stops and removes container
   - All session state is lost (persistence is post-MVP)

## Deployment (MVP)

### Development
```
docker-compose.yml
├── frontend (Vite dev server)
├── backend (Node.js + Agent SDK)
└── [dynamic project containers]
```

### Production (MVP)
- Frontend: Static build served via nginx
- Backend: Node.js container with Docker socket access
- Project containers: Dynamically created per session

## API Design

### WebSocket Events

**Frontend ↔ Backend (Orchestrator):**

Client → Server:
- `session:start` - Spin up new project container
- `message:send` - Route user message to container's agent
- `session:end` - Destroy container

Server → Client:
- `session:ready` - Container ready, includes `{ previewUrl, agentUrl }`
- `agent:message` - Streamed response from agent (forwarded)
- `agent:complete` - Agent finished responding
- `error` - Error occurred

**Backend ↔ Container (Agent):**

Backend → Container:
- `{ type: "prompt", content: "user message" }`

Container → Backend:
- Agent SDK messages (streamed, forwarded to frontend)

## Project Structure

```
storydream/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Chat.tsx
│   │   │   ├── VideoPreview.tsx
│   │   │   └── Landing.tsx
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── vite.config.ts
│   └── Dockerfile
├── backend/                     # Orchestrator only
│   ├── src/
│   │   ├── container.ts         # Docker container management
│   │   ├── websocket.ts         # WebSocket routing
│   │   └── index.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
├── project-container/           # Self-contained agent + Remotion app
│   ├── agent/
│   │   ├── server.ts            # WebSocket server for agent
│   │   └── index.ts             # Agent SDK integration
│   ├── remotion-app/
│   │   ├── .claude/
│   │   │   └── skills/
│   │   │       └── remotion-best-practices/  # Official Remotion skill
│   │   │           ├── SKILL.md
│   │   │           └── rules/*.md
│   │   ├── src/
│   │   │   ├── App.tsx          # Renders <Player> component
│   │   │   ├── compositions/
│   │   │   │   └── MyVideo.tsx  # Agent edits these
│   │   │   └── main.tsx
│   │   ├── package.json
│   │   └── vite.config.ts
│   ├── package.json             # Has @anthropic-ai/claude-agent-sdk
│   ├── start.sh                 # Starts both agent server + Vite
│   └── Dockerfile
├── docker-compose.yml
└── spec.md
```

## Success Criteria (MVP)

- [ ] User can start a session and see a default Remotion video preview
- [ ] User can chat with the agent and request video changes
- [ ] Agent successfully modifies Remotion code
- [ ] Preview updates automatically without manual refresh
- [ ] Multiple concurrent sessions work independently
- [ ] Session cleanup works properly

## Future Enhancements (Post-MVP)

- Kubernetes deployment with proper pod isolation
- Video rendering/export to MP4
- Project persistence and retrieval
- Template library for common video types
- Asset upload (images, audio)
- Collaboration features
- User authentication

## MVP Decisions

- **Claude model**: Opus (quality over speed for MVP)
- **Rate limiting**: None for MVP
- **Container resource limits**: None for MVP

## Sources

- [Claude Agent SDK - TypeScript](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Claude Agent SDK - System Prompts](https://platform.claude.com/docs/en/agent-sdk/modifying-system-prompts)
- [Agent Skills in the SDK](https://platform.claude.com/docs/en/agent-sdk/skills)
- [Plugins in the SDK](https://platform.claude.com/docs/en/agent-sdk/plugins)
- [Remotion Player in iframe](https://www.remotion.dev/docs/miscellaneous/snippets/player-in-iframe)
- [@remotion/player docs](https://www.remotion.dev/docs/player/)
