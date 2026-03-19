---
description: "THE MOST IMPORTANT RULE — systematic protocol to classify data transport (WebSocket, GraphQL, gRPC, SSE, JSON, Encoded, SSR). Interception ALWAYS over extraction."
---

# Data Transport Discovery Protocol

**This is the most important rule in the project.** The entire point of api-interceptor is to intercept the real APIs that websites use internally — not to scrape HTML. Every route must use the correct extraction technique, and the only way to determine the correct technique is systematic observation.

**The Golden Rule:** If ANY network request carries the data — even encoded, even obfuscated, even binary — the route MUST intercept that request. DOM extraction is the absolute last resort, only for data that literally does not exist in any network response.

**Before classifying, you must investigate.** The decision tree below tells you what transport type the data uses. But first you must FIND the data. See `.claude/rules/discovery-process.md` for the investigative process — read the source, catalog tokens, interact with the page, trace values backwards.

## The Decision Tree

**Run this protocol FOR EACH data type on a page** (prices, listings, search results, availability, etc.). A single page can use multiple transports — prices via WebSocket, listings via XHR, metadata via SSR.

### Step 1: Capture All Network Traffic

```
Connect browser via WebSocket (CDP capture is ONLY active on WS-connected browsers).
Navigate to the target page.
Wait 15 seconds — covers hydration, lazy loads, and deferred API calls.
Fetch /browser/traffic — inspect ALL entries.
```

### Step 2: Classify Transport — Check in This EXACT Order

The order matters. Higher-priority transports are checked first. **Never skip to (g) without proving (a)–(f) are empty.**

**Each check requires real investigation, not a glance.** "Check for JSON API" means read the full HTML source, search every `<script>` tag, search for data values visible on the page, and read the response bodies of every XHR. Don't just skim traffic entries — read the actual payloads.

| Priority | Check | Transport Type | Route Approach |
|----------|-------|---------------|----------------|
| **(a)** | WebSocket frames in traffic? (`ws://` or `wss://` connections). **CDP does NOT capture WebSocket frames** — search JS bundles for `wss://`, `new WebSocket(`, `WebSocket(` | **WebSocket** | Intercept WS frames, replay subscription |
| **(b)** | Requests to `/graphql` or body contains `query`/`mutation`? | **GraphQL** | Proxy the GraphQL query with captured variables |
| **(c)** | Content-Type `application/grpc-web`? | **gRPC-Web** | Decode protobuf, proxy the RPC call |
| **(d)** | Content-Type `text/event-stream`? | **Server-Sent Events** | Subscribe and relay the event stream |
| **(e)** | XHR/Fetch with `application/json` response containing the data? | **JSON API** | Type A proxy — `browserFetch()` or `targetUrl` |
| **(e2)** | HTML response contains `<script type="application/json">`, `<script id="...">`, `__NEXT_DATA__`, or inline JSON blobs with the data? **This is the most common transport on modern sites** (React, Next.js, SSR frameworks). Search the full page source for actual data values visible on the page. | **Embedded JSON** | Parse JSON from HTML, proxy pagination POST if applicable |
| **(f)** | XHR/Fetch with non-JSON body (binary, base64, encoded, compressed, or unfamiliar format)? | **Encoded API** | ⚠️ **DECODE IT** — see Step 3 below. **NEVER skip to (g).** |
| **(g)** | ZERO relevant network requests after 15s wait | **SSR / Document** | Type B — DOM extraction via `page.evaluate()` |

### Step 2 Validation Gate

Before accepting classification (g) SSR, you MUST confirm:

1. **No loading indicators appeared.** If the page showed a spinner, skeleton, or "Loading..." at any point, the data loaded via XHR but you missed it. Increase wait time to 20–30s and re-capture.
2. **No requests were filtered out.** The CDP listener only captures XHR/Fetch types. Check if the site uses `<script>` tags that fetch data, `<link rel="preload">` for JSON, or `<iframe>` postMessage patterns.
3. **The page actually has content.** If the page is blank or shows an error, the issue is page loading, not transport classification.

**If you cannot confirm all three, do NOT classify as SSR. Go back to Step 1 with longer waits and broader capture.**

### Step 3: Encoded API Decode Protocol (Priority f)

This is the critical case. The data IS in the network response — it's just not plain JSON. This happens with:

- **Base64-encoded JSON** — decode with `atob()` / `Buffer.from()`
- **Protocol Buffers (protobuf)** — decode with proto definition from JS bundles
- **MessagePack** — decode with msgpack library
- **Custom compression** — gzip/brotli/deflate on top of JSON
- **Obfuscated/encrypted** — site-specific encoding, keys in JS bundles
- **Mixed formats** — JSON with base64-encoded nested fields

**Decode procedure:**

```
1. Save the raw XHR response body
2. Download the site's JS bundles (main, vendor, chunk files)
3. Search bundles for string anchors — field names visible in the UI
   (e.g., if you see "Section 101" on the page, search for "section", "Section")
4. Trace the transformation chain:
   Rendered UI value → React component → data transform → API response parser
5. Identify the encoding and write a decoder
6. Verify: decoded output contains the same values visible in the UI
7. Implement the decoder in the route handler
```

**You are NEVER done at "the response is encoded." That's where the real work starts.**

### Step 4: Log the Classification

Before writing any route, produce this log in the conversation:

```
## Transport Classification: [domain]
| Data Type | Transport | Endpoint | Evidence |
|-----------|-----------|----------|----------|
| search    | JSON_API  | POST /api/v1/search | 200 response with results array |
| events    | SSR       | (document) | zero XHR after 15s, no loading state |
| tickets   | ENCODED_XHR | POST /api/explore/v1/listings | binary response, protobuf |
| prices    | WEBSOCKET | wss://prices.example.com | real-time price frames |
```

**This table is a MANDATORY gate. No routes without it. Any row with transport=SSR must have evidence confirming Steps 2g validation.**

## Validate Against the Test Server

Before targeting a real site, validate your discovery approach against the test server (`pnpm --filter @interceptor/test-server start` on port 4444). Each site demonstrates a different transport pattern:

| Test Server Site | Transport Pattern | What It Validates |
|-----------------|-------------------|-------------------|
| `/boardshop` | Embedded JSON + POST pagination | (e2) classification, CSRF tokens, silent page size limits |
| `/liveboard` | WebSocket + protobuf (base64) | (a) classification, binary decode, crumb token auth |
| `/streamshop` | GraphQL + HLS + IRC WebSocket | (b) classification, persisted queries, media chain |
| `/databoard` | gRPC-Web + encoded responses | (c) and (f) classification, protobuf/msgpack/base64 decode |

If your discovery process works against the test server, it will work against real sites. If it fails on the test server, fix it before wasting time on a real site.

## Common Mistakes This Protocol Prevents

1. **Seeing "no JSON traffic" and jumping to DOM extraction** when the site uses encoded XHR → Protocol forces checking (f) before (g)
2. **Checking only the initial page load** when data loads lazily after hydration → Protocol requires 15s wait
3. **Classifying per-site instead of per-data-type** when a page is hybrid → Protocol runs per data type
4. **Falling back to DOM extraction because decoding "looks hard"** → Protocol makes decode mandatory for (f), with explicit procedure
5. **Missing WebSocket or GraphQL transports** because only checking for REST → Protocol checks all transports in priority order
