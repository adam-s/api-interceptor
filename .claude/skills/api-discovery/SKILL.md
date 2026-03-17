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

## Phase 0: Check for a Public API

Before launching a browser, check if the target site has a **documented public REST API**. Many data providers (academic databases, government services, social platforms) offer free APIs that are faster, more reliable, and more structured than browser interception.

### How to check

1. Search for `<site-name> API documentation` or `<site-name> developer API`
2. Look for API subdomains in the site's docs: `api.example.com`, `developer.example.com`
3. Common public APIs: ArXiv (`export.arxiv.org/api`), Semantic Scholar (`api.semanticscholar.org/graph/v1`), PubMed/NCBI E-utilities (`eutils.ncbi.nlm.nih.gov`), GitHub, Reddit (OAuth), Wikipedia, OpenStreetMap, etc.

### If a public API exists — skip browser interception entirely

Set all routes to `browserRequired: false` and use direct `fetch()` in handlers:

```typescript
export const routes: DomainRoute[] = [
  {
    method: 'GET',
    path: '/search',
    browserRequired: false,  // no browser needed — public API
    description: 'Search via public REST API',
    handler: async (c) => {
      const q = c.req.query('q') ?? '';
      const res = await fetch(`https://api.example.com/search?q=${encodeURIComponent(q)}`, {
        headers: { 'User-Agent': 'api-interceptor/1.0 (research tool)' },
      });
      if (res.status === 429) return c.json({ error: 'Rate limited', retryAfter: 30 }, 429);
      if (!res.ok) return c.json({ error: `API error: ${res.status}` }, 502);
      const data = await res.json();
      return c.json(data);
    },
  },
];
```

**Key differences from browser-intercepted routes:**
- No interceptor patterns, no browser profiles, no CDP traffic capture needed
- The config's `interceptPatterns` and `baseUrls` arrays stay empty
- Rate limiting: public APIs enforce rate limits (e.g., Semantic Scholar: 100 req/5min unauthenticated). Always handle 429 responses and return them to the client.
- Some public APIs return **XML** (ArXiv Atom, PubMed NCBI XML), not JSON. Parse with regex (see "RSS / XML feed parsing" section below) — no DOMParser in Node.js.
- Authentication: some APIs offer optional API keys for higher rate limits. Embed as a header or query param. Never require browser auth for truly public APIs.

If the public API only covers part of the data (e.g., search yes, but detail pages need scraping), use a **hybrid approach**: `browserRequired: false` for public API routes, `browserRequired: true` (or omit) for browser-dependent routes.

If no public API exists, proceed to Phase 1.

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

### Type A: JSON API routes (Robinhood paradigm)

The data comes from API calls. Create proxy routes in the domain plugin. See `domains/robinhood/` for the complete reference — it's the gold standard for pure API discovery (auth headers, session management, typed client).

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

These routes proxy through `browserFetch()` — cookies and auth are automatic. If the API uses a `consumerKey` or similar param visible in CDP traffic, embed it directly in `targetUrl`.

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

### ⚠️ `browserFetch()` cross-origin — two cases

`browser.browserFetch(url)` runs `fetch()` inside the page via `page.evaluate()`. If the target URL is on a **different origin** than the current page, it navigates to that origin first by default.

**Case A: API subdomain with CORS from the main site (Yahoo Finance, many SPAs)**

The site's API lives on a subdomain (`query2.finance.yahoo.com`), and the main site (`finance.yahoo.com`) is allowed by CORS. Navigating to the API subdomain is wrong — you want to stay on the main site and let CORS carry the request.

```typescript
// ✗ WRONG — navigates to query2.finance.yahoo.com, loses session context, may 429
await browser.browserFetch('https://query2.finance.yahoo.com/v10/finance/quoteSummary/TSLA');

// ✓ CORRECT — stays on finance.yahoo.com, CORS carries cookies to query2
await browser.browserFetch('https://query2.finance.yahoo.com/v10/finance/quoteSummary/TSLA', {
  navigateTo: 'https://finance.yahoo.com',
});
```

How to know if this case applies: check the captured traffic. If the browser's own requests to the API subdomain include `origin: https://finance.yahoo.com` and the response has `access-control-allow-origin: https://finance.yahoo.com`, the site uses CORS-enabled subdomains.

**Case B: External API with no CORS from the main site (Ticketmaster ISMDS)**

No CORS headers — the API only responds if the browser is on the right origin. Use Type B2 traffic capture instead (navigate to the page, let the page's own JS fire the API call, read from traffic buffer).

- Safe: same-origin
- CORS subdomains: use `navigateTo: 'https://main-site.com'`
- No CORS: use Type B2 traffic capture

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

## SSR Extraction Patterns

When CDP traffic buffer is empty after navigation, the site uses **Server-Side Rendering** (SSR) — the initial page HTML contains all the data, not XHR calls. There are two strategies depending on how Airbnb-style sites deliver their data.

### Strategy 1: `extractFromPage()` — Navigate, wait, evaluate

`RemoteBrowserService.extractFromPage(url, fn, { waitMs })` is the canonical method for SSR data extraction:

```typescript
// In a Type B route handler:
handler: async (c, browser) => {
  const listings = await browser.extractFromPage<Array<{id: string; name: string; price: string}>>(
    `https://www.airbnb.com/s/Austin--TX/homes?currency=USD`,
    () => {
      // This function runs inside the browser page — has access to DOM, window, document
      const results: Array<{id: string; name: string; price: string}> = [];
      for (const link of document.querySelectorAll('a[href*="/rooms/"]')) {
        const anchor = link as HTMLAnchorElement;
        const id = anchor.href.match(/\/rooms\/(\d+)/)?.[1] ?? '';
        const name = link.querySelector('[data-testid="listing-card-title"]')?.textContent?.trim() ?? '';
        const price = link.querySelector('[data-testid="price-availability-row"]')?.textContent?.trim() ?? '';
        if (id && name) results.push({ id, name, price });
      }
      return results.slice(0, 20);
    },
    { waitMs: 4000 }, // wait extra for JS hydration after DOMContentLoaded
  );
  return c.json({ listings });
},
```

`waitMs` (default: 3000ms) is the hydration delay — how long after `DOMContentLoaded` to wait before extracting. React/Next.js apps need 2–5s for full hydration. Pure server-rendered pages need 0ms.

### Strategy 2: `window.__NEXT_DATA__` — SSR JSON blob

Next.js apps embed all SSR data as JSON in `window.__NEXT_DATA__`. For listing detail pages (Airbnb, Zillow), this contains the full object hierarchy:

```typescript
const data = await browser.extractFromPage<{name: string; lat: number}>(
  `https://www.airbnb.com/rooms/${id}`,
  () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nd = (window as any).__NEXT_DATA__;
    if (!nd) return { name: null, lat: null };
    // Navigate the props hierarchy — varies by site, requires inspection
    const listing = nd?.props?.pageProps?.listing ?? {};
    return { name: listing.name ?? null, lat: listing.lat ?? null };
  },
  { waitMs: 3000 },
);
```

Other common SSR data globals: `window.__REDUX_STATE__`, `window.__INITIAL_STATE__`, `window.__APP_STATE__`.

### Strategy 3: `evaluate()` — Extract from current page

`RemoteBrowserService.evaluate(fn)` runs a function on the current browser page (no navigation):

```typescript
// Useful when you've already navigated and just need to extract something
const title = await browser.evaluate(() => document.title);
const loginState = await browser.evaluate(() => !!(window as any).__USER_ID__);
```

Use this when navigation happens elsewhere (e.g., user navigated in the browser viewport) and you just need to read the current DOM.

### When each SSR strategy applies

| Site type | What to use | Signal |
|-----------|------------|--------|
| SPA (React, Next.js) search page | `extractFromPage()` + DOM query | Traffic buffer empty; cards render as `<a href="/rooms/...">` |
| Next.js detail page | `extractFromPage()` + `__NEXT_DATA__` | `<script id="__NEXT_DATA__" type="application/json">` in page HTML |
| Current page read | `evaluate()` | Already navigated; just need to read DOM |
| Has JSON XHR | `browserFetch()` | Traffic buffer shows 200 JSON responses |

### Airbnb/VRBO discovery notes

- **Airbnb search** is pure SSR — `StaysSearch` GraphQL only fires on client-side filter changes, not initial page load. DOM extraction via `a[href*="/rooms/"]` is the only reliable approach.
- **VRBO** uses obfuscated HMAC-signed URL paths for all analytics/data (`/2oWWs7BA09XCe/...`). No usable public JSON API was found. DOM extraction is the only option.
- **Airbnb API key** (`d306zoyjsyarp7ifhu67rjxn52tv0t20`): stable public key embedded in page JS. Captured from `X-Airbnb-API-Key` header in CDP traffic on listing detail page loads. Use in `browserFetch` header for GraphQL persisted queries.
- **Zillow** exposes a JSON API: `PUT https://www.zillow.com/async-create-search-page-state`. Call via `browserFetch(..., { navigateTo: 'https://www.zillow.com' })` so cookies are present.

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

## Anti-Bot and Rate Limiting Checklist

When an API returns 429 or 403, work through this checklist in order. Each symptom has a specific root cause and fix.

### Step 0: Check if the browser profile session is rate-limited (do this first)

**This is the most common cause of 429s and is frequently misdiagnosed as bot detection.**

A browser profile accumulates session cookies during development. If those cookies are associated with a session that has been rate-limited by the target site (from heavy testing), every request from that profile will 429 — even with perfect headers, correct UA, and valid crumbs.

**How to tell it's a session rate-limit (not bot detection):**
- The same endpoint returns 200 when you open a fresh browser tab or incognito window
- `age: 0` and `cache-control: no-store` on the 429 response (hitting origin, not CDN)
- You can reproduce 200 with a fresh Patchright profile using the same Chromium build

**Confirmed test (Yahoo Finance):**
```typescript
// rate-limited profile → 429
launchPersistentContext('data/browser-profiles/yahoo-finance', ...) // poisoned session

// fresh profile → 200
const freshDir = mkdtempSync(join(tmpdir(), 'fresh-'));
launchPersistentContext(freshDir, ...) // new unthrottled session
```

**Fix:**
```bash
# Delete the poisoned profile — browser will create a fresh session on next connect
rm -rf data/browser-profiles/<domain>
mkdir data/browser-profiles/<domain>
```

Then reconnect the browser. The site will give the new session a clean rate-limit quota.

**Key insight:** This is NOT a browser channel issue (Chrome vs Chromium) and NOT a TLS fingerprint issue. The browser engine doesn't matter — a fresh session on any engine gets 200. A poisoned session on any engine gets 429.

### Step 1: Compare which endpoints succeed vs fail

Run a session and record status codes across all endpoints (`curl /browser/traffic/summary`).

| Pattern | Root cause | Fix |
|---------|-----------|-----|
| **All endpoints 429** | IP is globally rate-limited (temporary) | Wait 1–24h; use a proxy IP; reduce request frequency |
| **Some endpoints 200 (CDN-cached), others 429** | Bot detection on real-time endpoints | Check `sec-ch-ua` header (Step 2) |
| **Consistent 429 on API endpoints, 200 on page loads** | Missing session token (crumb, CSRF) | Check for session tokens (Step 3) |

### Step 2: Inspect `sec-ch-ua` in captured request headers

```bash
curl -s http://localhost:3001/browser/traffic | python3 -c "
import json, sys
data = json.load(sys.stdin)
for e in data['entries'][:5]:
    h = e.get('requestHeaders', {})
    print('sec-ch-ua:', h.get('sec-ch-ua', 'not present'))
    print('user-agent:', h.get('user-agent', '')[:60])
    print()
"
```

**Red flags:**
- `"HeadlessChrome";v="..."` in `sec-ch-ua` → Chromium is running in headless mode. Sites like Yahoo Finance (Cloudflare Bot Management) allow CDN-cached endpoints through but block real-time data endpoints for headless browsers.
- `sec-ch-ua` version differs from `User-Agent` version (e.g., UA says Chrome/131, sec-ch-ua says Chromium/145) → version mismatch is a secondary detection signal.

**Fix:** The framework already overrides `sec-ch-ua` via `context.setExtraHTTPHeaders()` in `service.ts`. If you see HeadlessChrome in captured traffic after connecting, the fix is not yet in the running binary — restart the server.

To verify the fix is active, look for `"Google Chrome";v="134"` (no "Headless") in captured traffic headers.

### Step 3: Look for session tokens in page HTML or CDP responses

Some APIs require a short-lived token that is only obtainable by first loading the site. This token must be included in all API calls as a query parameter or header.

**How to detect:** Look at traffic where the main page loads vs the API calls. Specifically:

```bash
# Look at successful API calls — do they have any token params that failing calls lack?
curl -s http://localhost:3001/browser/traffic | python3 -c "
import json, sys
from urllib.parse import urlparse, parse_qs
data = json.load(sys.stdin)
for e in data['entries']:
    if e.get('status') == 200:
        p = parse_qs(urlparse(e['url']).query)
        tokens = {k: v for k, v in p.items() if k in ['crumb', 'csrf', 'token', 'key', 'auth']}
        if tokens:
            print(e['url'][:80], tokens)
"
```

**Common session token patterns:**

| Token | Site | How to get | Where to include |
|-------|------|------------|-----------------|
| `crumb` | Yahoo Finance | `GET /v1/test/getcrumb` after loading `finance.yahoo.com` | `&crumb=VALUE` query param in API calls |
| `csrfToken` | Many SPAs | Embedded in `<meta name="csrf-token">` or JS globals | `X-CSRF-Token` header |
| `_t` / `_s` | Various | Cookie value promoted to query param | `&_t=VALUE` |

**Yahoo Finance — confirmed working endpoints (discovered via traffic capture, March 2026):**

Yahoo Finance uses `query1.finance.yahoo.com` and `query2.finance.yahoo.com` as API backends.
The frontend is SvelteKit — initial data is SSR-embedded in `<script type="application/json" data-sveltekit-fetched>` tags.
Client-side interactions (chart range changes) trigger XHR to `query2.finance.yahoo.com`.

```typescript
// Chart + current price (confirmed 200 with fresh session):
// query2 for 1D, query1 for multi-day — use query2 for all, it works
const now = Math.floor(Date.now() / 1000);
const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${now - 28800}&period2=${now}&interval=1m&includePrePost=true&events=div%7Csplit%7Cearn&lang=en-US&region=US`;
const result = await browser.browserFetch(url, {
  navigateTo: 'https://finance.yahoo.com',  // stay on main site for CORS + session
  headers: { Referer: 'https://finance.yahoo.com/' }
});
// meta field contains: regularMarketPrice, fiftyTwoWeekHigh/Low, regularMarketVolume, etc.

// Crumb (embedded in page state as x-crumb header in XHR — extract from POST traffic):
// The crumb is embedded in page JS after SSR — visible in POST /v1/finance/visualization traffic
// For most endpoints the crumb is optional if the session cookie is valid
```

Cache the crumb in a module-level variable — it stays valid for the session. Refresh when you get 401 from the API.

### Step 4: Check if cookies from page load are reaching API calls

```bash
curl -s http://localhost:3001/browser/traffic | python3 -c "
import json, sys
data = json.load(sys.stdin)
cookie_keys = set()
for e in data['entries']:
    c = e.get('requestHeaders', {}).get('cookie', '')
    for pair in c.split(';'):
        if '=' in pair:
            cookie_keys.add(pair.split('=')[0].strip())
print('Cookies in requests:', sorted(cookie_keys))
"
```

If a required auth cookie is missing, the browser may not be on the site's origin. Navigate to the main site first (`browser.navigate('https://site.com')`), wait for the page to load, then make API calls.

### Step 5: Check if `navigateTo` is needed for cross-origin subdomains

When the API is on a subdomain that the main site calls via CORS:

```bash
# Check response headers for CORS declarations
curl -s http://localhost:3001/browser/traffic | python3 -c "
import json, sys
data = json.load(sys.stdin)
for e in data['entries']:
    h = e.get('responseHeaders', {})
    if h.get('access-control-allow-origin'):
        print(e['url'][:80])
        print('  ACAO:', h['access-control-allow-origin'])
        print('  ACAC:', h.get('access-control-allow-credentials', 'not set'))
        print()
"
```

If you see `access-control-allow-origin: https://main-site.com` and `access-control-allow-credentials: true` on a subdomain API response, use `navigateTo: 'https://main-site.com'` in `browserFetch`.

## Gotchas

### Single browser singleton — sequential calls only

The API server's browser is a **module-level singleton** (`let activeBrowser: RemoteBrowserService | null = null`). Only ONE browser is active at a time. When a new domain profile connects via WebSocket, it **destroys the existing browser**.

Consequences:
1. **Only one domain can be "active" at a time.** The most recently connected profile wins.
2. **Concurrent API calls race on the same page.** If two route handlers call `browser.navigate()` simultaneously, one will navigate away mid-extraction.
3. **Always connect ONE browser** for screenshot/verification scripts. Never connect two profiles — the second destroys the first.
4. **Traffic capture is profile-scoped.** Each profile's interceptor only captures traffic to its own configured domains. When `profile=stubhub` is connected, calls to `services.ticketmaster.com` go through but are **never added to the traffic buffer** — the TM interceptor patterns aren't active.

For multi-domain dashboards: the UI layer must call each domain's API **sequentially**, not with `Promise.all` or `Promise.allSettled`.

**Cross-domain traffic capture:** To capture traffic from domains beyond the active profile, connect with the `capture` query parameter listing additional domains:

```
ws://localhost:3001/browser/stream?profile=stubhub&capture=services.ticketmaster.com,www.ticketmaster.com&url=https://www.stubhub.com
```

This lets a StubHub session also intercept Ticketmaster API calls when the browser navigates there. Required for any multi-domain comparison where different sites use different traffic capture patterns (B2 vs SSR).

**Type B2 discovery requires the proxy browser — never an external Patchright script.** The traffic buffer (`GET /browser/traffic`) only captures requests made by the proxy server's browser. A standalone Patchright script has its own browser with no traffic buffer — it will always return 0 CDP entries for Type B2 patterns. Discovery for ISMDS-style APIs must happen through a route handler that calls `browser.navigate()`, not through an external script.

| Problem | Fix |
|---------|-----|
| Traffic shows 0 entries | CDP only captures XHR/Fetch JSON. If empty: site is SSR — use `browser.extractFromPage(url, fn)` to navigate and extract DOM data. See "SSR Extraction Patterns" above. |
| Body text is empty `""` after navigate | Site is bot-protected. Check `bodyInnerHTML` for DataDome captcha iframe (`captcha-delivery.com`). |
| `textContent` gives concatenated text | Use `innerText` — respects CSS layout and adds `\n` between blocks. |
| `browserFetch` loses session cookies | Cross-origin navigate loses session. If the API subdomain has CORS from the main site, use `navigateTo: 'https://main-site.com'`. If no CORS, use Type B2 traffic capture. |
| CORS error from `page.evaluate(fetch)` | API blocked for cross-origin calls. Use Type B2 traffic capture instead. |
| `sec-ch-ua: "HeadlessChrome"` in captured headers | Browser is running in headless mode. The framework already overrides this in `service.ts`. If you still see HeadlessChrome, restart the server so the fix is loaded. |
| All quote/price endpoints 429, screener/list endpoints 200 | Real-time endpoints are blocked (bot detection on origin server); cached endpoints pass (CDN-served, no bot check). Root cause: sec-ch-ua HeadlessChrome or IP rate limit. Check `age` header — `age > 0` means CDN hit, `age: 0` means origin hit. |
| Persistent 429 on all real-time endpoints, `curl` from same machine returns 200 | Poisoned browser profile session — the site has flagged the stored cookies/localStorage from heavy testing. TLS fingerprint and IP are fine; the session state is what's blocked. **Fix: wipe and recreate the profile directory** (see "Clearing a poisoned browser profile" below). |
| API requires `crumb` or similar session token | Some sites (Yahoo Finance, CSRF-protected SPAs) require a short-lived token obtained by first loading the site. Look for `?crumb=` or `X-CSRF-Token` in successful browser requests. Get the token via `browserFetch` from the main site context, cache it, include in all API calls. |
| Route returns 404 after editing routes.ts | Server needs restart — kill port 3001 and rerun `pnpm dev`. |
| EventId regex misses alphanumeric IDs | Use `match(/\/event\/([A-Z0-9]+)$/i)` — not just `\d+` (TM uses hex IDs). |
| Performer name includes "Concert Tickets •" | Strip with `.replace(/\s*(Concert|Hockey|...)[\s\S]*/i, '')` — use `[\s\S]*` not `.*` across newlines. |
| Quantity regex fails for "2 tickets together" | Use `^(\d+)\s+tickets?(?:\s|$)` — not `$` alone as end anchor. |
| DataDome/Cloudflare blocks | Classify as Type D. Return `{ blocked: true }` from all routes, show as offline in UI. |
| API key visible in traffic URL | Embed it directly in `targetUrl` — it's the site's own key, fine to use. |
| Data visible on page but not in traffic | SSR — data is in the HTML response, not XHR calls. Extract from DOM. |
| API calls go to unexpected domains | CDP catches all domains. Check traffic for subdomains like `api.example-cdn.com`, `viagogo.net`. |
| Event URLs point to wrong regional domain | TM/similar sites geolock to `.es`, `.de`, `.co.uk` based on browser IP. Check event URL domain in results — if regional, use that domain in routes. |
| Performer/category pages include unrelated recommendations | Pages include "Recommended" / "You may also like" sections with events from other artists. Extracting all `/event/` links captures these. Fix: filter extracted URLs to only those containing the performer name slug. Derive slug from `performerUrl.split('/').find(s => s.endsWith('-tickets'))?.replace(/-tickets$/, '')`. |
| Calling `/browser/navigate` or `/browser/evaluate` as REST endpoints | These are server-side methods on `BrowserService`, called inside `handler` functions in `routes.ts`. No HTTP endpoints exist for them — they return 404. Navigation and DOM evaluation happen only inside route handlers. |
| `data-*` attribute price ≠ displayed price | Some sites (e.g. StubHub) store prices in `data-price` as a USD-internal value. If the browser is geolocated to a non-USD country the displayed text shows local currency (e.g. S/.820) while `data-price` holds the raw number (e.g. `82` → renders as `$0.82`). Always read prices from the **displayed text**, not `data-*` attributes, unless you've verified the attribute matches the display in the target locale. |
| Server returns stale routes after editing `routes.ts` in a workspace package | `tsx --watch` does not always detect changes in workspace packages (`@interceptor/browser`, etc.). Kill the API server (`kill $(lsof -ti:3001)`) and restart `pnpm dev`. |
| Substring artist filter passes tribute bands | `name.includes(query)` is too broad — "Bad Bunny Tribute Experience" contains "Bad Bunny". Filter must check that the artist name is the **subject** of the event, not just a substring. Require: `norm(eventName).startsWith(norm(artist))` OR use a stricter regex like `new RegExp('\\b' + escapedArtist + '\\b', 'i')`. Also skip names containing words like "tribute", "experience", "symphony", "comedy", "theater". |
| Direct `fetch()` returns 429 but browser and `curl` return 200 | The site uses **TLS fingerprinting** (also called JA3/JA4 fingerprinting). Node.js has a distinct TLS fingerprint from Chrome. Sites like Yahoo Finance and others with anti-bot protection will 429 Node.js `fetch()` while accepting requests from real browsers. **Fix**: use `browserFetch(url, { headers })` inside the route handler instead of `fetch()` — the proxy browser's TLS fingerprint matches a real Chrome browser. Alternatively, mark the route `browserRequired: true` and navigate to the URL to extract data from the DOM. |
| `browserRequired: false` route still gets 503 | Check the `createDomainProxy` implementation in `packages/browser/src/handler/api-proxy.ts`. The browser-not-connected check must be `if (!browser && route.browserRequired !== false)` — not `if (!browser)`. If the check is unconditional, all routes will 503 when no browser is connected, even browserless ones. |
| Public API returns `total: 0` with 200 status | Some APIs (Semantic Scholar) return empty results under load — a soft rate limit. This looks like "no results" but is actually transient. Retry after a few seconds. Check if `total` is 0 but 200 status — differentiate from a genuine empty result (which would also have `total: 0` but for a nonsense query). |
| Public API returns XML, not JSON | ArXiv (Atom), PubMed (NCBI XML), and some government APIs return XML. Parse with regex: `/<entry>([\s\S]*?)<\/entry>/g` for Atom, `/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g` for PubMed. See "RSS / XML feed parsing" section for the general pattern. |

### Clearing a poisoned browser profile

When a site returns 429 for every request from the proxy browser but `curl` from the same machine returns 200, the stored browser session (cookies, localStorage, IndexedDB) has been flagged by the site's bot detection. This happens after heavy testing that hammers a single profile. The fix is to wipe and recreate the profile directory — not to change IP or TLS settings:

```bash
# Replace <domain> with the profile name (e.g. yahoo-finance, robinhood)
rm -rf data/browser-profiles/<domain>
mkdir data/browser-profiles/<domain>
```

**Always ask the user before wiping.** Profile directories contain stored session tokens and auth state that may be hard to re-establish (2FA, manual login flows, etc.). Present the diagnosis and ask for confirmation before running the `rm -rf`. Only proceed after explicit approval.

Then reconnect the browser via the dashboard (`/browser?profile=<domain>&...`) and re-authenticate if needed. The fresh profile has no flagged session state and will receive 200 responses again.

**Diagnosis steps before wiping:**

1. `curl -H "User-Agent: Mozilla/5.0 ..." https://api.example.com/endpoint` from the same machine — if this returns 200, the IP is fine and the profile session is the culprit.
2. Check the proxy browser's response headers: `curl -s http://localhost:3001/browser/traffic | jq '.entries[-1].responseHeaders'` — look for `x-ratelimit-*`, `cf-ray`, `x-cache`, or a `Set-Cookie` that resets the session.
3. If `age: 0` in response headers, it's an origin hit (not CDN-cached). 429 on origin hit with valid IP = session-level block.

**When NOT to wipe:**
- If both `curl` and the browser return 429 → IP-level block. Changing the profile won't help. Wait for the rate limit window to expire (typically 15–60 min).
- If only certain endpoints 429 → CDN/origin split (see Gotchas table row above). Wipe won't help here either.

**After wiping, the poller will restart from scratch** — no stored articles, no cached auth tokens. If the domain requires login, you must re-authenticate before the poller's first cycle.

---

### Browserless Routes with Background Polling

Some domains don't need the browser for data fetching (e.g., news via RSS, public REST APIs). These routes use `browserRequired: false` and do their own `fetch()` calls. When the data is expensive to fetch (rate-limited, slow), use a **background poller** pattern:

1. **Background poller** (`apps/api/src/news-poller.ts`): runs every N seconds, fetches from the external source, stores results in an in-memory article store (`Map<symbol, Article[]>`), exports a getter function
2. **Route handler** reads from the in-memory store (no external request), falls back to a direct fetch with TTL cache only on cold start
3. **Factory pattern** for injection: `createRoutes(getBridgeFn?, getArticlesFn?)` — the route factory accepts the getter as a closure; avoids cross-package imports

This architecture prevents rate-limit compounding: without it, every `curl /api/yahoo-finance/news?symbols=TSLA,AAPL` makes 2 fresh Yahoo requests on top of the poller's 5-symbol requests every 60s — blows the IP quota within minutes.

```typescript
// In routes.ts — browserless route reads from poller store
export function createRoutes(
  getBridgeFn?: () => PythonBridge | null,
  getArticlesFn?: (symbols: string[]) => { articles: Article[]; updatedAt: string | null }
): DomainRoute[] {
  return [{
    method: 'GET',
    path: '/news',
    browserRequired: false,  // no Patchright needed
    handler: async (c, _browser) => {
      const symbols = ...;
      // Prefer in-memory store (no external requests)
      if (getArticlesFn) {
        const result = getArticlesFn(symbols);
        if (result.articles.length > 0) return c.json(result);
      }
      // Cold-start fallback: fetch directly with 5-min TTL cache
      ...
    },
  }];
}

// In apps/api/src/register-domains.ts
import { getNewsArticles } from './news-poller';
registerDomain({ ...plugin, routes: createRoutes(getBridge, getNewsArticles) });
```

#### TTL cache Map for pollers

When a poller fetches from a rate-limited external source, cache per-key with an expiry:

```typescript
const cache = new Map<string, { data: RssResult; expiresAt: number }>();
const TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchWithCache(key: string): Promise<RssResult> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.data;
  const data = await fetchFromSource(key);
  cache.set(key, { data, expiresAt: Date.now() + TTL_MS });
  return data;
}
```

Use this in both the poller loop and the cold-start fallback path in the route handler. Never skip the cache in the route handler — the route and the poller run on the same Node.js process and share the same Map.

#### Wiring poller dispatch via `broadcastMessage`

Pollers need to push WS events to connected dashboard clients. Inject `broadcastMessage` at startup rather than importing `state.ts` directly from the domain package (the domain package must not depend on the API app):

```typescript
// In the domain package (e.g. domains/yahoo-finance/src/news-poller.ts):
type BroadcastFn = (payload: unknown) => void;
let broadcastFn: BroadcastFn | null = null;
export function setBroadcast(fn: BroadcastFn): void { broadcastFn = fn; }

// Inside the poller after each cycle:
broadcastFn?.({ type: 'news:update', data: { articles, total, updatedAt } });

// In apps/api/src/index.ts (before server.listen()):
import { broadcastMessage } from './state';
import { setBroadcast, startNewsPoller } from '@interceptor/domain-yahoo-finance';
setBroadcast(broadcastMessage);
startNewsPoller(getActiveBrowser);
```

The `setBroadcast` call must come **before** `startNewsPoller` — the first poll fires immediately on start.

`broadcastMessage` in `state.ts` is a generic utility that sends any JSON payload to all connected WS clients. It does not go through the state machine — the dedup check (`lastJson === json`) is bypassed. Any domain poller can use it.

#### RSS / XML feed parsing without DOMParser

Node.js has no `DOMParser`. Parse XML with regex when the feed structure is known and stable (RSS 2.0 is standardized):

```typescript
function parseRssXml(xml: string): Array<{ title: string; link: string; description: string; pubDate: string }> {
  const items: Array<{ title: string; link: string; description: string; pubDate: string }> = [];
  for (const [, block] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const get = (tag: string) => block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`))?.[1]
      ?? block.match(new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`))?.[1]
      ?? '';
    items.push({
      title: get('title').trim(),
      link: get('link').trim(),
      description: get('description').trim(),
      pubDate: get('pubDate').trim(),
    });
  }
  return items;
}
```

The `get` helper handles both `<tag><![CDATA[...]]></tag>` (common for titles/descriptions) and plain `<tag>text</tag>` forms. Use this instead of importing an XML parser — it adds no dependency and handles the 90% case for RSS 2.0.

#### Unix timestamps in time-series API parameters

Many financial/data APIs encode time ranges as unix epoch seconds, not ISO 8601. When you see parameters like `period1`, `period2`, `startTime`, `endTime`, `from`, `to` in captured traffic and they look like large integers (10 digits, ~1700000000), they are unix timestamps in seconds:

```typescript
// Convert JS Date to unix timestamp (seconds)
const now = Math.floor(Date.now() / 1000);
const oneDayAgo = now - 86400;

// Build URL with timestamp range
const url = `https://api.example.com/v8/data/${symbol}?period1=${oneDayAgo}&period2=${now}&interval=5m`;
```

Check captured traffic for the exact parameter names — they vary by API. Common interval strings: `1m`, `5m`, `15m`, `1h`, `1d`. The response typically has a `timestamp` array (parallel to OHLC arrays) also in unix seconds:

```typescript
// Parse response into [{time, open, high, low, close, volume}]
const { timestamp, indicators: { quote: [q] } } = meta.chart.result[0];
const points = timestamp.map((t: number, i: number) => ({
  time: new Date(t * 1000).toISOString(),
  open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i],
}));
```

This is NOT Yahoo Finance-specific — Bloomberg, Polygon, Alpha Vantage, and many others follow the same convention.
