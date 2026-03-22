> **GATE: Complete the FULL elimination table BEFORE writing any route code. Every transport type must be marked ✓ or ✗. No unknowns = no missing routes.**

# Discovery Protocol

Discover ALL transports a website uses by gathering evidence, scanning for markers, and classifying every transport type. Do NOT search for public APIs, scraping guides, or external documentation.

## The Algorithm: GATHER → SCAN → CLASSIFY → BUILD

Four steps. Always all four. No skipping. No building until classification is complete.

---

### STEP 1: GATHER (3-5 tool calls)

Collect ALL evidence before analyzing anything.

**1a. Connect browser and search for pagination on every page.** Before fetching HTML or reading any data, connect a browser and find how the site paginates. This is the #1 priority in GATHER.

On every page you visit, immediately search for ALL pagination types:

```bash
# Connect browser
./scripts/connect-browser.sh --profile <domain> --url <target> --port PORT
sleep 15

# On every page, run this to find pagination controls:
curl -s -X POST http://localhost:PORT/browser/mcp/evaluate \
  -H 'Content-Type: application/json' \
  -d '{"script":"JSON.stringify({showMore: !!document.querySelector(\"button:has-text(Show more), button:has-text(Load more), button:has-text(See more)\"), nextButton: !!document.querySelector(\"[aria-label*=next], [aria-label*=Next], button:has-text(Next)\"), pageNumbers: !!document.querySelector(\"nav[aria-label*=pagination], nav[aria-label*=Pagination], [role=navigation] a\"), infiniteScroll: !!document.querySelector(\"[data-testid*=infinite], [class*=infinite], [class*=lazy-load]\"), totalItems: document.body.innerText.match(/showing \\d+ of \\d+|\\d+ results|\\d+ listings/i)?.[0] || null})"}'
```

When you find a pagination control — **click it immediately** and capture the traffic:

```bash
# Capture traffic before clicking
curl -s http://localhost:PORT/browser/traffic > /tmp/traffic-before.json
# Click the pagination control
curl -s -X POST http://localhost:PORT/browser/mcp/evaluate \
  -H 'Content-Type: application/json' \
  -d '{"script":"(document.querySelector(\"button:has-text(Show more), button:has-text(Load more), [aria-label*=next], [aria-label*=Next]\") || document.querySelector(\"nav[aria-label*=pagination] a:last-child\"))?.click()"}'
sleep 5
# Capture traffic after clicking — new entries are the pagination API
curl -s http://localhost:PORT/browser/traffic > /tmp/traffic-after.json
```

Do this on at least 2 pages: the home/list page AND a detail page with many items.

**1b.** Fetch the raw HTML of 2 page types using `browserFetch` (not `rateLimitedFetch` — you already have the browser connected). Also fetch the largest JS bundle for scanning.

**Required output from GATHER:**
- Pages visited: [list URLs]
- Pagination controls found: [type per page — Show more / Next / page numbers / infinite scroll / none]
- Pagination traffic captured: [yes/no — if yes, record the request URL, method, and body]
- Traffic entry count: ___

**1e.** Build the Access Gap table. For each API endpoint the browser called, try the same request with plain `rateLimitedFetch` (no cookies). Record the result:

```
## Access Gaps
| Endpoint (from browser traffic) | Browser status | Direct HTTP status | Gap? |
|--------------------------------|---------------|-------------------|------|
| [url]                          | 200           | 200 / 401 / 403   | Y/N  |
```

Any row with Gap=Y is a **session harvest target** in BUILD. These are not optional — they represent data the site delivers only to authenticated browsers.

**Output:** 2 HTML files, 1 JS bundle, list + detail traffic, and the Access Gap table.

---

### STEP 2: SCAN (1-2 tool calls)

Search ALL gathered data for ALL transport markers at once. Use ONE command per source.

**HTML scan** (run on BOTH pages):
```bash
echo "=== Embedded JSON ==="
grep -oE '<script[^>]*type="application/json"[^>]*>' page.html
echo "=== Framework ==="
grep -oE '__NEXT_DATA__|data-deferred-state|data-sveltekit-fetched|__NUXT_DATA__|__remixContext|data-reactroot' page.html
echo "=== Preconnect (reveals WS/CDN domains) ==="
grep -oE 'rel="preconnect" href="[^"]+"' page.html
echo "=== Tokens ==="
grep -oE 'type="hidden"[^>]*value="[^"]*"|meta name="[^"]*" content="[^"]*"' page.html
```

**JS bundle scan** (ONE grep for ALL markers):
```bash
grep -oE 'wss://[^"'\'' ]+|new WebSocket\(|\.m3u8|MediaSource|protobuf|protobufjs|EventSource|graphql|/gql|grpc|application/grpc' bundle.js
```

**Traffic scan** (ONE pass over all entries):
```bash
curl -s http://localhost:PORT/browser/traffic | python3 -c "
import sys,json
d = json.load(sys.stdin)
for e in d.get('entries',[]):
    ct = e.get('responseHeaders',{}).get('content-type','')
    print(f'{e[\"method\"]} {e[\"url\"][:80]} [{ct[:40]}]')
"
```

**Output:** list of every marker found, with location.

---

### STEP 3: CLASSIFY (0 tool calls — reasoning only)

**First: identify the site's core data.** What does this site exist to show users? (Tickets, listings, prices, videos, articles, products.) Your routes must cover this data. If your ✓ transports only cover metadata (search, categories, trending) but not the core data, you are missing the most important routes.

Fill the COMPLETE elimination table. Every row gets ✓ or ✗. No exceptions.

```
## Core data: [what this site sells/shows — e.g., "product listings with prices"]

## Transport Elimination: [domain]
| Transport      | Present? | Evidence                                    | Page type   |
|----------------|----------|---------------------------------------------|-------------|
| Embedded JSON  | ✓ or ✗   | [script tag ID, or "none found in 2 pages"] | [which page]|
| JSON API (XHR) | ✓ or ✗   | [traffic entry, or "no JSON XHR in 15s"]    |             |
| GraphQL        | ✓ or ✗   | [/gql in traffic or JS, or "not found"]     |             |
| WebSocket      | ✓ or ✗   | [wss:// in JS, or "not found"]              |             |
| HLS/Media      | ✓ or ✗   | [.m3u8 in JS, or "not found"]              |             |
| gRPC-Web       | ✓ or ✗   | [grpc content-type, or "not found"]         |             |
| SSE            | ✓ or ✗   | [EventSource in JS, or "not found"]         |             |
| Encoded/Binary | ✓ or ✗   | [non-JSON response, or "all JSON/HTML"]     |             |

## Access Gaps (from Step 1e)
[paste the Access Gap table here — every Gap=Y row becomes a session harvest route in BUILD]

## Completeness check
- Core data covered by a ✓ transport? [yes/no]
- Access Gap rows with Gap=Y: [count]
- Session harvest routes needed: [count]
```

**The table is not complete until:**
1. Every transport row has ✓ or ✗ with evidence
2. Every Gap=Y endpoint from the Access Gap table has a corresponding route planned in BUILD
3. If you mark a Gap=Y endpoint as ✗ (no route), you MUST explain why session harvest is impossible — not just difficult
4. The completeness check is filled

Do NOT start building routes until this table is filled.

---

### STEP 4: BUILD (2-3 tool calls per ✓ transport)

Three principles before you start:
1. **Interact with every page** — if you didn't click buttons and scroll during GATHER, go back. The most valuable traffic comes from interactions, not passive page loads.
2. **Know before you code** — for Gap=Y endpoints, run elimination to find the minimum auth set before writing any route code. Guessing wastes 10x more calls than measuring.
3. **Test with enough data** — if a detail page shows all items with no pagination, find a busier page. Pagination only appears when there are many items.

Each route has two phases. A route is NOT done after phase A.

**Phase A — Prove the endpoint works.** Get a successful first response.

For public endpoints (Gap=N), try the cheapest approach:
1. `rateLimitedFetch` — try first.
2. `browserFetch` — only if direct HTTP returns 429/403/404/202. This is not a retry — it's a different tool that runs inside the browser context.
3. `page.evaluate` — only if browserFetch fails (CORS, timeout).

For auth-gated endpoints (Gap=Y), go directly to session harvest. You already ran elimination and know the minimum required set. Do not try `rateLimitedFetch` on endpoints you already proved require auth.

**Phase B — Complete the route.** Getting the first page of data is step 1, not the finish line. Pagination is often harder than the initial request — it may require different auth, different request format, or sequential state. This is the actual work.

Common pagination patterns (try cheapest-first):
1. **URL params** — `?page=2`, `?offset=20`, `?cursor=X` (free, no browser needed). See boardshop Routes 4, 18.
2. **Response cursor/token** — use `nextCursor`, `continuation`, `after`, or base64-encoded cursor from Phase A response. See boardshop Route 18.
3. **POST body increment** — same endpoint, increment `CurrentPage` or `offset` in JSON body. May need CSRF token. See boardshop Routes 7, 31.
4. **Offset + limit** — `?offset=N&limit=20`, increment offset by page size. See boardshop Routes 30, 32.
5. **Click-intercept** — when the above fail OR the endpoint is WAF-gated (Gap=Y), use Patchright to click the button and intercept the response. See boardshop Route 33.

**Click-intercept pagination** — use when cheaper approaches fail or when the endpoint requires browser cookies:
1. Launch Patchright, navigate to the page
2. Set up response interception: `page.on('response', async (res) => { ... })`
3. Handle any modals/overlays (dismiss popups, accept cookies, close quantity selectors)
4. Click the pagination control ("Show more" button, "Next" link, or scroll to trigger lazy load)
5. The intercepted response contains the pagination data — capture it
6. Loop: click again for the next page until `itemsRemaining === 0` or no more button
7. Build the route handler to replicate this pattern

This works because the browser handles all cookies, WAF tokens, and CSRF automatically. You don't need to harvest cookies or build POST requests manually — the browser does it for you when you click the button. See Route 33 in `domains/boardshop/src/routes.ts` and `scripts/examples/click-intercept.ts`.

After each route returns data, fill this **mandatory completeness check**:

```
## Route: [path]
| Field | Value |
|-------|-------|
| Items returned | ___ |
| Total indicated (totalCount/total/hasMore/itemsRemaining) | ___ |
| Complete | yes / no |
| If no: what pagination approach is needed | ___ |
```

If total > items returned, the route is NOT DONE — **do not move to the next route.** Paginate until all items are returned. If pagination requires cookies the initial request didn't need, that is session harvest — read the reference file.

**Every ✓ row requires a route. No exceptions.** Only change ✓ to ✗ if all approaches including session harvest fail. "Stubborn" or "signed URLs" is not ✗ — it means session harvest.

#### Session Harvest (for Gap=Y endpoints)

**STOP. Read `.claude/skills/api-discovery/reference/session-harvest.md` before writing any session harvest code.** Do not attempt session harvest without completing all three phases described in that file. Do not invent your own cookie-fetching approach — the reference file covers `Set-Cookie` harvest, JS-challenge cookies via Patchright, elimination testing, and encoded value tracing.

**Traffic replay + elimination:** The browser traffic from Step 1d already contains working requests for Gap=Y endpoints — with all required headers and cookies. Before building a harvester from scratch:
1. Find the working request in captured traffic (URL, method, headers, cookies, body)
2. Replay it from Node.js `fetch` with ALL captured values — confirm you get the same response
3. **Run elimination:** For each cookie and header in the working request, make a new request with that ONE value removed. Rate-limit to 2-3 requests per second. Record which removals break the response (403/401/empty) and which still return 200. This gives you the minimum required set without guessing.
4. Build the route using ONLY the required values. **Never hardcode tokens, cookies, or headers** — captured values expire. The route must harvest fresh values each time (via browser session, page fetch, or cookie jar). Elimination tells you WHAT to harvest, not the values themselves.

Example: a request has 21 cookies and 8 headers. Run 29 requests (15 seconds at 2/sec). Result: 3 required (e.g., WAF token, session cookie, CSRF header), 26 optional. Now you know exactly what to harvest.

This replaces trial-and-error. Do NOT skip elimination and guess which values matter.

A route that returns `{ error: "needs browser session" }` is not a route. Harvest the session and return data.

Reference: Routes 30-31 demonstrate cookie harvest patterns, Route 33 demonstrates click-intercept pagination. All in `domains/boardshop/src/routes.ts`.

Reference patterns in `domains/boardshop/src/routes.ts`:

| Transport | Boardshop routes | Pattern |
|-----------|-----------------|---------|
| Embedded JSON | 1-2, 15-16, 20-21 | Standard, Next.js Redux, deferred state, hydration-stripped, SvelteKit |
| JSON API | 4-7, 12, 17, 19 | Cursors, CSRF POST, API key, custom headers, crumb auth, ?method=, rate-limit fallback |
| GraphQL | 8 | POST with inline query + Client-ID header |
| GraphQL Subscription | 25 | graphql-ws protocol over WebSocket |
| WebSocket (JSON) | 13, 24 | JSON frames, PubSub notifications |
| WebSocket (protobuf) | 14 | Base64-wrapped binary frames |
| WebSocket (binary) | 26 | Custom binary frame format (header + payload) |
| HLS/Media | 9 | Token → master playlist → quality variants |
| Encoded API | 10-11 | Base64 JSON, MessagePack binary |
| JSONP | 22 | Strip callback wrapper to parse JSON |
| Captions | 23 | Structured timed text from media endpoint |
| RSS/XML | 27 | Parse XML feed with cheerio |
| SSR HTML tables | 28 | Parse HTML tables with cheerio (pure SSR) |
| FormData POST | 29 | Multipart/form-data search request |
| Session Harvest (httpOnly cookie) | 30 | SessionHarvester: visit page → extract httpOnly cookie + embedded API key → paginate with plain HTTP |
| Session Harvest (WAF + session cookies) | 31 | SessionHarvester: visit page → extract all cookies (WAF alone isn't enough for data) → POST paginate |
| Encoded pricing + session harvest | 32 | Harvest cookie + API keys → paginate API → join indirect price refs via `_embedded` → decode opaque values using function from JS bundle |
| Click-intercept pagination | 33 | Patchright clicks "Load More" → intercepts POST responses → collects all pages. Browser handles cookies/CSRF. See `scripts/examples/click-intercept.ts` |

**Decode check:** After testing each route, compare a sample response field with what the page displays for the same item. If values don't match (e.g., API returns `"FBEJ"` but page shows `$51.49`), the response is encoded — read `.claude/skills/api-discovery/reference/decoding.md` and search the JS bundle for the decoder function.

Test each route with curl (or browserFetch for WAF-protected endpoints) before building the next. A route passes testing when it:
1. Returns HTTP 200 with actual data (not empty, not just metadata)
2. The completeness check shows total == items returned (or the route handles pagination)
3. Values match what the page displays (if not, the response is encoded — investigate)

Do NOT move to the next route until the current route is data-complete. Unexpected output is information, not failure — investigate encoding, localization, or lazy loading before abandoning an approach.

---

## Token Catalog

While scanning in Step 2, note every auth value found:

1. Embedded JSON in `<script>` tags (tokens in SSR data)
2. Hidden inputs: `<input type="hidden">`
3. Meta tags: `<meta name="api-key">`
4. Cookies (`Set-Cookie` response headers)
5. JS globals: `window.__CONFIG__`, `window.__SESSION__`
6. **Never** call dedicated token endpoints (`/api/crumb`) — they're rate-limited. Extract from page source instead.
