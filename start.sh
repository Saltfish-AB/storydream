#!/bin/bash

# StoryDream Docker Start Script

set -e

usage() {
    echo "Usage: ./start.sh [dev|prod]"
    echo ""
    echo "  dev   - Start backend in development mode (hot reload)"
    echo "  prod  - Start full stack (frontend + backend)"
    echo ""
    exit 1
}

if [ -z "$1" ]; then
    usage
fi

case "$1" in
    dev)
        echo "Starting development environment..."
        docker-compose -f docker-compose.dev.yml up --build -d
        echo ""
        echo "Backend running at http://localhost:8080"
        echo "Run frontend separately with: cd frontend && npm run dev"
        ;;
    prod)
        echo "Starting production environment..."
        docker-compose -f docker-compose.yml up --build -d
        echo ""
        echo "Frontend running at http://localhost:3000"
        echo "Backend running at http://localhost:8080"
        ;;
    *)
        usage
        ;;
esac

echo ""
echo "View logs with: docker-compose logs -f"
