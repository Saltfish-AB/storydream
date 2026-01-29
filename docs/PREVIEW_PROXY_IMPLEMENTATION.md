# Preview Proxy Implementation Spec

> **SUPERSEDED**: This document describes a path-based proxy approach (`/preview/{sessionId}`) that was abandoned due to Vite dev server limitations. Vite doesn't support relative `base` paths in dev mode, so absolute paths like `/@vite/client` break when accessed via a subpath.
>
> **Current approach**: See [CLOUDFLARE_SUBDOMAIN_DEPLOYMENT.md](./CLOUDFLARE_SUBDOMAIN_DEPLOYMENT.md) for the subdomain-based solution (`{shortId}.saltfish.ai`).

---

## Historical Context

The original plan was to route preview traffic through a path-based proxy:

```
https://storydream.saltfish.ai/preview/{sessionId}/
```

### Why It Didn't Work

1. Vite injects script tags with absolute paths: `<script src="/@vite/client">`
2. These resolve to `https://storydream.saltfish.ai/@vite/client` (wrong)
3. Should resolve to `https://storydream.saltfish.ai/preview/{sessionId}/@vite/client`
4. Vite's `base: './'` config only works in production builds, not dev server

### Solution

Use subdomain-per-session instead:
- `https://{shortId}.saltfish.ai/`
- Vite's absolute paths resolve correctly to the subdomain root
- Cloudflare's Universal SSL covers `*.saltfish.ai`
