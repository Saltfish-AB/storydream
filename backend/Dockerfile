# Backend orchestrator
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose WebSocket port
EXPOSE 8080

# Start the backend
CMD ["npm", "run", "start"]
