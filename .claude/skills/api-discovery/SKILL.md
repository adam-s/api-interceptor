---
name: api-discovery
description: Discover any website's API and create domain plugins with proxy routes. Use when the user wants to create an API for a website, reverse-engineer a web service, add a new domain, capture browser traffic, build typed API clients, or integrate with a third-party site. Also use when the user mentions a website name and wants to interact with it programmatically.
---

# API Discovery

Discover a website's internal APIs by capturing browser traffic, then expose them as clean REST proxy routes through the browser's authenticated session.

For detailed architecture, see [reference/architecture.md](reference/architecture.md).

## Decision: Does the Domain Plugin Already Exist?

Check `domains/` for an existing plugin:

```bash
ls domains/ | grep <domain-name>
```

- **If it exists**: Read its `src/routes.ts` to see available endpoints. Skip to "Use Existing Domain."
- **If it does not exist**: Follow "Create New Domain" below.

## Create New Domain

### Step 1: Scaffold the domain package

Run the bundled scaffold script. Replace `<name>` with a short lowercase identifier and `<root-domain>` with the website's domain:

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/scaffold-domain.sh <name> <root-domain>
```

Example: `bash ${CLAUDE_SKILL_DIR}/scripts/scaffold-domain.sh stubhub stubhub.com`

This creates `domains/<name>/` with package.json, config.ts, interceptor.ts, routes.ts, and index.ts from templates.

### Step 2: Register the domain

Add to `apps/api/src/register-domains.ts`:

```typescript
import { plugin as <name> } from '@interceptor/domain-<name>';
registerDomain(<name>);
```

Add to `apps/api/package.json` dependencies:

```json
"@interceptor/domain-<name>": "workspace:*"
```

Run `pnpm install` to link the workspace package.

### Step 3: Start the server

```bash
pnpm run dev
```

Verify: `curl -s http://localhost:3001/browser/health | jq .status`

### Step 4: Connect browser and capture traffic

Connect a browser to the target website via WebSocket:

```typescript
import WebSocket from 'ws';
const ws = new WebSocket(
  'ws://localhost:3001/browser/stream?profile=<name>&capture=<root-domain>&url=https://www.<root-domain>/'
);
ws.on('message', (data) => {
  if (data[0] === 0x7b) {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'ready') console.log('Browser ready');
    if (msg.type === 'url') console.log('URL:', msg.url);
  }
});
```

**IMPORTANT**: Use the root domain for the `capture` parameter (e.g., `stubhub.com` not `www.stubhub.com`). The glob `**/*<domain>/**` catches all subdomains.

### Step 5: Navigate to trigger API calls

Send navigation commands to trigger API traffic:

```typescript
ws.send(JSON.stringify({ type: 'navigate', url: 'https://www.<root-domain>/search?q=concerts' }));
```

Wait 5-10 seconds for API calls to fire.

### Step 6: Read captured traffic

```bash
# Check total captured
curl -s http://localhost:3001/browser/traffic | jq '.total'

# See unique endpoint patterns
curl -s http://localhost:3001/browser/traffic/summary | jq '.endpoints[] | {pattern, count, methods}'

# Full details
curl -s http://localhost:3001/browser/traffic | jq '.entries[] | {method, url: .url[:100], status}'
```

### Step 7: Extract routes from traffic

Read the traffic summary. For each JSON API endpoint (skip HTML pages, JS, CSS, images):

1. Identify the method (GET/POST)
2. Extract the full URL
3. Create a clean path for the Hono route
4. Write a description

Update `domains/<name>/src/routes.ts`:

```typescript
export const routes: DomainRoute[] = [
  {
    method: 'GET',
    path: '/search',
    targetUrl: 'https://api.<root-domain>/v1/search',
    description: 'Search for events/items',
  },
  // ... more routes from traffic
];
```

Also update `domains/<name>/src/config.ts` with the actual `interceptPatterns` and `baseUrls` discovered from the traffic URLs.

### Step 8: Test proxy routes

Restart the server, then verify:

```bash
# List registered routes
curl -s http://localhost:3001/api | jq '.domains[] | select(.name == "<name>")'

# Connect browser (required for proxy to work)
# Then call a proxy route:
curl -s http://localhost:3001/api/<name>/search
```

### Step 9: Clear traffic and iterate

```bash
curl -X DELETE http://localhost:3001/browser/traffic
```

Navigate to more pages to discover additional endpoints. Repeat steps 6-8 until all needed APIs are captured.

## Use Existing Domain

If the domain plugin exists in `domains/<name>/`:

1. Ensure it is registered in `apps/api/src/register-domains.ts`
2. Start the server: `pnpm run dev`
3. Connect browser: `?profile=<name>&capture=<root-domain>&url=https://www.<root-domain>/`
4. Call proxy routes: `curl http://localhost:3001/api/<name>/<path>`

## Reference Files

- **Templates**: See [templates/](templates/) for domain package scaffolding
- **Scaffold script**: See [scripts/scaffold-domain.sh](scripts/scaffold-domain.sh)
- **Architecture details**: See [reference/architecture.md](reference/architecture.md)
- **Example domains**: See `domains/ticketmaster/` (simple) and `domains/robinhood/` (complex)

## Gotchas

| Problem | Fix |
|---------|-----|
| Traffic shows 0 entries | Use root domain in `capture=` (e.g., `stubhub.com` not `www.stubhub.com`) |
| Proxy returns HTML not JSON | Browser not on target origin yet — wait for page to fully load |
| Proxy returns 503 | No browser connected — connect via WebSocket first |
| Module import error | Ensure `"type": "module"` in domain's package.json |
| pnpm can't find domain | Run `pnpm install` after adding to workspace; check `pnpm-workspace.yaml` includes `'domains/*'` |
| JS/CSS in captured traffic | Codegen filters these automatically; or only add JSON endpoints to routes.ts |
