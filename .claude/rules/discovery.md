> **GATE: Complete the FULL elimination table BEFORE writing any route code. Every transport type must be marked ✓ or ✗. No unknowns = no missing routes.**

# Discovery Protocol

Discover ALL transports a website uses by gathering evidence, scanning for markers, and classifying every transport type. Do NOT search for public APIs, scraping guides, or external documentation.

## The Algorithm: GATHER → SCAN → CLASSIFY → BUILD

Four steps. Always all four. No skipping. No building until classification is complete.

---

### STEP 1: GATHER (3-5 tool calls)

Collect ALL evidence before analyzing anything.

**1a.** Fetch the target page HTML.
- Try `rateLimitedFetch` first. If non-200, try `browserFetch` once.
- `browserFetch` returns raw pre-hydration HTML (script tags intact).
- Do NOT use `page.evaluate(document.outerHTML)` — hydration strips data.
- Save the full HTML.

**1b.** Fetch ONE different page type (detail page, search page, or channel page).
- Same approach: `rateLimitedFetch`, escalate if needed.
- Different page types often use different transports.

**1c.** Fetch the largest JS bundle (`<script src="...">` in the HTML).
- Save the content for scanning.

**1d.** Connect browser, capture LIST page traffic, then navigate to a DETAIL page and capture again.
```bash
./scripts/connect-browser.sh --profile <domain> --url <target> --port PORT
sleep 15
curl -s http://localhost:PORT/browser/traffic > /tmp/traffic-list.json
```
Now click into a specific item (product, event, video, listing, article). This is not optional — detail pages fire the site's richest APIs (pricing, inventory, availability, reviews). Scrolling on a list page does NOT count.
```bash
# After navigating to a detail/item page and waiting 10s:
curl -s http://localhost:PORT/browser/traffic > /tmp/traffic-detail.json
```

**Required output from 1d:**
- Detail page URL visited: ___
- List page traffic entry count: ___
- Detail page traffic entry count: ___
- NEW endpoints that appeared on the detail page: [list]

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

Each route has two phases. A route is NOT done after phase A.

**Phase A — Prove the endpoint works.** Get a successful first response.

For public endpoints (no Access Gap), try the cheapest approach:
1. `rateLimitedFetch` — try first if the endpoint doesn't need auth.
2. `browserFetch` — if direct HTTP returns 429/403/404/202.
3. `page.evaluate` — if browserFetch fails (CORS, timeout).

For auth-gated endpoints (Gap=Y from Access Gap table), session harvest IS the correct approach — not a fallback. Do not try `rateLimitedFetch` on endpoints you already proved require auth. Go directly to session harvest. Skipping this because it seems "expensive" means your route returns incomplete data.

**Phase B — Complete the route.** Getting the first page of data is step 1, not the finish line. Pagination is often harder than the initial request — it may require different auth, different request format, or sequential state. This is the actual work.

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

If total > items returned, the route is NOT DONE. Paginate until all items are returned. If pagination requires cookies the initial request didn't need, that is session harvest — read the reference file.

**Every ✓ row requires a route. No exceptions.** Only change ✓ to ✗ if all approaches including session harvest fail. "Bot-protected" or "signed URLs" is not ✗ — it means session harvest.

#### Session Harvest (for Gap=Y endpoints)

**STOP. Read `.claude/skills/api-discovery/reference/session-harvest.md` before writing any session harvest code.** Do not attempt session harvest without completing all three phases described in that file. Do not invent your own cookie-fetching approach — the reference file covers `Set-Cookie` harvest, JS-challenge cookies via Patchright, elimination testing, and encoded value tracing.

**Traffic replay shortcut:** The browser traffic from Step 1d already contains working requests for Gap=Y endpoints — with all required headers and cookies. Before building a harvester from scratch:
1. Find the working request in captured traffic (URL, method, headers, cookies, body)
2. Replay it from Node.js `fetch` with ALL captured values — confirm you get the same response
3. Run elimination (remove one header/cookie at a time) to find the minimum auth set
4. Build the route using the minimum set + a harvest step to obtain the required cookies

This is faster and more reliable than guessing which cookies/headers are needed.

A route that returns `{ error: "needs browser session" }` is not a route. Harvest the session and return data.

Reference: Routes 30-31 in `domains/boardshop/src/routes.ts` demonstrate both `Set-Cookie` harvest and multi-cookie harvest patterns.

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
