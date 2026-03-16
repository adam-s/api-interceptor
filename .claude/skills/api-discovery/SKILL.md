---
name: api-discovery
description: Discover any website's API and create domain plugins with proxy routes. Use when the user wants to create an API for a website, reverse-engineer a web service, add a new domain, capture browser traffic, build typed API clients, or integrate with a third-party site. Also use when the user mentions a website name and wants to interact with it programmatically.
---

# API Discovery

Discover how a website delivers its data, then create a domain plugin that extracts it. Works with JSON APIs, SSR pages, and hybrid sites.

For architecture details, see [reference/architecture.md](reference/architecture.md).

## Quick Check: Does the Domain Plugin Already Exist?

```bash
ls domains/ | grep <domain-name>
```

If it exists, read `domains/<name>/src/routes.ts` and skip to "Use Existing Domain" at the bottom.

## Phase 1: Observe

Navigate to the target page and see what data is visible.

### 1a. Start the server and connect the browser

```bash
pnpm run dev
```

Open a browser session via WebSocket:

```typescript
import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:3001/browser/stream?profile=default&url=<target-url>');
```

Or open the dashboard: `http://localhost:3000/browser?profile=default&url=<target-url>`

### 1b. Take a screenshot to see the rendered data

Use the visual-dev skill or a quick Patchright script:

```typescript
await page.screenshot({ path: 'test-results/dev-screenshots/discovery.png' });
```

Read the screenshot. Identify what data is visible: prices, names, sections, dates, listings, etc. This is the data we need to extract.

### 1c. Capture ALL network traffic via CDP

CDP `Network.enable` is already active in the handler. Check what API calls were made:

```bash
curl -s http://localhost:3001/browser/traffic | jq '.total'
curl -s http://localhost:3001/browser/traffic | jq '[.entries[] | {method, url: .url[:120], status}]'
```

## Phase 2: Classify the Data Source

Compare what you SEE on the page vs what CDP CAPTURED.

### Decision tree:

**Q: Does the captured traffic contain the visible data (prices, listings, etc.)?**

- **YES → Type A: JSON API** — The data comes from XHR/Fetch calls returning JSON. Create proxy routes for these endpoints.

- **NO → Type B: SSR (Server-Side Rendered)** — The data is embedded in the initial HTML response. Need to extract from HTML.

- **PARTIALLY → Type C: Hybrid** — Page 1 data is SSR, but pagination/filtering triggers JSON API calls. Need both extraction approaches.

### How to confirm SSR data

Search the initial HTML response for the data you see on screen:

```typescript
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.enable');

// Capture the Document response
cdp.on('Network.loadingFinished', async (params) => {
  const body = await cdp.send('Network.getResponseBody', { requestId: params.requestId });
  const html = body.body;

  // Search for data patterns
  const hasItems = html.includes('"items":[');
  const hasPrices = /"price":\d|"rawPrice":\d|"amount":\d/.test(html);
  const hasSections = /"section":"[^"]+"/g.test(html);

  console.log('SSR data:', { hasItems, hasPrices, hasSections, htmlLength: html.length });
});
```

### How to discover pagination APIs

Click "Show more", "Load more", "Next page", or scroll down. Watch for new API calls:

```typescript
await page.click('button:has-text("Show more")');
// CDP captures the POST/GET that fetches more data
// Check: curl -s http://localhost:3001/browser/traffic | jq '.entries[-1]'
```

## Phase 3: Extract

Based on the classification, write extraction code.

### Type A: JSON API routes

The data comes from API calls. Create proxy routes in the domain plugin:

```typescript
// domains/<name>/src/routes.ts
export const routes: DomainRoute[] = [
  {
    method: 'GET',
    path: '/search',
    targetUrl: 'https://api.example.com/v1/search',
    description: 'Search for items',
  },
];
```

These routes proxy through `browserFetch()` — cookies and auth are automatic.

### Type B: SSR extraction

Write a script that fetches the page HTML and parses the embedded JSON:

```typescript
// Extract JSON data embedded in SSR HTML
const html = await browser.browserFetch(targetUrl);
const match = html.data.match(/\{"items":\[.*?\]\}/s);
if (match) {
  const data = JSON.parse(match[0]);
  // data.items contains the structured data
}
```

For the domain plugin, create a Hono route that does this extraction:

```typescript
app.get('/listings/:eventId', async (c) => {
  const html = await browser.browserFetch(`https://www.example.com/event/${c.req.param('eventId')}/`);
  const match = html.data.match(/\{"items":\[.*?\]\}/s);
  return c.json(match ? JSON.parse(match[0]) : { items: [] });
});
```

### Type C: Hybrid (SSR + pagination API)

Combine both approaches:
- Page 1: Extract from SSR HTML
- Page 2+: Use the pagination POST API with `browserFetch()`

```typescript
// The pagination API contract (discovered by clicking "Show more"):
const response = await browser.browserFetch(eventUrl, {
  method: 'POST',
  body: { CurrentPage: 2, PageSize: 16, Quantity: 2, SortBy: 'RECOMMENDED' },
});
// response.data.items contains page 2 ticket listings
```

## Phase 4: Verify

Test that the extraction works and returns the expected data.

### Write a test script

```typescript
// Quick verification
const result = await fetch('http://localhost:3001/api/<domain>/listings/12345');
const data = await result.json();
console.log('Items:', data.items?.length);
console.log('First item:', data.items?.[0]);
// Should show: section, row, seat, price — matching what the screenshot showed
```

### Compare against screenshot

The extracted data should match what's visible on the page. If the screenshot shows "Section 222, Row 19, $1,084" — the extraction should return that exact data.

## Phase 5: Create Domain Plugin

### Scaffold the package

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/scaffold-domain.sh <name> <root-domain>
```

### Populate routes from discovery

Update `domains/<name>/src/routes.ts` with the routes discovered in Phases 2-3.

### Register and install

Add to `apps/api/src/register-domains.ts` and `apps/api/package.json`, then `pnpm install`.

### Test end-to-end

```bash
curl -s http://localhost:3001/api/<domain>/listings/12345 | jq '.items | length'
```

## Use Existing Domain

If `domains/<name>/` exists:
1. Ensure registered in `apps/api/src/register-domains.ts`
2. `pnpm run dev`
3. Connect browser to the domain
4. Call proxy routes: `curl http://localhost:3001/api/<name>/<path>`

## Reference Files

- **Templates**: See [templates/](templates/) for domain package scaffolding
- **Scaffold script**: See [scripts/scaffold-domain.sh](scripts/scaffold-domain.sh)
- **Architecture**: See [reference/architecture.md](reference/architecture.md)
- **Example domains**: `domains/ticketmaster/` (JSON API), `domains/robinhood/` (complex auth)

## Gotchas

| Problem | Fix |
|---------|-----|
| Traffic shows 0 entries | CDP captures automatically. Check `curl localhost:3001/browser/traffic` |
| Data visible on page but not in traffic | SSR — data is in the HTML response, not XHR calls. Search the HTML. |
| API calls go to unexpected domains | CDP catches all domains. Check traffic for `viagogo.net`, `stubhub.net`, etc. |
| Pagination API only fires on button click | Use `page.click('button:has-text("Show more")')` to trigger it |
| WAF challenge blocks content | Some sites withhold data until challenge passes. Use persistent profiles with real cookies. |
| Content-type header missing | Our CDP capture includes responses with no content-type. Not an issue. |
| Bot detection (`BotDLog: true`) | Page may load but with limited data. Try persistent profile, warmup, or non-headless mode. |
