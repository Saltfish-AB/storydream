#!/bin/bash
set -e

echo "Starting StoryDream project container..."

# Start the Remotion app dev server in background
echo "Starting Vite dev server on port 3000..."
cd /app/remotion-app
npm run dev &
VITE_PID=$!

# Start the agent server
echo "Starting Agent server on port 3001..."
cd /app/agent
npm run start &
AGENT_PID=$!

# Wait for both services to be ready
echo "Waiting for services to start..."
sleep 3

echo "Services started:"
echo "  - Vite dev server: http://localhost:3000"
echo "  - Agent server: ws://localhost:3001"

# Handle shutdown
cleanup() {
  echo "Shutting down services..."
  kill $VITE_PID $AGENT_PID 2>/dev/null || true
  exit 0
}

trap cleanup SIGTERM SIGINT

# Keep the container running
wait
