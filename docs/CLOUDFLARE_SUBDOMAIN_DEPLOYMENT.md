# Cloudflare Subdomain Deployment Guide

## Overview

Session previews use subdomains like `{shortId}.saltfish.ai` for the Remotion preview iframe.

**Status:** Deployed and working.

## Architecture

```
Browser requests https://abc12345.saltfish.ai
    │
    ▼
Cloudflare (TLS termination via Universal SSL wildcard)
    │ DNS: *.saltfish.ai → 34.88.75.245 (proxied)
    ▼
nginx-ingress (34.88.75.245)
    │ matches *.saltfish.ai via ingress-wildcard.yaml
    ▼
backend:8081
    │ extracts shortId from Host header
    │ looks up session by shortId
    ▼
pod IP:3000 (Remotion preview server)
```

## Why Root Wildcard?

We use `*.saltfish.ai` (root wildcard) instead of `*.storydream.saltfish.ai` (nested wildcard) because:

1. **Vite dev server limitation**: Vite doesn't support relative `base` paths in dev mode. Script paths like `/@vite/client` are always absolute.

2. **SSL coverage**: Cloudflare's free Universal SSL covers `*.saltfish.ai` but NOT nested wildcards like `*.storydream.saltfish.ai` (requires paid Advanced Certificate Manager).

3. **Safety**: Explicit DNS records take precedence over wildcards, so existing subdomains like `studio.saltfish.ai` are unaffected (they point to different IPs).

## DNS Configuration (Cloudflare)

```
Type: A
Name: *
Content: 34.88.75.245
Proxy: Yes (orange cloud)
```

## Key Files

| File | Purpose |
|------|---------|
| `k8s/ingress-wildcard.yaml` | Routes `*.saltfish.ai` to backend |
| `backend/src/api.ts` | Subdomain routing middleware (lines 34-91) |
| `backend/src/kubernetes.ts` | `getSessionByShortId()` function |
| `backend/src/websocket.ts` | Sets `previewUrl` to `https://{shortId}.saltfish.ai/` |

## Deployment

Build and deploy backend:
```bash
cd backend
gcloud builds submit --tag europe-north1-docker.pkg.dev/saltfish-434012/storydream/backend:v8 .
kubectl set image deployment/backend backend=europe-north1-docker.pkg.dev/saltfish-434012/storydream/backend:v8 -n storydream
```

Apply wildcard ingress (if not already):
```bash
kubectl apply -f k8s/ingress-wildcard.yaml
```

## Testing

```bash
# Verify DNS resolves
dig +short test123.saltfish.ai

# Verify SSL works (404 is fine - means TLS works)
curl -I https://test123.saltfish.ai
```

## Troubleshooting

### Session not found errors
```bash
kubectl logs -f deployment/backend -n storydream
```
Look for `[Subdomain Router]` logs.

### SSL certificate errors
- Ensure Cloudflare proxy is ON (orange cloud) for the `*` record
- Check SSL/TLS mode is set to "Full" in Cloudflare

### Ingress not routing correctly
```bash
kubectl describe ingress storydream-wildcard-ingress -n storydream
kubectl logs -n ingress-nginx -l app.kubernetes.io/component=controller
```
