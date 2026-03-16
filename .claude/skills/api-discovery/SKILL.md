---
name: api-discovery
description: Discover any website's API, generate typed clients, and expose proxy routes through the browser's authenticated session. Use when the user wants to create an API for a website.
---

# API Discovery & Domain Plugin Creation

Discover undocumented web APIs by capturing browser traffic, then expose them as clean REST endpoints that proxy through the browser's authenticated session. The browser handles cookies and auth automatically.

## What This Skill Produces

For any website, this skill creates:

1. **Captured traffic** — Real API requests/responses from the browser
2. **Domain plugin** — A package in `domains/<name>/` with typed routes
3. **Proxy API** — Hono REST endpoints at `/api/<name>/` that proxy through `browserFetch()`

## Architecture

```
curl /api/ticketmaster/trending    →    Hono Server    →    browserFetch()    →    Real API
                                         (port 3001)        (page.evaluate)        (with cookies)
```

The browser runs `fetch()` inside the page context via `page.evaluate()`. This means cookies, CSRF tokens, and session state are automatically included — no manual header management.

## Step-by-Step Workflow

### Step 1: Start the Server

```bash
pnpm run dev
# API server: http://localhost:3001
# Dashboard:  http://localhost:3000
```

Verify: `curl http://localhost:3001/browser/health`

### Step 2: Connect Browser and Capture Traffic

Connect a browser to the target website. Use the `capture` parameter with the site's domain:

```bash
# Via dashboard (user clicks Connect):
open "http://localhost:3000/browser?profile=<name>&capture=<domain>&url=<start-url>"

# Or via WebSocket directly:
pnpm exec tsx -e "
import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:3001/browser/stream?profile=mysite&capture=example.com&url=https://www.example.com');
ws.on('message', (data) => {
  if (data[0] === 0x7b) {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'ready') console.log('Browser ready');
    if (msg.type === 'url') console.log('URL:', msg.url);
  }
});
setTimeout(() => { ws.close(); process.exit(0); }, 30000);
"
```

**IMPORTANT**: The `capture` parameter uses glob matching `**/*<domain>/**`. Use the root domain (e.g., `ticketmaster.com`) to catch all subdomains (`www.`, `api.`, `identity.`, etc.).

### Step 3: Navigate to Trigger API Calls

The browser must navigate and interact with the site to trigger API calls. Send navigation commands via WebSocket:

```typescript
ws.send(JSON.stringify({ type: 'navigate', url: 'https://www.example.com/some-page' }));
```

Or tell the user to interact via the dashboard.

### Step 4: Read Captured Traffic

```bash
# How many API calls captured?
curl -s http://localhost:3001/browser/traffic | jq '.total'

# Summary of unique endpoints
curl -s http://localhost:3001/browser/traffic/summary | jq '.endpoints[] | {pattern, count, methods}'

# Full traffic details
curl -s http://localhost:3001/browser/traffic | jq '.entries[] | {method, url: .url[:100], status}'

# Clear buffer before next navigation
curl -X DELETE http://localhost:3001/browser/traffic
```

### Step 5: Generate Domain Plugin

Once you have captured enough traffic, create a domain plugin package:

```bash
mkdir -p domains/<name>/src
```

**`domains/<name>/package.json`**:
```json
{
  "name": "@interceptor/domain-<name>",
  "version": "0.0.1",
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@interceptor/browser": "workspace:*",
    "zod": "4.3.6"
  }
}
```

**`domains/<name>/src/routes.ts`** — Extract from captured traffic:
```typescript
import type { DomainRoute } from '@interceptor/browser/handler/domain-loader';

export const routes: DomainRoute[] = [
  {
    method: 'GET',
    path: '/trending',
    targetUrl: 'https://www.example.com/api/trending',
    description: 'Trending items',
  },
  // ... more routes from captured traffic
];
```

**`domains/<name>/src/config.ts`**:
```typescript
import type { InterceptorConfig } from '@interceptor/browser/shared/config';
import { z } from 'zod';

export const config: InterceptorConfig = {
  domainName: '<name>',
  interceptPatterns: ['https://www.example.com/api/**', 'https://api.example.com/**'],
  requiredHeaders: [],
  headerSchema: z.object({ Cookie: z.string().optional() }),
  baseUrls: ['https://www.example.com'],
};
```

**`domains/<name>/src/interceptor.ts`**:
```typescript
import { GenericInterceptor } from '@interceptor/browser/shared/interceptor';
import { config } from './config';

export class MyInterceptor extends GenericInterceptor {
  constructor() { super(config); }
}
```

**`domains/<name>/src/index.ts`**:
```typescript
import type { DomainPlugin } from '@interceptor/browser/handler/domain-loader';
import { config } from './config';
import { MyInterceptor } from './interceptor';
import { routes } from './routes';

export const plugin: DomainPlugin = {
  domainName: '<name>',
  config,
  routes,
  createInterceptor: () => new MyInterceptor(),
};
```

### Step 6: Register the Domain

**`apps/api/src/register-domains.ts`** — Add import:
```typescript
import { plugin as mysite } from '@interceptor/domain-<name>';
registerDomain(mysite);
```

**`apps/api/package.json`** — Add dependency:
```json
"@interceptor/domain-<name>": "workspace:*"
```

Then: `pnpm install`

### Step 7: Test the Proxy

```bash
# Restart server
pnpm run dev

# Check routes are registered
curl http://localhost:3001/api | jq '.domains[] | select(.name == "<name>")'

# Connect browser to the site
# (browser must be on the domain for cookies to work)

# Call a proxy route
curl http://localhost:3001/api/<name>/trending
```

### Step 8: Run Codegen (Optional)

For a standalone TypeScript client (no browser needed, uses captured headers):

```bash
# Save traffic
curl -s http://localhost:3001/browser/traffic > /tmp/traffic.json

# Generate typed client
pnpm exec tsx packages/browser/src/codegen/cli.ts <name> \
  --traffic /tmp/traffic.json \
  --output domains/<name>/src/client.ts
```

## Gotchas & Lessons Learned

| Problem | Cause | Fix |
|---------|-------|-----|
| Traffic buffer shows 0 entries | `capture` domain doesn't match request URLs | Use root domain (e.g., `ticketmaster.com`) not `www.ticketmaster.com` — glob catches subdomains |
| Proxy returns HTML instead of JSON | Browser not on the target origin yet | Wait for browser to fully load the site before calling proxy |
| Proxy returns 503 "Browser not connected" | No WebSocket connection active | Connect browser first via dashboard or wscat |
| `browserFetch` navigates away from page | Target URL is on a different origin than current page | browserFetch auto-navigates to the origin — this is expected |
| JS/CSS assets in captured traffic | Capture pattern too broad | Codegen filters static assets automatically; or narrow `interceptPatterns` |
| Module import errors at runtime | Missing `"type": "module"` in package.json | All packages need `"type": "module"` for ESM |
| pnpm can't find new domain package | Not in `pnpm-workspace.yaml` | Workspace config must include `'domains/*'` |

## Project Structure

```
api-interceptor/
  domains/                    ← Domain plugins (one per website)
    ticketmaster/             ← Reference: has routes, config, interceptor
    robinhood/                ← Full impl: API client, auth, session mgmt
    investing/
    minuteinbox/
  packages/
    browser/                  ← Framework (interceptor, codegen, remote browser, handler)
      src/handler/            ← WebSocket handler + domain-loader + api-proxy
      src/shared/             ← GenericInterceptor, types, config interface
      src/codegen/            ← Traffic analyzer → schema inferencer → client generator
      src/remote/             ← RemoteBrowserService, profiles, lifecycle
    shared/                   ← Utilities (logging, validation, Python bridge)
  apps/
    api/                      ← Hono server (mounts browser + proxy routes)
    web/                      ← Next.js dashboard
  data/
    browser-profiles/         ← Persistent Chrome profiles (gitignored)
```

## Key Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /browser/health` | Browser connection status |
| `GET /browser/traffic` | All captured API traffic |
| `GET /browser/traffic/summary` | Deduplicated endpoint patterns |
| `DELETE /browser/traffic` | Clear traffic buffer |
| `GET /api` | List all registered domains and their routes |
| `GET /api/<domain>/` | List routes for a specific domain |
| `GET /api/<domain>/<path>` | Proxy request through browser |
