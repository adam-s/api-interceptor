---
name: api-discovery
description: Discover any website's API and create domain plugins with proxy routes. Use when the user wants to create an API for a website, reverse-engineer a web service, add a new domain, capture browser traffic, build typed API clients, or integrate with a third-party site. Also use when the user mentions a website name and wants to interact with it programmatically.
---

# API Discovery

Reverse-engineer how a website delivers its data, then create a domain plugin that exposes it as a typed API. Works with JSON APIs, SSR pages, and hybrid sites.

**Core principle:** Navigate as a real user. Never guess a URL. Let every endpoint reveal itself through real browser actions.

**Development principle:** Use debug-logs and visual-dev skills at every step — not just at the end. Debug logs turn guessing into knowing. Screenshots turn assumptions into proof. A route that returns data you haven't visually verified is a route that might be returning garbage. **GATE: You may NOT write the next component until you have screenshotted the current one. If you find yourself writing component B, check: did you screenshot component A? If not, stop and screenshot it now.**

**Decision rules** (internalize these — detailed sections below explain each):

- Intercepted JSON > DOM extraction. Always prefer the site's internal API over scraping HTML.
- If parsing takes more than ~5 lines of regex, use a real parser (cheerio, beautifulsoup, or Python NLP via bridge).
- If extracted data doesn't match what the browser renders, trace the decoder — don't hack around the mismatch.
- Auto-start browser has no traffic capture. Connect via WebSocket for discovery.
- One browser, sequential calls. Never `Promise.all` across browser-dependent domains.
- Every route must return real data from curl before you touch the dashboard.

## ⚠️ DO NOT SKIP PHASES

Phase 1 (Observe) is **NOT optional**. You MUST:
1. Connect a browser via WebSocket: `ws://localhost:3001/browser/stream?profile=<domain>&url=<target>`
2. Capture traffic: `curl -s http://localhost:3001/browser/traffic | jq '.entries | length'`
3. Screenshot the page with visual-dev skill to see what data is visible

**Auto-start browser ≠ WS-connected browser.** The server auto-starts a headless browser for simple proxy routes, but it has **NO CDP traffic capture**. Traffic capture ONLY works when you connect via the WebSocket endpoint above. If you skip WebSocket connection, `/browser/traffic` will always return 0 entries and you will be forced to guess DOM structure — the #1 cause of failed iterations.

**If you have not connected a browser via WS and captured traffic, you are guessing. Stop and observe.**

## Quick Check: Does the Domain Plugin Already Exist?

```bash
ls domains/ | grep <domain-name>
```

If it exists, read `domains/<name>/src/routes.ts` and skip to "Use Existing Domain" at the bottom.

## Phase 0: Check for a Public API

Before launching a browser, check if the target site has a documented public REST API. If the user's prompt includes discovery hints or notes about the target site, read them first — they may contain answers that save hours of trial and error.

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

**Use CDP for discovery, not `page.route()`.** CDP `Network.enable` catches ALL network requests; `page.route()` only intercepts requests matching its glob patterns and misses requests to unexpected domains (tracking pixels, subdomain APIs, third-party analytics). Narrow to `page.route()` later for proxy interception once you know the endpoints. (Note: `page.route()` is appropriate for test mocking in visual-dev scripts — just not for API discovery.)

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

### Parsing: escalate complexity, don't write fragile regex

**If your parsing logic exceeds ~5 lines of regex, stop.** You're building a fragile one-off parser that will break on the next edge case. Escalate to a real parser instead.

**Escalation ladder:**

| Complexity | Tool | When |
|-----------|------|------|
| Simple | `innerText` + split by `\n` | Clean card layout, one value per line |
| Moderate | `cheerio` (TS) or `beautifulsoup4` (Python) | HTML has structure but `innerText` concatenates fields |
| Complex | Python NLP via bridge (`dateutil`, `usaddress`, `thefuzz`) | Flat unstructured text — dates, addresses, fuzzy matching |
| Very complex | Dedicated TypeScript service or Python worker method | Multi-step pipelines, entity extraction, cross-field normalization |

**The rule:** if you're writing more than one regex to parse the same block of text, use a parser. `cheerio.load(html)` with CSS selectors is always more reliable than `innerText` + regex chains. For text that has no HTML structure at all, use Python NLP via the bridge — it handles date formats, address parsing, and fuzzy matching that would take dozens of per-site regex patterns.

**HTML parsers (preferred when structure exists):**
- **Node.js:** `cheerio` — jQuery-like, runs server-side. `cheerio.load(html)` then CSS selectors. Add as a dependency to the domain package.
- **Python:** `beautifulsoup4` or `lxml` — HTML/XML scraping standard. Use via the Python bridge for complex parsing that would require fragile regex chains in TypeScript.

Use `innerText` only when the HTML structure is too dynamic or the data isn't in distinct elements.

**Python NLP tools (preferred for unstructured text):**

When the text IS flat (no HTML structure to parse), use Python NLP tools via the bridge instead of writing fragile regex per site:

- `dateutil.parser.parse()` — normalizes any date format to ISO 8601. Handles "Mar 17, 2026", "3/17/26", "17 March 2026", etc. without per-format regex.
- `usaddress.parse()` — splits concatenated address strings. "San Francisco, CAMoscone Center" → city, state, venue as separate fields.
- `thefuzz.fuzz.ratio()` — fuzzy string matching for deduplication. "Element Skateboards" vs "Element Skateboard Co." → 87% match. Set threshold ~85.

Add methods to `services/python/worker.py`, register in `METHODS` dict:

```python
# In worker.py
import dateutil.parser
from thefuzz import fuzz

def parse_dates(params):
    """Normalize messy date strings to ISO 8601."""
    results = []
    for text in params.get("texts", []):
        try:
            results.append(dateutil.parser.parse(text).isoformat())
        except (ValueError, OverflowError):
            results.append(None)
    return {"dates": results}

def fuzzy_match(params):
    """Fuzzy string comparison — returns similarity ratio 0-100."""
    return {"ratio": fuzz.ratio(params["a"], params["b"])}
```

Install: `pip install python-dateutil thefuzz`

### DOM Extraction Rules

**Displayed text is ground truth.** Data attributes (`data-price`, `data-amount`) contain internal representations that may differ from what the user sees — different currencies, different units, encoded values. Always extract from the visible rendered text, then parse.

**Constrain selectors to the narrowest match.** A broad selector returns navigation links, footer links, ads, and recommendations alongside real results. Scope queries to a container first, or use attribute selectors that match only the URL path segment you need.

**Extracted text contains layout noise.** Sites prepend categories, append suffixes, and inject decorative content into text nodes. After extracting `innerText`, compare it to what a user would actually read on screen and strip anything extra.

**Navigate like a user, not like a crawler.** Go search → list → detail in order. Each step builds cookies, referrers, and session trust. Jumping directly to a deep URL skips those signals and triggers harder bot challenges.

### Data source preference order

When a site fires internal API calls (visible in CDP traffic), prefer intercepting those over DOM parsing:

1. **Type A (direct proxy)** — clean JSON, no browser needed. Best case.
2. **Type B2 (traffic capture)** — JSON from CORS-blocked endpoints. Still structured.
3. **Type B (DOM extraction)** — last resort when the site has no API calls and everything is server-rendered. Use HTML parsers or Python NLP to clean the output.

The intercepted JSON is always cleaner than `innerText` + regex. A site's internal API returns `{ "brand": "Element", "price": 8999 }` as separate typed fields. The same data from DOM text comes back as `"Element8.0\" Midnight Blue$89.99"` and requires fragile parsing.

**Type A sources can die without warning.** Public APIs get auth-gated overnight (Dice went from public JSON to 403 in one release). Write domain plugins defensively — if a Type A endpoint returns 403/429, the fix is to fall down the decision tree to Type B2 or B, not to retry the same broken endpoint. Set `browserRequired: true` and use `browser.navigate()` + `page.evaluate()` to extract from the DOM.

### Rate-limited outbound fetch

For all `browserRequired: false` routes, use `rateLimitedFetch` from `@interceptor/shared` instead of raw `fetch()`. It enforces per-hostname rate limits registered at startup, and auto-retries 429 responses with exponential backoff.

```typescript
import { rateLimitedFetch } from '@interceptor/shared';

const res = await rateLimitedFetch('https://api.example-research.org/...');
```

Register host limits in `apps/api/src/register-domains.ts`:

```typescript
import { registerRateLimit } from '@interceptor/shared';
registerRateLimit('api.example-research.org', { maxPerMinute: 10, retryOn429: 2 });
```

Unregistered hosts pass through with no delay. Add a `@interceptor/shared` workspace dependency to any domain package that uses it.

### browserFetch timeout

`browserFetch()` has a default 20-second timeout covering both navigation and the in-browser fetch. If the browser is disconnected or the target site hangs, it throws `"browserFetch timed out"` instead of hanging forever. Override with `{ timeout: 30000 }` for slow endpoints.

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

## Decoding Encoded API Responses

When a captured API response contains values that don't match what's rendered in the DOM — wrong prices, cryptic IDs instead of names, numbers in unexpected units — the site's JavaScript is decoding or transforming the raw response before display. The DOM is always ground truth. Trace backwards from the rendered output through the minified JS to find the decoder.

### Why this works

**String literals survive minification.** Variable names get mangled to `k`, `n`, `o` but string constants — attribute values, JSON property names, error messages, URL patterns — are preserved because they're runtime values. These are your anchors into the minified code.

### The technique

**Step 1 — Anchor from the DOM.** Find the element displaying the value. Note a stable identifier: `data-testid`, `data-bdd`, `aria-label`, or a unique string in the element's attributes. Avoid class names (they change with CSS-in-JS).

**Step 2 — Fetch the JS bundle.** The page's `<script src="...">` tags point to the bundles. Download the main bundle. Search for your anchor string.

**Step 3 — Read outward from the match.** The anchor sits inside a render function. The displayed value is a nearby variable used as `children:` or `textContent`. That variable was assigned from a prop or data object earlier in the same function.

**Step 4 — Follow property accesses.** Property names on objects survive minification: `n.basePrice` stays as `.basePrice` even when `n` is meaningless. The dotted property path tells you the exact shape of the decoded object.

**Step 5 — Find the transform between raw API and rendered value.** Look for arithmetic (`n / 100`), lookups (`e._rates[t.rateKey]`), or formatting (`"$" + n.toFixed(2)`). This is the decoder.

### Example: encoded prices in a captured API response

Imagine a skateboard marketplace. The API returns boards for sale at an event:

```json
{
  "boards": [
    { "sku": "SB-42", "rateKey": "MK4XNRQ", "brand": "Element", "deckSize": "8.0", "color": "midnight" }
  ],
  "_rates": {
    "MK4XNRQ": { "cents": 8999, "cur": "USD", "shippingCents": 1200 }
  }
}
```

The DOM shows: `<span data-testid="board-price">$89.99</span>`

The raw API value `8999` ≠ `$89.99`. Something decodes it. Search the JS bundle for `"board-price"`:

```javascript
// Minified (variable names mangled, strings preserved):
(0,x.jsx)(eB,{"data-testid":"board-price",children:"$"+(n._rates[t.rateKey].cents/100).toFixed(2)})
```

Now you can read the decoder:
- `t.rateKey` → `"MK4XNRQ"` — an indirect key, not a value itself
- `n._rates["MK4XNRQ"]` → lookup in a sibling object by that key
- `.cents / 100` → raw value is in cents, divide to get dollars
- `"$" + (...).toFixed(2)` → formatted as `$89.99`

### Common encoding patterns

| Pattern | Signal | Decode |
|---------|--------|--------|
| **Indirect reference** | Items contain encoded string IDs; a sibling `_embedded` or `_pricing` block has matching keys | Map the ID to the referenced object to get actual values |
| **Unit mismatch** | Raw number is 100x or 1000x the displayed value | Divide by the scale factor (cents → dollars, millicents → dollars) |
| **Currency localization** | Price prefix is `S/.`, `€`, `£` instead of `$`; value is in local currency based on IP | Strip currency prefix before parsing; detect currency; convert to common base |
| **Nested path** | Value isn't at `item.price` but at `item.offer.pricing.total.amount` | Follow the dotted path in the JS bundle to find the full access chain |
| **Computed values** | Displayed value is a sum or product of multiple fields | Look for arithmetic in the render function: `n.base + n.fees`, `n.qty * n.unitPrice` |

### When to use this

- `curl` returns data but numbers don't match what the page shows
- Fields contain encoded strings instead of human-readable values
- Prices are off by a factor of 100 or 1000
- The API response has a `_embedded`, `_refs`, or `_linked` block you don't understand

### When NOT to use this

- The API returns clean, matching values — just use them directly
- The site has public API documentation — read the docs instead

## Phase 4: Verify — REQUIRED before proceeding

**Each route must produce curl output showing real data. This output is what you use to build the UI. No output = no UI.**

For EACH route you wrote:

```bash
curl -s http://localhost:3001/api/<domain>/<path> | jq '.'
```

Read the response. Does it contain real data (titles, prices, names, dates)? If yes — this route is done, move to the next one.

If the response is empty, wrong, or an error:
1. Add `DEBUG()` inside the route handler: `DEBUG('route-name', () => ({ rawResponse, itemCount, firstItem }))`
2. Re-curl the route
3. Read the log: `tail -20 /tmp/interceptor-debug/debug-$(date +%Y-%m-%d).log`
4. The log tells you exactly what happened — fix it
5. Remove the DEBUG() calls, re-curl, confirm real data

**Do NOT proceed to the dashboard-builder skill until EVERY route returns real data from curl.** The dashboard displays whatever the API returns. If the API returns garbage, the dashboard displays garbage, and you'll waste time debugging the UI when the bug is in the API.

### Prompt Compliance Check (between Phase 4 and Phase 5)

Re-read the original prompt. List every data requirement. Verify you have a route for each one. If any are missing, go back to Phase 1 for those specific needs.

### Trigger: Extracted Data Doesn't Match Rendered DOM

If `curl` returns data but values don't match what the browser renders (wrong names, category labels instead of actual names, prices off by 100x, cryptic IDs instead of readable text) — this is the trigger for the **Decoding Encoded API Responses** technique above. Do NOT hack around the mismatch (e.g., extracting names from URL slugs). Trace the real data source through the site's JavaScript to understand the actual data model.

## Phase 5: Create Domain Plugin

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/scaffold-domain.sh <name> <root-domain>
```

1. Populate `domains/<name>/src/routes.ts` with discovered routes
2. Register in `apps/api/src/register-domains.ts` and `apps/api/package.json`
3. `pnpm install` then **test every route end-to-end with curl + debug logs before building any UI.** The API layer must be rock-solid before the dashboard layer begins. If a route returns wrong data, the dashboard will display wrong data and you'll waste time debugging the wrong layer.

### Domain Registration Checklist

After scaffolding, verify BOTH steps are complete:
- [ ] `apps/api/src/register-domains.ts` — `import { plugin } from '@interceptor/domain-<name>';` and `registerDomain(plugin);`
- [ ] `apps/api/package.json` — `"@interceptor/domain-<name>": "workspace:*"` added to dependencies

Missing either step causes silent failure: TypeScript error TS2307 (can't find module) even though `pnpm-workspace.yaml` resolves the package. Both are required.

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
| Domain switch returns stale/empty data | Navigate to `about:blank` + 500ms wait before navigating to the new domain. Use `page.waitForSelector('a[href*="/expected/"]', { timeout: 15000 })` instead of fixed `setTimeout` — handles both cold starts (slow) and warm navigations (fast). |
| `innerText` returns category labels not names | Check the URL slug — `/boards/element-8-0-midnight/` often contains the clean entity name split by hyphens. Also check `__NEXT_DATA__` for structured props. |
| `page.evaluate` throws `__name is not defined` | tsx/esbuild injects `__name` decorators — use string-based evaluate: `page.evaluate('document.cookie')` not `page.evaluate(() => document.cookie)` |
| `browserFetch` POST returns "Unable to parse" | Default `Accept: application/json` header rejected — use `page.evaluate` with direct `fetch()` for POST mutations |
| `URLSearchParams` breaks Rest-li syntax | Rest-li uses raw `(key:value)` — build query strings manually, don't use `URLSearchParams` which encodes parens/colons |
| Write operations return empty/binary | Site uses React Server Components (RSC) — look for `rsc-action` in traffic; fall back to browser automation (navigate + click + type) |
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
