---
name: api-discovery
description: Discover any website's API and create domain plugins with proxy routes. Use when the user wants to create an API for a website, reverse-engineer a web service, add a new domain, capture browser traffic, build typed API clients, or integrate with a third-party site. Also use when the user mentions a website name and wants to interact with it programmatically.
---

# API Discovery

Reverse-engineer how a website delivers its data, then create a domain plugin that exposes it as a typed API. Works with JSON APIs, SSR pages, and hybrid sites.

**Core principle:** Navigate as a real user. Never guess a URL. Let every endpoint reveal itself through real browser actions.

**Development principle:** Use debug-logs and visual-dev skills at every step — not just at the end. Debug logs turn guessing into knowing. Screenshots turn assumptions into proof. A route that returns data you haven't visually verified is a route that might be returning garbage.

## Quick Check: Does the Domain Plugin Already Exist?

```bash
ls domains/ | grep <domain-name>
```

If it exists, read `domains/<name>/src/routes.ts` and skip to "Use Existing Domain" at the bottom.

## Phase 0: Check for a Public API

Before launching a browser, check if the target site has a documented public REST API.

### How to check

1. **WebSearch** for `"<site-name> API documentation"` — mandatory, never guess endpoints
2. Look for `api.example.com` / `developer.example.com` subdomains
3. Some sites expose a `.json` suffix on regular URLs for read-only JSON (no key needed) — fastest path to `browserRequired: false` routes
4. When the primary source requires paid auth or CAPTCHA, look for **free open-source mirrors**

### If the API requires a key — use minuteinbox for dev

1. `GET /api/minuteinbox/inbox` → temp email
2. Register on the target service's signup page
3. `GET /api/minuteinbox/inbox` → read verification email, extract confirmation link
4. Navigate to link → API key issued. Dev only — production uses `.env` credentials.

### Public API route pattern

Set `browserRequired: false`, use direct `fetch()`. Key differences from browser routes: no interceptor patterns, empty `interceptPatterns`/`baseUrls` arrays, handle 429 responses. Some APIs return XML — parse with regex (see RSS section below). Government APIs often require a descriptive `User-Agent` with contact info or they 403.

**After writing each route, verify immediately:** `curl` the route, check the response shape, add `DEBUG('route-name', () => ({ status, itemCount }))` inside the handler to confirm it's being hit and returning real data. Don't write the next route until the current one is proven.

```typescript
{ method: 'GET', path: '/search', browserRequired: false, handler: async (c) => {
  const res = await fetch(`https://api.example.com/search?q=${encodeURIComponent(c.req.query('q') ?? '')}`,
    { headers: { 'User-Agent': 'api-interceptor/1.0 (research tool)' } });
  if (res.status === 429) return c.json({ error: 'Rate limited' }, 429);
  if (!res.ok) return c.json({ error: `API error: ${res.status}` }, 502);
  return c.json(await res.json());
}}
```

Hybrid approach: `browserRequired: false` for public API routes, `browserRequired: true` for browser-dependent routes.

### Graceful API key degradation

Try API key first, fall back to browser SSR extraction. Route works with or without the key.

### Python bridge for NLP / analytics

Add methods to `services/python/worker.py`, register in `METHODS` dict. Lazy-import heavy libraries so worker degrades gracefully. Call from TS via `bridge.call('method_name', params)`.

### CLI tool bridge — when sites aggressively block automation

Use battle-tested CLI tools via Python bridge: `yt-dlp` (video), `gallery-dl` (images), `spotdl` (audio), `aria2` (downloads).

| Gotcha | Detail |
|--------|--------|
| Path resolution | `resolve(import.meta.dirname, '../../../services/python/worker.py')` (3 levels: src → name → domains → root) |
| Python 3.9 compat | `from __future__ import annotations` at top of worker.py |
| Bridge config | `import { PythonBridge } from '@interceptor/shared'`; `timeoutMs: 60_000` for downloads |
| Progress tracking | `threading.Thread(daemon=True)` + module-level job dict |
| pythonPath | If system python3 not on PATH: `pythonPath: '/usr/bin/python3'` |
| Registration | Add to `METHODS` dict; `browserRequired: false` on all routes |

If no public API exists and no CLI tool covers the site, proceed to Phase 1.

## Phase 1: Observe

1. Start server: `pnpm run dev`
2. Connect browser: `ws://localhost:3001/browser/stream?profile=default&url=<target-url>` (or dashboard at `http://localhost:3000/browser?profile=default&url=<target-url>`)
3. **Screenshot (visual-dev skill):** Take a screenshot to see what data is visible — prices, names, dates, listings. This is your ground truth. Every extraction step must produce data that matches what you see here.
4. Check traffic: `curl -s http://localhost:3001/browser/traffic | jq '[.entries[] | {method, url: .url[:120], status}]'`
5. **If traffic is empty or confusing, add DEBUG() calls** to `packages/browser/src/handler/index.ts` or `service.ts` to trace what CDP is capturing. Don't guess why traffic is missing — observe it.

**Use CDP for discovery, not `page.route()`.** CDP `Network.enable` catches ALL network requests; `page.route()` only intercepts requests matching its glob patterns and misses requests to unexpected domains (tracking pixels, subdomain APIs, third-party analytics). Narrow to `page.route()` later for proxy interception once you know the endpoints.

## Phase 2: Classify the Data Source

Compare what you SEE on the page vs what CDP CAPTURED.

| Type | Signal | Approach |
|------|--------|----------|
| **A: JSON API** | Traffic contains the visible data | Proxy routes for XHR/Fetch endpoints |
| **B: SSR** | Traffic empty; data is in initial HTML | Extract from DOM via `page.evaluate()` |
| **C: Hybrid** | Page 1 SSR; pagination triggers API calls | SSR for page 1, `browserFetch` for page 2+ |
| **D: Bot-Protected** | `captcha-delivery.com` or `datadome` in body HTML | Return structured 403 (see below) |

**Type D CAPTCHA gate protocol:** Return `{ blocked: true, captchaRequired: true, browserUrl: '/browser?profile=<domain>&capture=<domain>', message: 'Pass the challenge at /browser to unlock this source' }` with HTTP 403. Dashboard detects `captchaRequired` and shows an alert with a link to `/browser` where the user can pass the challenge manually. Profile cookies persist after the challenge — subsequent requests from that profile succeed.

**Confirm SSR:** Search the initial HTML for data patterns — if prices/items are in the HTML, it's SSR.

**Discover pagination APIs:** Click "Load more" or "Next page" and watch for new API calls in the traffic buffer.

## Phase 3: Extract

### Type A: JSON API routes

Route with `targetUrl` — proxied through `browserFetch()` automatically. Cookies and auth are inherited. Embed any `consumerKey` visible in CDP traffic directly in the URL.

```typescript
{ method: 'GET', path: '/search', targetUrl: 'https://api.example.com/v1/search', description: 'Search' }
```

### Type B: SSR extraction via `page.evaluate()`

**Always use `innerText` not `textContent`** — `innerText` respects CSS layout and adds `\n` between block elements; `textContent` concatenates everything into unreadable text.

```typescript
handler: async (c, browser) => {
  await browser.navigate(`https://www.example.com/search?q=${encodeURIComponent(q)}`);
  await new Promise(r => setTimeout(r, 5000));  // hydration wait
  const items = await browser.getPage()!.evaluate(() =>
    Array.from(document.querySelectorAll('a[href*="/item/"]')).map(a => ({
      url: (a as HTMLAnchorElement).href,
      name: (a as HTMLElement).innerText?.replace(/\s+/g, ' ').trim().slice(0, 120) ?? '',
    }))
  );
  return c.json({ items, total: items.length });
}
```

For structured cards, split `innerText` by `\n` and regex-match labeled values.

### Type B2: Traffic capture for CORS-blocked APIs

Clear traffic buffer → navigate (page JS fires API calls) → read from traffic buffer. Use when direct fetch gets CORS errors or 403.

```typescript
await fetch('http://localhost:3001/browser/traffic', { method: 'DELETE' });
await browser.navigate(pageUrl);
await new Promise(r => setTimeout(r, 8000));
const traffic = await (await fetch('http://localhost:3001/browser/traffic')).json();
const data = traffic.entries.find(e => e.url.includes('/desired-endpoint'));
```

### `browserFetch()` cross-origin

`browserFetch(url)` navigates to the target origin by default. For CORS-enabled API subdomains, stay on the main site:

```typescript
// WRONG — navigates to API subdomain, loses session
await browser.browserFetch('https://api.example.com/data');
// CORRECT — stays on main site, CORS carries cookies
await browser.browserFetch('https://api.example.com/data', { navigateTo: 'https://www.example.com' });
```

**How to detect:** captured traffic shows `origin: https://www.example.com` and response has `access-control-allow-origin: https://www.example.com`.

| Origin type | Approach |
|-------------|----------|
| Same-origin | `browserFetch(url)` directly |
| CORS subdomain | `browserFetch(url, { navigateTo: 'https://main-site.com' })` |
| No CORS | Type B2 traffic capture |
| SPA-internal (same origin) | Don't navigate — use `evaluate(fetch(...))` on the current page |

**SPA context gotcha:** Some same-origin endpoints only work when called from within the SPA's page context (they depend on cookies, CSRF tokens, or referrer headers set by the SPA's JS). If `browserFetch` navigates to the bare origin first, it destroys the SPA context and these endpoints fail. Fix: check if the browser is already on the correct origin and skip navigation, or use `evaluate(() => fetch('/api/...'))` directly.

### Type C: Hybrid (SSR + pagination API)

Page 1: extract from SSR HTML. Page 2+: `browserFetch()` the pagination API discovered by clicking "Show more".

## Phase 4: Verify — EVERY route, EVERY time

**Do not move to the next route or Phase 5 until the current route is proven.**

1. `curl` the route — does it return real data?
2. Compare against your Phase 1 screenshot — does the data match what's visible on the page?
3. If the response is empty, wrong, or unexpected: **use debug-logs skill immediately.** Add `DEBUG()` calls inside the route handler to trace: was the handler hit? What did `browserFetch`/`fetch`/`evaluate` return? What did the transformation produce? Read the log, fix, re-curl. Don't guess — observe.
4. **Take a screenshot (visual-dev skill)** of the browser page after the route runs to confirm the browser state is what you expect.

```bash
curl -s http://localhost:3001/api/<domain>/<path> | jq '.items | length'
tail -20 /tmp/interceptor-debug/debug-$(date +%Y-%m-%d).log
```

## Phase 5: Create Domain Plugin

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/scaffold-domain.sh <name> <root-domain>
```

1. Populate `domains/<name>/src/routes.ts` with discovered routes
2. Register in `apps/api/src/register-domains.ts` and `apps/api/package.json`
3. `pnpm install` then **test every route end-to-end with curl + debug logs before building any UI.** The API layer must be rock-solid before the dashboard layer begins. If a route returns wrong data, the dashboard will display wrong data and you'll waste time debugging the wrong layer.

## SSR Extraction Patterns

### `extractFromPage(url, fn, { waitMs })` — navigate, wait, evaluate

The canonical SSR method. `waitMs` (default 3000ms) is the hydration delay — React/Next.js needs 2-5s, pure server-rendered needs 0ms.

```typescript
const listings = await browser.extractFromPage<Array<{id: string; name: string}>>(
  `https://www.example.com/search`,
  () => Array.from(document.querySelectorAll('a[href*="/item/"]')).map(a => ({
    id: (a as HTMLAnchorElement).href.match(/\/item\/(\w+)/)?.[1] ?? '',
    name: a.querySelector('[data-testid="title"]')?.textContent?.trim() ?? '',
  })),
  { waitMs: 4000 },
);
```

### `__NEXT_DATA__` — Next.js SSR JSON blob

Next.js apps embed SSR data in `window.__NEXT_DATA__`. Access via `extractFromPage()` and navigate the `props.pageProps` hierarchy. Other globals: `__REDUX_STATE__`, `__INITIAL_STATE__`, `__APP_STATE__`.

### `evaluate()` — extract from current page (no navigation)

Runs function on the already-navigated page. Use when navigation happened elsewhere.

### When each applies

| Signal | Strategy |
|--------|----------|
| Traffic empty; cards as `<a>` links | `extractFromPage()` + DOM query |
| `<script id="__NEXT_DATA__">` in HTML | `extractFromPage()` + `__NEXT_DATA__` |
| Already navigated | `evaluate()` |
| Traffic shows 200 JSON responses | `browserFetch()` (not SSR) |

## Use Existing Domain

If `domains/<name>/` exists: ensure registered in `apps/api/src/register-domains.ts`, run `pnpm run dev`, connect browser via `ws://localhost:3001/browser/stream?profile=<name>&url=https://www.<domain>.com`, call routes via `curl http://localhost:3001/api/<name>/<path>`.

**Reference files:** [templates/](templates/) for scaffolding, [scripts/scaffold-domain.sh](scripts/scaffold-domain.sh) for the scaffold command.

## Anti-Bot and Rate Limiting Checklist

When an API returns 429 or 403, work through in order:

### Step 0: Poisoned browser profile (most common cause)

**Symptom:** All endpoints 429, but same URL returns 200 in incognito. `age: 0` on 429 response (hitting origin, not CDN).

**Fix:** `rm -rf data/browser-profiles/<domain> && mkdir data/browser-profiles/<domain>` — reconnect for a fresh session. This is NOT a browser engine or TLS issue — a fresh session on any engine gets 200. **Always ask the user before wiping** — profiles may contain hard-to-reproduce auth state.

**When NOT to wipe:** Both curl and browser return 429 (IP-level block — wait 15-60 min), or only certain endpoints 429 (CDN/origin split).

### Step 1: Compare which endpoints succeed vs fail

| Pattern | Root cause | Fix |
|---------|-----------|-----|
| All 429 | IP globally rate-limited | Wait 1-24h; proxy IP; reduce frequency |
| Some 200 (CDN), others 429 | Bot detection on real-time endpoints | Check `sec-ch-ua` (Step 2) |
| API 429, page loads 200 | Missing session token | Check for crumb/CSRF (Step 3) |

### Step 2: Inspect `sec-ch-ua`

If `"HeadlessChrome"` appears in captured `sec-ch-ua` headers, the browser is detected as headless. Framework overrides this in `service.ts` — restart server to pick up the fix.

### Step 3: Session tokens (crumb, CSRF)

Some APIs require a short-lived token from the page load. Check successful traffic for `crumb`, `csrf`, `token` params. Cache in a module-level variable — refresh on 401.

| Token | Source | Usage |
|-------|--------|-------|
| `crumb` | Dedicated endpoint or page JS | `&crumb=VALUE` query param |
| `csrfToken` | `<meta name="csrf-token">` or JS globals | `X-CSRF-Token` header |

### Step 4: Missing cookies

If auth cookies aren't reaching API calls, the browser may not be on the site's origin. Navigate to main site first, wait for load, then make API calls.

### Step 5: Cross-origin CORS

If traffic shows `access-control-allow-origin` + `access-control-allow-credentials: true` on subdomain responses, use `navigateTo` in `browserFetch`.

## Gotchas

### Single browser singleton — sequential calls only

One browser instance, module-level singleton. New WebSocket profile connection destroys the existing browser. Consequences:
- Only one domain active at a time; most recent profile wins
- Concurrent `navigate()` calls race — always call domain APIs **sequentially**
- Traffic capture is profile-scoped; use `&capture=api.otherdomain.com` query param for cross-domain capture
- Type B2 discovery requires the proxy browser — standalone Patchright scripts have no traffic buffer

### Common problems and fixes

| Problem | Fix |
|---------|-----|
| Traffic shows 0 entries | SSR — use `extractFromPage(url, fn)` |
| Body text empty after navigate | Bot-protected — check for captcha iframe |
| `textContent` concatenates everything | Use `innerText` instead |
| `browserFetch` loses session cookies | Use `navigateTo` for CORS subdomains, or Type B2 if no CORS |
| CORS error from `page.evaluate(fetch)` | Use Type B2 traffic capture |
| Real-time 429, cached 200 | CDN passes cached (no bot check); origin blocks headless. `age > 0` = CDN |
| Persistent 429, curl returns 200 | Poisoned profile — wipe and recreate (see Step 0) |
| Direct `fetch()` 429 but browser 200 | TLS fingerprinting (JA3/JA4) — use `browserFetch()` instead |
| Route 404 after editing routes.ts | Kill port 3001, rerun `pnpm dev` |
| ID regex misses alphanumeric IDs | Use `[A-Z0-9]+` not `\d+` |
| `data-*` attr != displayed value | Always read from displayed text |
| `browserRequired: false` gets 503 | Guard must be `if (!browser && route.browserRequired !== false)` |
| Public API returns XML | Parse with regex: `/<item>([\s\S]*?)<\/item>/g` for RSS |
| Public API returns `total: 0` with 200 | Soft rate limit — retry after a few seconds |

---

### Browserless Routes with Background Polling

For rate-limited or slow data sources (`browserRequired: false` routes), use a background poller:

1. **Poller** runs every N seconds, stores results in `Map<key, data[]>`, exports getter
2. **Route handler** reads from in-memory store (no external request); cold-start fallback fetches directly with TTL cache
3. **Factory pattern**: `createRoutes(getBridgeFn?, getDataFn?)` — route factory accepts getter as closure; register in `apps/api/src/register-domains.ts`

This prevents rate-limit compounding — without it, every API call makes fresh requests on top of the poller.

#### TTL cache Map

```typescript
const cache = new Map<string, { data: Result; expiresAt: number }>();
const TTL_MS = 5 * 60 * 1000;
async function fetchWithCache(key: string): Promise<Result> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.data;
  const data = await fetchFromSource(key);
  cache.set(key, { data, expiresAt: Date.now() + TTL_MS });
  return data;
}
```

Route and poller share the same Map (same Node.js process) — never skip the cache in route handlers.

#### `broadcastMessage` wiring

Inject `broadcastMessage` via `setBroadcast(fn)` before starting the poller (first poll fires immediately). Domain package exports `setBroadcast`; `apps/api/src/index.ts` calls it with the imported `broadcastMessage` from `./state`.

#### RSS / XML feed parsing

Node.js has no DOMParser. Parse with regex — the `get` helper handles both CDATA and plain forms:

```typescript
function parseRssXml(xml: string) {
  const items: Array<{ title: string; link: string; description: string; pubDate: string }> = [];
  for (const [, block] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const get = (tag: string) => block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`))?.[1]
      ?? block.match(new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`))?.[1] ?? '';
    items.push({ title: get('title').trim(), link: get('link').trim(),
      description: get('description').trim(), pubDate: get('pubDate').trim() });
  }
  return items;
}
```

#### Unix timestamps

Many APIs use unix epoch seconds (10 digits, ~1700000000) for time ranges. `Math.floor(Date.now() / 1000)` for current time. Check captured traffic for exact param names (`period1`, `period2`, `from`, `to`). Common intervals: `1m`, `5m`, `15m`, `1h`, `1d`.
