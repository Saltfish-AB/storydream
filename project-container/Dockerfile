# Project container: Remotion app + Claude Agent
FROM node:20-slim

# Install dependencies for Remotion, Claude Code, and GCS access
RUN apt-get update && apt-get install -y \
    chromium \
    curl \
    git \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install Google Cloud SDK for GCS access
RUN echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] http://packages.cloud.google.com/apt cloud-sdk main" | tee -a /etc/apt/sources.list.d/google-cloud-sdk.list \
    && curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg \
    && apt-get update && apt-get install -y google-cloud-cli \
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

# Create directory for GCP credentials
RUN mkdir -p /app/.config/gcloud

# Give node user ownership of /app (required for bypassPermissions mode)
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Expose ports
# 3000 - Vite dev server (Remotion preview)
# 3001 - Agent WebSocket server
# 3002 - Agent HTTP server (sync endpoint)
EXPOSE 3000 3001 3002

# Start both services
CMD ["./start.sh"]
