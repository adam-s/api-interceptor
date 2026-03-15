# Interceptor

A framework for reverse-engineering web APIs through request/response interception and building strongly-typed API clients.

**Capture. Analyze. Generate.**

- **Capture** HTTP traffic from any website using Patchright browser automation
- **Analyze** request/response patterns to discover API endpoints
- **Generate** typed TypeScript clients with Zod schemas

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Open dashboard
open http://localhost:3000
open http://localhost:3000/browser
```

## Architecture

```text
apps/api/          @interceptor/api — Hono API server + browser streaming
apps/web/          @interceptor/web — Next.js 16 + shadcn/ui (public dashboard)
packages/browser/  @interceptor/browser — Patchright-based browser automation
packages/shared/   @interceptor/shared — Shared types and utilities
services/python/   Python worker for scientific computing via IPC bridge
```

## Core Features

### /dashboard

Real-time dashboard for WebSocket + Python bridge integration. Demonstrates stateful streaming with server-client synchronization.

### /browser

Remote browser viewer with:

- Live CDP screencast (canvas-based rendering)
- Real-time traffic interception
- Request/response capture for API discovery
- User-Agent pools and anti-detection stealth

## Security

⚠️ **Before publishing to GitHub:**

- [ ] Verify no AWS account IDs or private domains in code
- [ ] Verify no credentials in code (API keys, domain names, instance IDs)
- [ ] Check git history for sensitive data: `git log --all --full-history -- [path/to/file]`
- [ ] Run: `grep -r "todo\|fixme" --include="*.ts" | grep -v "not implemented"`

## Development

```bash
# Run all checks (lint, type, test, build, docker)
pnpm run ci-local

# Run specific checks
pnpm biome ci .              # Biome linting
pnpm turbo typecheck        # TypeScript
pnpm turbo test             # Unit tests
docker build -f apps/api/Dockerfile .
docker build -f apps/web/Dockerfile .
```

## Environment Setup

Copy `.env.example` to `.env`. The dashboard is public with no authentication.

```bash
NODE_ENV=development
```

## Packages

- **@interceptor/api** — Hono server with WebSocket + browser streaming
- **@interceptor/web** — Next.js frontend dashboard (public, no auth)
- **@interceptor/browser** — Patchright browser + stealth automation
- **@interceptor/shared** — Common types, debug logging, Python bridge

## License

MIT
