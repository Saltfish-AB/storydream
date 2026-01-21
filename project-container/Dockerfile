# Project container: Remotion app + Claude Agent
FROM node:20-slim

# Install dependencies for Remotion and Claude Code
RUN apt-get update && apt-get install -y \
    chromium \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app

# Copy and install agent dependencies first (better caching)
COPY agent/package*.json ./agent/
RUN cd agent && npm install

# Copy and install Remotion app dependencies
COPY remotion-app/package*.json ./remotion-app/
RUN cd remotion-app && npm install

# Copy agent source code
COPY agent/ ./agent/

# Copy Remotion app source code (including .claude/skills)
COPY remotion-app/ ./remotion-app/

# Copy start script
COPY start.sh ./
RUN chmod +x start.sh

# Give node user ownership of /app (required for bypassPermissions mode)
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Expose ports
# 3000 - Vite dev server (Remotion preview)
# 3001 - Agent WebSocket server
EXPOSE 3000 3001

# Start both services
CMD ["./start.sh"]
