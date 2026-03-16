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

### Step 8: Verify each endpoint works

Before adding a route to `routes.ts`, verify it actually returns useful data. With the browser still connected:

```bash
# Test each captured endpoint via the proxy
curl -s http://localhost:3001/api/<name>/<path> | jq 'type'
# Should return "object" or "array" for JSON APIs
# If it returns "string", the response is HTML (SSR endpoint)
```

For each endpoint, determine:
1. **Does it return JSON?** → Good, add to routes.ts
2. **Does it return HTML?** → SSR endpoint, may need parsing (see "Classifying Discovered Endpoints")
3. **Does it return 400/403?** → Wrong request format or anti-bot. Check captured traffic for the correct request body/headers
4. **What data does it contain?** → Read the response to write an accurate `description` field

Only add endpoints to `routes.ts` that return actionable data. Skip telemetry, analytics, and tracking endpoints.

### Step 9: Test proxy routes

Restart the server, then verify all routes work:

```bash
# List registered routes
curl -s http://localhost:3001/api | jq '.domains[] | select(.name == "<name>")'

# Connect browser (required for proxy to work)
# Then test each route:
curl -s http://localhost:3001/api/<name>/search | jq '.[:2]'
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

## Classifying Discovered Endpoints

After capturing traffic, classify each endpoint before adding it to routes.ts:

### Type 1: JSON API (ideal)
- Response `content-type` includes `application/json`
- Returns structured data directly usable by the dashboard
- Add directly to `routes.ts` — browserFetch proxy works perfectly

### Type 2: Server-Side Rendered HTML (SSR)
- Response `content-type` is `text/html`
- Data is embedded in the HTML, no separate JSON API
- Signs: search pages that return 200 with HTML, status 202 before 200
- Example: StubHub `/secure/search?q=Bad+Bunny` returns HTML with results embedded
- **Solution**: The browserFetch still works — it fetches the HTML with cookies. The route handler needs to parse the HTML response (use regex or a DOM parser) to extract the structured data. Document this in the route description.

### Type 3: Telemetry/Analytics (skip)
- URLs containing: `jsa/v1/events`, `analytics`, `tracking`, `log`, `beacon`, `pixel`
- Request body contains metrics (TTFB, FCP, page views)
- **Do not add to routes.ts** — these are internal telemetry, not user-facing APIs

### Type 4: Anti-Bot Challenge
- Status codes: 403, 429, or redirect to CAPTCHA page
- Response contains Cloudflare challenge tokens (`__cf_chl_rt_tk`)
- Signs: URL changes include challenge tokens, page briefly shows "checking your browser"
- **Solution**: The Patchright stealth settings usually bypass these. If blocked, try:
  1. Use a persistent profile (cookies survive restarts)
  2. Navigate to the homepage first, then to the target page
  3. Add delays between navigations (2-3 seconds)
  4. Check if Ghostery ad-blocker is blocking required scripts

### Type 5: WebSocket/Streaming
- URL uses `wss://` protocol or EventSource
- Response is chunked/streaming, not a single JSON payload
- **Not supported by browserFetch proxy** — needs a different approach (WebSocket forwarding)
- Document as a limitation for now

## Gotchas

| Problem | Fix |
|---------|-----|
| Traffic shows 0 entries | Use root domain in `capture=` (e.g., `stubhub.com` not `www.stubhub.com`) |
| All endpoints return HTML, no JSON APIs | Site is SSR — the data is in the HTML. Use browserFetch to get the page and parse the response |
| Proxy returns 400 validation error | Wrong endpoint — check request body shape from captured traffic. Telemetry endpoints aren't search APIs |
| Proxy returns 503 | No browser connected — connect via WebSocket first |
| Cloudflare challenge (403/redirect) | Use persistent profile, navigate to homepage first, add delays |
| Module import error | Ensure `"type": "module"` in domain's package.json |
| pnpm can't find domain | Run `pnpm install` after adding to workspace; check `pnpm-workspace.yaml` includes `'domains/*'` |
| JS/CSS in captured traffic | Codegen filters these automatically; or only add JSON endpoints to routes.ts |

## SSR Data Extraction

Many sites embed data in their initial HTML response (Server-Side Rendering). The API isn't a separate XHR call — it's inside the page HTML.

### How to detect SSR data

After navigating to a page, search the HTML response for embedded JSON:

```typescript
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.enable');

// Capture the Document response
cdp.on('Network.loadingFinished', async (params) => {
  const body = await cdp.send('Network.getResponseBody', { requestId: params.requestId });
  const html = body.body;

  // Search for JSON data patterns
  const hasItems = html.includes('"items":[');
  const hasSections = /"section":"[^"]+"/g.test(html);
  const hasPrices = /"price":\d|"rawPrice":\d|"amount":\d/.test(html);

  if (hasItems || hasSections || hasPrices) {
    // Extract the JSON block
    const match = html.match(/\{"items":\[.*?\]\}/s);
    if (match) {
      const data = JSON.parse(match[0]);
      console.log('Found', data.items.length, 'items in SSR HTML');
    }
  }
});
```

### How to discover pagination APIs

After extracting page 1 from SSR, look for "Show more", "Load more", or "Next page" buttons:

```typescript
const btn = await page.waitForSelector('button:has-text("Show more"), button:has-text("Load more")', { timeout: 5000 });
if (btn) {
  await btn.click();
  // CDP will capture the POST/GET that fetches the next page
  // The request body reveals pagination params (page, offset, cursor)
  // The response body is the JSON API contract
}
```

### The SSR + Pagination pattern

1. **Page 1**: Embedded in HTML → parse with regex or DOM
2. **Page 2+**: POST/GET API call triggered by interaction → JSON response
3. **Domain plugin**: Create a route for the pagination API, use `browserFetch()` to proxy it
4. **For page 1**: Either re-request the HTML and parse it, or use the pagination API with `CurrentPage: 1`
