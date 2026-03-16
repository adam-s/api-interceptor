---
name: api-discovery
description: Discover any website's API and create domain plugins with proxy routes. Use when the user wants to create an API for a website, reverse-engineer a web service, add a new domain, capture browser traffic, build typed API clients, or integrate with a third-party site. Also use when the user mentions a website name and wants to interact with it programmatically.
---

# API Discovery

Reverse-engineer how a website delivers its data, then create a domain plugin that exposes it as a typed API. Works with JSON APIs, SSR pages, and hybrid sites.

The gold standard is the StubHub domain: the agent navigated the site as a real user, let every URL reveal itself through real actions, reasoned about where data comes from, and built a complete working API without guessing a single URL. Every discovery session should work the same way.

See `domains/stubhub/src/routes.ts` for the complete reference implementation.

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

- **Type D: Bot-Protected (DataDome, Cloudflare)** — The page loads but content is replaced by a captcha challenge. **Detect**: After navigating, check `document.body.innerHTML` for `captcha-delivery.com`. If found, the site blocks automation. Return `{ blocked: true }` from all routes and mark as "offline" in UI.

```typescript
const bodyHTML = await page.evaluate(() => document.body?.innerHTML?.slice(0, 500) ?? '');
if (bodyHTML.includes('captcha-delivery.com') || bodyHTML.includes('datadome')) {
  // Type D — return blocked response
  return c.json({ blocked: true, reason: 'DataDome bot protection' }, 503);
}
```

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

### Type B: SSR extraction via `page.evaluate()`

Navigate to the page and evaluate the DOM directly. **Always use `innerText` not `textContent`:**
- `innerText`: respects CSS layout, adds `\n` between block elements — essential for parsing structured cards
- `textContent`: concatenates all text without spacing — child elements merge (e.g., `"Section 235Row 7"` instead of readable values)

```typescript
handler: async (c, browser) => {
  const page = browser.getPage();
  if (!page) return c.json({ error: 'Browser page not available' }, 503);

  await browser.navigate(`https://www.example.com/search?q=${encodeURIComponent(q)}`);
  await new Promise(r => setTimeout(r, 5000));  // wait for SSR hydration

  const events = await page.evaluate((): Array<Record<string, unknown>> => {
    return Array.from(document.querySelectorAll('a[href*="/event/"]')).map(a => {
      const el = a as HTMLAnchorElement;
      const text = (el as HTMLElement).innerText?.replace(/\s+/g, ' ').trim() ?? '';  // ← innerText, not textContent
      return { url: el.href, name: text.slice(0, 120) };
    });
  });

  return c.json({ events, total: events.length });
},
```

For listing cards with section/row data — split by newline (innerText adds `\n` between blocks):

```typescript
const lines = (el as HTMLElement).innerText.split('\n').map(l => l.trim()).filter(Boolean);
const section = lines.find(l => /^Section\s+\S+$/.test(l))?.replace('Section ', '') ?? null;
const row = lines.find(l => /^Row\s+\S+$/.test(l))?.replace('Row ', '') ?? null;
const qtyMatch = lines.find(l => /^(\d+)\s+tickets?(?:\s|$)/i.test(l))?.match(/^(\d+)/);
const quantity = qtyMatch ? parseInt(qtyMatch[1]) : null;
```

### Type B2: Traffic capture for CORS-blocked APIs

Some APIs fire automatically when a page loads (the page's own JS calls them), but can't be called directly due to CORS. Solution: navigate the browser to the page and read what it captured.

This is the pattern for Ticketmaster's ISMDS API (`services.ticketmaster.com`):

```typescript
handler: async (c, browser) => {
  // Clear buffer, navigate to event page — page JS fires the API calls automatically
  await fetch('http://localhost:3001/browser/traffic', { method: 'DELETE' });
  await browser.navigate(eventPageUrl);
  await new Promise(r => setTimeout(r, 8000));  // wait for all XHR calls to fire

  const trafficRes = await fetch('http://localhost:3001/browser/traffic');
  const traffic = await trafficRes.json();

  const dataEntry = traffic.entries.find(e => e.url.includes('/desired-endpoint'));
  return c.json(dataEntry?.responseBody ?? { error: 'API call not captured' });
},
```

**When to use**: CDP traffic shows an API call but calling that URL directly returns CORS errors or 403.

### ⚠️ `browserFetch()` cross-origin warning

`browser.browserFetch(url)` runs `fetch()` inside the page via `page.evaluate()`. If the target URL is on a **different origin** than the current page, it navigates to that origin first — losing all session cookies.

- Safe: same-origin (e.g., fetching `api.stubhub.com` while on `stubhub.com`)
- Unsafe: fetching `services.ticketmaster.com` while on `www.ticketmaster.com` → loses TM cookies → empty response
- Fix: use the Type B2 traffic capture pattern for cross-origin APIs

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

## Reference: StubHub (complete working example)

StubHub is a pure SSR site — CDP shows 0 traffic, all data is in the DOM.

**Search** (`/secure/Search?q=...`): Navigate → `page.evaluate()` → find `a[href*="/performer/"]` → extract `performerId`, name from `innerText`

**Performer events** (`/performer-events`): Navigate to performer URL → `page.evaluate()` → find `a[href*="/event/"]` → extract `eventId`, slug from href

**Listings** (`/listings/:eventId`): Navigate to event page → `page.evaluate()` → find `[data-listing-id]` → read `data-price` attribute → parse `innerText` by newlines for section/row/quantity

See `domains/stubhub/src/routes.ts` for the complete implementation.

## Use Existing Domain

If `domains/<name>/` exists:
1. Ensure registered in `apps/api/src/register-domains.ts`
2. `pnpm run dev`
3. Connect browser: `ws://localhost:3001/browser/stream?profile=<name>&url=https://www.<domain>.com`
4. Call proxy routes: `curl http://localhost:3001/api/<name>/<path>`

## Reference Files

- **Templates**: See [templates/](templates/) for domain package scaffolding
- **Scaffold script**: See [scripts/scaffold-domain.sh](scripts/scaffold-domain.sh)
- **Example domain**: `domains/stubhub/` (SSR DOM extraction, complete working implementation)

## Gotchas

| Problem | Fix |
|---------|-----|
| Traffic shows 0 entries | CDP only captures XHR/Fetch JSON. If empty: site is SSR — extract from DOM via `page.evaluate()`. |
| Body text is empty `""` after navigate | Site is bot-protected. Check `bodyInnerHTML` for DataDome captcha iframe (`captcha-delivery.com`). |
| `textContent` gives concatenated text | Use `innerText` — respects CSS layout and adds `\n` between blocks. |
| `browserFetch` loses session cookies | Cross-origin navigate loses session. Use Type B2 traffic capture instead. |
| CORS error from `page.evaluate(fetch)` | API blocked for cross-origin calls. Use Type B2 traffic capture instead. |
| Route returns 404 after editing routes.ts | Server needs restart — kill port 3001 and rerun `pnpm dev`. |
| EventId regex misses alphanumeric IDs | Use `match(/\/event\/([A-Z0-9]+)$/i)` — not just `\d+` (TM uses hex IDs). |
| Performer name includes "Concert Tickets •" | Strip with `.replace(/\s*(Concert|Hockey|...)[\s\S]*/i, '')` — use `[\s\S]*` not `.*` across newlines. |
| Quantity regex fails for "2 tickets together" | Use `^(\d+)\s+tickets?(?:\s|$)` — not `$` alone as end anchor. |
| DataDome/Cloudflare blocks | Classify as Type D. Return `{ blocked: true }` from all routes, show as offline in UI. |
| API key visible in traffic URL | Embed it directly in `targetUrl` — it's the site's own key, fine to use. |
| Data visible on page but not in traffic | SSR — data is in the HTML response, not XHR calls. Extract from DOM. |
| API calls go to unexpected domains | CDP catches all domains. Check traffic for subdomains like `tn-apis.com`, `viagogo.net`. |
