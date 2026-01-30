#!/bin/bash
set -e

# StoryDream Render Feature Deployment Script
# Run this script to deploy the video rendering feature to production

PROJECT_ID="saltfish-434012"
REGION="europe-north1"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/storydream"
NAMESPACE="storydream"

# Get the absolute path to the repo root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=========================================="
echo "StoryDream Render Feature Deployment"
echo "=========================================="

# Step 1: Build and push render container
echo ""
echo "Step 1: Building render container..."
echo "----------------------------------------"
cd "${REPO_ROOT}/render-container"
docker build -t "${REGISTRY}/render-container:latest" .
docker push "${REGISTRY}/render-container:latest"
echo "✓ Render container pushed"

# Step 2: Create GCP service account (if not exists)
echo ""
echo "Step 2: Setting up GCP IAM..."
echo "----------------------------------------"
SA_NAME="storydream-render"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Check if SA exists
if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" &>/dev/null; then
    echo "Creating service account..."
    gcloud iam service-accounts create "$SA_NAME" \
        --display-name="StoryDream Render Jobs" \
        --project="$PROJECT_ID"
else
    echo "Service account already exists"
fi

# Grant GCS access
echo "Granting GCS access..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/storage.objectAdmin" \
    --condition=None \
    --quiet

# Bind Workload Identity
echo "Binding Workload Identity..."
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
    --role="roles/iam.workloadIdentityUser" \
    --member="serviceAccount:${PROJECT_ID}.svc.id.goog[${NAMESPACE}/${SA_NAME}]" \
    --project="$PROJECT_ID" \
    --quiet

echo "✓ GCP IAM configured"

# Step 3: Apply K8s resources
echo ""
echo "Step 3: Applying Kubernetes resources..."
echo "----------------------------------------"
cd "${REPO_ROOT}/k8s"
kubectl apply -f render-resources.yaml
echo "✓ K8s resources applied"

# Step 4: Restart backend to pick up new code
echo ""
echo "Step 4: Restarting backend deployment..."
echo "----------------------------------------"
kubectl rollout restart deployment/backend -n "$NAMESPACE"
kubectl rollout status deployment/backend -n "$NAMESPACE" --timeout=120s
echo "✓ Backend restarted"

# Step 5: Restart frontend to pick up new code
echo ""
echo "Step 5: Restarting frontend deployment..."
echo "----------------------------------------"
kubectl rollout restart deployment/frontend -n "$NAMESPACE"
kubectl rollout status deployment/frontend -n "$NAMESPACE" --timeout=120s
echo "✓ Frontend restarted"

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Test rendering by opening a project and clicking 'Render Video'"
echo "2. Monitor render jobs: kubectl get jobs -n $NAMESPACE -l app=storydream-render"
echo "3. Check logs: kubectl logs -n $NAMESPACE -l app=storydream-render"
