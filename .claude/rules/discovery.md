> **GATE: Complete this protocol and produce the Transport Classification table BEFORE writing any extraction code. No table = no code.**

# Discovery Protocol

Discover endpoints by navigating as a real user and capturing browser traffic. Do NOT search for public APIs, scraping guides, or external documentation. The ONLY valid source is captured traffic from `/browser/traffic`.

## Step 0: Identify the Framework

Check the HTML source for these markers — they tell you where data lives:

| Marker | Framework | Data location |
|--------|-----------|--------------|
| `__NEXT_DATA__` or `/_next/` | Next.js | `<script id="__NEXT_DATA__">`, `/api/` routes |
| `data-sveltekit-fetched` | SvelteKit | `<script type="application/json" data-sveltekit-fetched>` |
| `__NUXT_DATA__` | Nuxt | `<script id="__NUXT_DATA__">` or `/_payload.json` |
| `data-reactroot` (no `__NEXT_DATA__`) | React SPA | XHR after hydration — all data in traffic |
| `__remixContext` | Remix | Loader data in `<script>` tags |

## Step 1: Connect Browser and Capture Traffic

```bash
./scripts/connect-browser.sh --profile <domain> --url <target-url>
# Wait 15 seconds for hydration, lazy loads, deferred API calls
./scripts/capture-traffic.sh --summary
```

The auto-started browser does NOT capture traffic — only WS-connected browsers do. Read the full page source for embedded JSON (`<script type="application/json">`).

## Step 2: Classify Transport — Check in This EXACT Order

Run this FOR EACH data type on the page. One page can use multiple transports.

| Priority | Check | Transport | Route approach |
|----------|-------|-----------|----------------|
| **(a)** | WebSocket? CDP doesn't capture WS frames — search JS for `wss://`, `new WebSocket(` | WebSocket | Intercept WS frames. See `domains/boardshop/src/routes.ts` ws-example route |
| **(b)** | Requests to `/graphql` or body has `query`/`mutation`? | GraphQL | Proxy the query. See `domains/boardshop/src/routes.ts` graphql-example route |
| **(c)** | Content-Type `application/grpc-web`? | gRPC-Web | Decode protobuf. See `domains/boardshop/src/routes.ts` encoded-example route |
| **(d)** | Content-Type `text/event-stream`? | SSE | Subscribe and relay |
| **(e)** | XHR/Fetch with JSON response containing the data? | JSON API | Proxy with `rateLimitedFetch` or `browserFetch` |
| **(e2)** | HTML contains `<script type="application/json">` with the data? | Embedded JSON | Parse JSON from HTML. See `domains/boardshop/src/routes.ts` Routes 1-2 |
| **(f)** | XHR with non-JSON body (binary, base64, encoded)? | Encoded API | **Decode it** — see `api-discovery/reference/decoding.md`. NEVER skip to (g) |
| **(g)** | ZERO relevant network requests after 15s wait | SSR | DOM extraction via `page.evaluate()` — LAST RESORT |

Before accepting (g) SSR: confirm no loading indicators appeared, no requests were filtered, and the page has content.

## Step 3: Catalog Tokens

Scan every source for auth values BEFORE you need them:

1. Embedded JSON in `<script>` tags (tokens embedded in SSR data)
2. Hidden inputs: `<input type="hidden">`
3. Meta tags: `<meta name="api-key">`
4. Cookies (request + `Set-Cookie` response headers)
5. JS globals: `window.__CONFIG__`, `window.__SESSION__`
6. **Last:** dedicated token endpoints (`/api/crumb`) — often rate-limited

## Step 4: Interact and Watch Network

**Interaction is NEVER optional — even when you found embedded JSON.** Embedded data is page 1 only. You MUST:

1. Record traffic count BEFORE interaction
2. Perform at least 3 interactions: click next page, scroll to bottom, click a result/detail link
3. Record traffic count AFTER interaction
4. Paste both counts. If count increased, classify the new endpoints

Visit at least one detail page (click a result) — detail pages often use a different transport than listing pages.

## Step 5: Read JS Bundles

Fetch `<script src="...">` bundles. Search for endpoint URLs, field names, parameter names from request payloads. Trace values backwards to find where tokens and IDs originate.

For HLS/media streams: search for `.m3u8`, `MediaSource`, `RTCPeerConnection`. See `domains/boardshop/src/routes.ts` hls-example route.

## Step 6: Produce the Transport Classification Table

```
## Transport Classification: [domain]
| Data Type | Transport | Endpoint | Evidence |
|-----------|-----------|----------|----------|
| (fill in per data type discovered above) |

## Interaction Evidence
Traffic count BEFORE interaction: ___
Interactions performed: [list at least 3]
Traffic count AFTER interaction: ___
Detail page visited: [URL]
New endpoints discovered: [list or "none"]
```

**This table is mandatory. No routes without it.** Evidence must come from captured traffic or JS bundle analysis — never from external research.
