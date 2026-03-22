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

**1d.** Connect browser via WebSocket, wait 15 seconds, capture traffic.
```bash
./scripts/connect-browser.sh --profile <domain> --url <target> --port PORT
sleep 15
curl -s http://localhost:PORT/browser/traffic
```

**1e.** Interact with the page (click a result, scroll, click next page), then re-capture traffic.

**Output:** 2 HTML files, 1 JS bundle, traffic entries before and after interaction.

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

Fill the COMPLETE elimination table. Every row gets ✓ or ✗. No exceptions.

```
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

## Interaction Evidence
Traffic BEFORE interaction: ___
Interactions: [list at least 3]
Traffic AFTER interaction: ___
Detail page visited: [URL]
New transports found: [list or "none"]
```

**The table is not complete until every row has ✓ or ✗ with evidence.** Do NOT start building routes until this table is filled.

---

### STEP 4: BUILD (2-3 tool calls per ✓ transport)

For EACH ✓ row, build a route using the cheapest approach:

1. `rateLimitedFetch` — try first. Most endpoints work without a browser.
2. `browserFetch` — if direct HTTP returns 429/403/404/202.
3. `page.evaluate` — if browserFetch fails (CORS, timeout).
4. **Session harvest** — if all three above fail (see below).

**Every ✓ row requires a route. No exceptions.** If the cheapest approach fails, escalate to the next. Only change ✓ to ✗ if all four approaches fail. "Bot-protected" or "signed URLs" is not ✗ — it means escalate.

#### Session Harvest Escalation (when 1-3 all fail)

When `browserFetch` times out, CORS-blocks, or returns empty data, the site likely requires specific cookies/headers that only a real page visit sets. Use this approach:

**Step A — Capture a working request.** Navigate Patchright to the page, interact (click buttons, scroll), and intercept the working request via `page.on('request')`. Save the full headers + body.

**Step B — Elimination test.** Replay the request from Node.js `fetch` with all captured headers. Then remove ONE header at a time and ONE cookie at a time, checking which removals break the response. This finds the minimum auth set in ~30 seconds.

**Step C — Build a SessionHarvester.** Create a harvester in `domains/<name>/src/session.ts` using `SessionHarvester` from `@interceptor/browser`. Configure:
- `seedUrl` — the page to visit to get cookies
- `harvest` — extract the required cookies via `context.cookies()` (catches httpOnly cookies that `document.cookie` misses)
- `buildHeaders` — return only the minimum headers found in Step B

**Step D — Use plain `rateLimitedFetch` with harvested tokens.** The route calls `session.getHeaders()` and passes them to `rateLimitedFetch`. No `browserFetch` needed.

**When to suspect you need this:**
- `browserFetch` returns CORS error or times out on a cross-origin API
- `page.evaluate(fetch(...))` returns 200 but empty data
- Named pages (`getOrCreatePage`) can't replicate what the main page does
- The API needs httpOnly cookies that `document.cookie` can't read

Reference: Routes 30-31 in `domains/boardshop/src/routes.ts` demonstrate both patterns.

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

Test each route with curl (or browserFetch for WAF-protected endpoints) before building the next. Unexpected output is information, not failure — investigate encoding, localization, or lazy loading before abandoning an approach.

---

## Token Catalog

While scanning in Step 2, note every auth value found:

1. Embedded JSON in `<script>` tags (tokens in SSR data)
2. Hidden inputs: `<input type="hidden">`
3. Meta tags: `<meta name="api-key">`
4. Cookies (`Set-Cookie` response headers)
5. JS globals: `window.__CONFIG__`, `window.__SESSION__`
6. **Never** call dedicated token endpoints (`/api/crumb`) — they're rate-limited. Extract from page source instead.
