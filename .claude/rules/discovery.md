> **GATE: Fill the elimination table BEFORE writing route code.**
>
> **MANDATORY: Full breadth exploration. Discover ALL transports before building ANY routes. NEVER target specific endpoints — let the protocol find them. Listing specific routes or endpoints in agent prompts causes tunnel vision and wastes hundreds of calls.**

# Discovery Protocol

This is an API interceptor. Navigate to a page → trigger pagination → capture the request/response → build a proxy route.

## PRE-FLIGHT → GATHER → SCAN → CLASSIFY → BUILD

Five steps. No skipping. No building until classification is complete.

---

### STEP 0: PRE-FLIGHT (0 tool calls — use your training knowledge)

Before connecting the browser, write down everything you already know about the target website. You have been trained on the web — use that knowledge.

```
## Pre-flight: [target URL]
- What is this site? What does it sell/show?
- Framework: [Next.js, SvelteKit, React SPA, server-rendered, etc.]
- Known API endpoints or patterns: [internal API paths, GraphQL endpoint, REST API]
- Pagination pattern: [cursor, offset/limit, page numbers, infinite scroll, "Show More"]
- Authentication: [public, API key, CSRF token, cookies, OAuth]
- Bot detection: [Cloudflare, Kasada, Akamai, DataDome, none known]
- Embedded data pattern: [__NEXT_DATA__, data-deferred-state, data-sveltekit-fetched, window.__INITIAL_STATE__, etc.]
- Known gotchas: [geo-restrictions, consent walls, login walls]
- Real-time transports: [WebSocket URLs, SSE endpoints, live streaming, PubSub]
```

**Real-time transport checklist.** Breadth-first discovery often misses streaming transports because they require specific page types. In PRE-FLIGHT, name where these might live:
```
- WebSocket: [chat pages, live feeds, real-time dashboards, notifications]
- SSE: [streaming APIs, live updates, REST with Accept: text/event-stream]
- HLS/DASH: [video player pages, live stream pages, VOD archives]
- PubSub: [event feeds, channel subscriptions, real-time notifications]
```
If the site has ANY real-time features, you MUST navigate to those pages during GATHER.

**Content hierarchy with pagination targets.** Every site has a hierarchy where you drill down to find paginated lists. Write yours out and name specific busy instances:

```
Level 1: [top-level browsing] → pick the busiest category
Level 2: [mid-level listing] → pick the most popular item
Level 3: [detail page with sub-items] → THIS is where pagination lives
```

Examples of hierarchies — your site follows one of these patterns:
- genre → artist → event → **ticket listings** (pick an artist with sold-out stadium shows)
- origin → destination → **flight listings** (pick the busiest route)
- brand → category → **product listings** (pick the most popular category)
- channel → video → **comments** (pick a viral video)
- city → neighborhood → **rental listings** (pick the most popular city)
- league → team → **game listings** (pick the team with the most games)
- topic → thread → **replies** (pick the most active thread)
- search query → **results** (pick a broad, popular query)

**Name your specific target:** Don't write "a popular event" — write the actual navigation path you'll take to reach a page with 100+ items. You know which instances are popular.

**WARNING: Your training data may be stale.** Everything above is a hypothesis. GATHER must confirm or correct every assumption. Do NOT skip GATHER or build routes from pre-flight knowledge alone.

---

### STEP 1: GATHER

Two jobs: (A) confirm/correct your pre-flight, (B) intercept pagination.

**1a. Connect browser and warm up.**

```bash
./scripts/connect-browser.sh --profile <domain> --url <homepage> --port PORT
sleep 15
```

Connect to the HOMEPAGE first, not directly to a deep page. Browse naturally: scroll, click 1-2 links, then navigate to your target page. This establishes cookies and avoids bot detection (CAPTCHAs, WAFs). Direct deep-link navigation triggers bot walls.

**1b. Confirm your pre-flight (1-2 tool calls).** Navigate the homepage and verify your pre-flight hypotheses. Correct anything that's wrong. You already know what this site is — don't spend tool calls rediscovering it.

**1c. Find a page with 100+ items.** You already know what kind of pages on this site will have the most items — use that knowledge. Navigate directly to a page you expect to have 30+ items. Check the count with `page.evaluate` (read a "showing X of Y" indicator or count list elements). If < 30 items, navigate to a busier instance — don't attempt interception on small pages. Pagination controls and XHR endpoints only appear when there are enough items to paginate.

**1d. Intercept pagination.** Snapshot → trigger → diff.

```bash
# 1. Snapshot BEFORE
curl -s http://localhost:PORT/browser/traffic > /tmp/traffic-before.json

# 2. Trigger pagination via page.evaluate
curl -s -X POST http://localhost:PORT/browser/mcp/evaluate \
  -H 'Content-Type: application/json' \
  -d '{"script":"document.querySelector(\"[class*=more], [class*=load], [class*=next], [aria-label*=next], [aria-label*=Next]\")?.click()"}'
sleep 5

# 3. Snapshot AFTER and diff
curl -s http://localhost:PORT/browser/traffic > /tmp/traffic-after.json
```

**Success:** New traffic entries appeared → record URL, method, headers, and response shape. Trigger pagination 2-3 times to confirm the pattern (e.g., page=1, page=2, page=3). You are capturing the API pattern, not downloading all the data. Once you have the endpoint URL, method, headers, and pagination mechanism, stop and move on.

**If you already see an API endpoint with pagination params in initial traffic** (e.g., `?page=1`, `?offset=0`, `page` in POST body):
Do not wait for new traffic from clicking. Test the endpoint directly via the browser's fetch:
```bash
curl -s -X POST http://localhost:PORT/browser/mcp/evaluate \
  -H 'Content-Type: application/json' \
  -d '{"script":"fetch(\"/api/path?page=2\").then(r=>r.json()).then(d=>JSON.stringify({count:d.items?.length,total:d.totalCount}).slice(0,500))"}'
```
If it returns different items, this is a confirmed paginated XHR API. Record the pattern and move on. You do not need new traffic entries to prove pagination works.

**If 0 new entries after triggering pagination:**
0 new entries does NOT mean no XHR API exists. Common causes:
1. Data was prefetched by the initial API call (client-side pagination of already-fetched data)
2. Service worker intercepted the fetch
3. The request URL was deduplicated

**Before concluding embedded/SSR:** Check if ANY endpoint with pagination params (`page`, `offset`, `cursor`) appeared in initial traffic. If yes, test it directly (see above). Only conclude "no XHR" after testing discovered endpoints AND trying 3+ pages with 100+ items.

**1e. GATHER stop condition.** GATHER is done when you have:
- At least one confirmed XHR/API endpoint with pagination (tested via fetch()), OR
- Confirmed embedded data on 2+ page types, OR
- 5+ distinct API endpoints visible in traffic

If you already have enough endpoints, do NOT keep navigating to more pages. Move to SCAN. If you have fewer than 3 endpoints after 2 page types, try one more page type — but no more than 3 total.

**1f. Capture final traffic.**

```bash
curl -s http://localhost:PORT/browser/traffic > /tmp/traffic-all.json
```

**GATHER rules:**
- Browser only — no `rateLimitedFetch`, no `curl`, no direct HTML/JS fetching
- `page.evaluate` for interaction (clicking, scrolling) AND for testing discovered API endpoints via `fetch()`. Using `page.evaluate("fetch(...)")` tests the API — this is allowed. Do NOT use `page.evaluate` to read `__NEXT_DATA__`, Redux state, or DOM text in GATHER — that belongs in SCAN.
- For cross-origin API endpoints (different subdomain), always use `{credentials: "include"}` in fetch() to forward browser cookies. Without it, WAF-gated APIs return 403.
- `browserFetch` is a route-handler method for route code. During discovery, use `POST /browser/mcp/fetch` instead — it runs fetch() in the browser context with all cookies: `curl -s -X POST http://localhost:PORT/browser/mcp/fetch -H 'Content-Type: application/json' -d '{"url":"..."}'`
- Low traffic (1-4 entries) is normal after one page load — navigate more pages, don't panic
- **Traffic resets on navigation.** After `page.goto()` or `extractFromPage()`, previous traffic entries may be cleared. Always capture `/browser/traffic` BEFORE navigating to a new page. If you need traffic from the new page, wait and re-fetch traffic after the page loads.
- **Browser connection drops.** If a browser command returns an error about closed context or lost connection, reconnect ONCE with `./scripts/connect-browser.sh`. Do not spend more than 2 calls reconnecting — if it fails twice, the browser session is dead, proceed with what you have.
- **WebSocket traffic is NOT captured** by `/browser/traffic`. The traffic interceptor only captures HTTP requests via CDP Network events. To detect WebSocket, check JS bundles for `wss://` URLs or `new WebSocket(`, then test the URL directly via `page.evaluate`. You cannot rely on traffic capture for WS discovery.

---

### STEP 2: SCAN

Now fetch HTML/JS and analyze everything.

**2a. Traffic scan** (one pass):
```bash
curl -s http://localhost:PORT/browser/traffic | python3 -c "
import sys,json
d = json.load(sys.stdin)
for e in d.get('entries',[]):
    ct = e.get('responseHeaders',{}).get('content-type','')
    print(f'{e[\"method\"]} {e[\"url\"][:80]} [{ct[:40]}]')
"
```

**2a-CHECK (MANDATORY).** Scan traffic for pagination params. If ANY endpoint has `page=`, `offset=`, `cursor=`, `limit=` in the URL or POST body, test page 2 NOW:
```bash
curl -s -X POST http://localhost:PORT/browser/mcp/fetch \
  -H 'Content-Type: application/json' \
  -d '{"url":"/api/path?page=2"}'
```
If it returns data with `status: 200`, mark JSON API (XHR) ✓ in the elimination table immediately. The browser's cookies are forwarded automatically.

**2b.** Fetch HTML of 2 page types + largest JS bundle. Use `page.evaluate("fetch(url).then(r=>r.text())")` or direct curl if no auth needed.

**2c. HTML scan** (both pages):
```bash
grep -oE '<script[^>]*type="application/json"[^>]*>' page.html
grep -oE '__NEXT_DATA__|data-deferred-state|data-sveltekit-fetched|__NUXT_DATA__|__remixContext' page.html
grep -oE 'type="hidden"[^>]*value="[^"]*"|meta name="[^"]*" content="[^"]*"' page.html
```

**2d. JS bundle scan:**
```bash
grep -oE 'wss://[^"'\'' ]+|new WebSocket\(|\.m3u8|MediaSource|protobuf|EventSource|graphql|/gql|grpc|application/grpc' bundle.js
```

**2d-GRAPHQL.** If traffic, HTML, or JS shows a GraphQL endpoint (`/graphql`, `/gql`, `graphql` in URL), introspect it in ONE call:
```bash
curl -s -X POST http://localhost:PORT/browser/mcp/fetch \
  -H 'Content-Type: application/json' \
  -d '{"url":"/api/graphql","method":"POST","headers":{"Content-Type":"application/json"},"body":{"query":"{__schema{queryType{fields{name}}}}"}}'
```
This reveals ALL available queries in one call. If it works, mark GraphQL ✓ and plan routes for each query.

**2d-METHOD-DISPATCH.** Some sites use a single URL with `?method=X` query params to dispatch different API actions (e.g., `POST /page?method=GetListings`). If traffic shows POST requests to page URLs returning `application/json`, test the pattern — it may be a JSON API hidden behind a method-dispatch pattern. These always require browser cookies (Gap=Y).

**2e. Access Gap table.** Make ONE curl per endpoint — no repeated tests. If you get 429, that IS the answer: mark Gap=Y. Do not retry.

```
| Endpoint | Browser status | Direct HTTP status | Gap? |
|----------|---------------|-------------------|------|
| [url]    | 200           | 200 / 401 / 403   | Y/N  |
```

Gap=Y → session harvest in BUILD (read `session-harvest.md` first).

---

### STEP 3: CLASSIFY (reasoning only)

Verify your site understanding. Routes must cover every level of the content hierarchy, especially the deepest.

```
## Transport Elimination: [domain]
| Transport      | Present? | Evidence                                    |
|----------------|----------|---------------------------------------------|
| Embedded JSON  | ✓ or ✗   | [evidence]                                  |
| JSON API (XHR) | ✓ or ✗   | [evidence]                                  |
| GraphQL        | ✓ or ✗   | [evidence]                                  |
| WebSocket      | ✓ or ✗   | [evidence]                                  |
| HLS/Media      | ✓ or ✗   | [evidence]                                  |
| gRPC-Web       | ✓ or ✗   | [evidence]                                  |
| SSE            | ✓ or ✗   | [evidence]                                  |
| Encoded/Binary | ✓ or ✗   | [evidence]                                  |
```

Every row needs ✓ or ✗ with evidence. Every Gap=Y endpoint needs a planned route. Do NOT start BUILD until this is filled.

---

### STEP 4: BUILD

**Budget check:** You should have ~60-80 calls remaining for BUILD. If you have fewer than 40, simplify: build routes for the primary transport only (the one with pagination), skip secondary transports. Sites with WAF (Akamai, Kasada, Cloudflare) typically need 40-50 GATHER calls instead of 25-30 — factor this into your budget planning.

**For each ✓ transport, build a route.** See `domains/boardshop/ROUTES.md` for a quick-reference index to find the right pattern.

**The server does NOT auto-reload domain files.** Write ALL files first (routes.ts, config.ts, interceptor.ts, index.ts, package.json), update register-domains.ts and apps/api/package.json, run `pnpm install`, then kill and restart the server ONCE. If you need to fix a route, edit the file, kill -9 the server, and restart. Do NOT debug "why old code is running" — just kill and restart.

**The route building flow:**

1. **`browserFetch`** — start here. It has the browser's cookies and session. If it returns data, you have a working request.
2. **Elimination** — remove headers/cookies one at a time via `rateLimitedFetch`. Find the minimum required set. (See `session-harvest.md` for the full elimination process.)
3. **`GenericSessionManager`** — store the minimum required values (cookies, tokens, API keys) using `GenericSessionManager.getInstance('yourdomain')`. See `domains/boardshop/src/session-manager.ts` for the pattern. The session manager persists to disk and handles expiry.
4. **Route handler** — uses SessionManager to get fresh values, makes requests with only what's needed.
5. **`rateLimitedFetch` / curl** — only as a final verification that the route works without the browser. This is dead last.

**After each route, fill:**

```
| Items returned | ___ |
| Total indicated | ___ |
| Complete | yes / no |
```

If total > items returned, paginate (2-3 pages to confirm the pattern). Common patterns: URL params (`?page=2`), response cursors, POST body increment, offset+limit, click-intercept.

**Test each route** through the API server proxy before building the next.
