# Based on official Remotion Docker documentation
# https://www.remotion.dev/docs/docker
FROM node:22-bookworm-slim

# Install Chrome Headless Shell dependencies (official list from Remotion docs)
RUN apt-get update && apt-get install -y \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libgbm-dev \
    libasound2 \
    libxrandr2 \
    libxkbcommon-dev \
    libxfixes3 \
    libxcomposite1 \
    libxdamage1 \
    libatk-bridge2.0-0 \
    libpango-1.0-0 \
    libcairo2 \
    libcups2 \
    # Additional useful packages
    fonts-noto-color-emoji \
    fonts-liberation \
    ca-certificates \
    curl \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Note: Using @google-cloud/storage npm package instead of gsutil CLI
# This avoids needing Python for gcloud SDK installation

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy render script (ensureBrowser() is called at runtime)
COPY render.mjs ./

# Run as non-root user for security (node user already exists with UID 1000)
RUN chown -R node:node /app
USER node

CMD ["node", "render.mjs"]
