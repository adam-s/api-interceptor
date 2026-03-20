---
description: "The investigative process for discovering how a website serves data. Read the source, catalog tokens, interact and watch, read the JS, follow every trail. Companion to data-transport-discovery.md."
---

> **This process discovers the internal network endpoints a website uses.** Navigate as a real user with a browser connected via WebSocket, capture traffic, and find what the site sends. Do NOT search for or use publicly documented developer APIs — intercept what the browser actually calls.

# Discovery Process

**This is how you find data.** The decision tree in `data-transport-discovery.md` classifies what transport type the data uses. This document teaches the investigative work that happens first — discovering WHERE the data lives, HOW requests are constructed, and WHAT tokens/IDs are required.

**Do this for every new domain.** Every step builds on the previous. Each discovery raises the next question. Don't stop until you can construct any request the site makes, from scratch.

**Validate against the test server first.** Before targeting a real site, run this process against the test server (`port 4444`). Each fake site — `boardshop`, `liveboard`, `streamshop`, `databoard` — uses different transports. If your approach works there, it works on real sites.

**The #1 failure mode is stopping too early.** Finding one data source is not done. You must also find: how pagination works, where auth tokens come from, what happens when you interact with the page, whether there are additional data sources (WebSocket, GraphQL) alongside the initial one. Each discovery leads to the next question — follow it.

## 1. Read the Page Source

Get the full HTML — not DOM text, the actual response body.

- Use `page.evaluate(() => document.documentElement.outerHTML)` or fetch the URL directly with the browser's cookies. **(This is the ONLY acceptable `page.evaluate()` for data discovery — reading the raw HTML source to find embedded JSON. Do NOT use `page.evaluate()` to extract rendered text, prices, listings, or any user-visible data from the DOM. That requires proof from the Transport Classification table that no network request carries it.)**
- Search for `<script type="application/json">`, `<script id="...">`, `__NEXT_DATA__`, inline JSON blobs
- Search for the actual data values visible on the page — prices, names, IDs, counts
- Traffic capture truncates large responses (often just a 2KB preview of a 500KB page). When the preview is incomplete, fetch the URL directly to get the full body

This is the most common data source on modern sites. React, Next.js, and similar frameworks embed structured JSON in the HTML for hydration. The data you need is often already there — no XHR required for the initial load.

```
Example: boardshop.example.com product listing page
  <script id="catalog-data" type="application/json">
    {"products":[{"sku":"DECK-001","name":"Street Destroyer 8.25","price":64.99,...}],
     "totalProducts":847,"pageSize":20,"currentPage":1}
  </script>
```

## 2. Catalog Every Token and Auth Value

**Do this immediately — before you need them.** Scan every source for tokens, session IDs, CSRF values, API keys, and auth headers. Document where each one lives.

**Always extract tokens from the page first, not from dedicated token endpoints.** Many sites embed tokens (crumbs, CSRF, API keys) in their HTML, cookies, or JS globals. Dedicated token endpoints (e.g., `/api/getcrumb`) are often aggressively rate-limited. If you hit the page source first, you get the token for free without burning your rate limit budget.

Sources to check (in priority order):

- **Embedded JSON in `<script>` tags:** SvelteKit, Next.js, and React apps embed tokens in server-rendered data (`<script type="application/json">`, `__NEXT_DATA__`, `data-sveltekit-fetched`)
- **HTML hidden inputs:** `<input type="hidden" id="x-csrf-token" value="...">`
- **HTML meta tags:** `<meta name="api-key" content="...">`
- **Cookies:** both request cookies and `Set-Cookie` response headers
- **JavaScript globals:** `window.__CONFIG__`, `window.__SESSION__`, `window.ytcfg`
- **Inline script assignments:** `<script>var API_TOKEN = "...";</script>`
- **Response headers:** `X-Request-Id`, `X-Session-Token`, custom headers
- **Dedicated token endpoints (LAST):** Only call `/api/crumb` or `/api/token` if the token isn't available in any of the above sources — these endpoints are frequently rate-limited

```
Example: boardshop.example.com token inventory
  CSRF token:     <input type="hidden" id="csrf" value="abc123...">
  Session ID:     Set-Cookie: _sid=def456...; Path=/; Secure
  API key:        <meta name="api-key" content="pk_live_789...">
  Cart token:     window.__CART_TOKEN__ = "ghi012..."
  Filter session: embedded JSON → filterSessionId: "jkl345..."
```

When you later need to construct a POST request, you already know where every required value lives. No guessing, no hunting mid-implementation.

## 3. Interact with the Page and Watch the Network

Click every interactive element. After each interaction, check what network requests fired.

- **Click:** Load More, Show All, Next Page, pagination buttons
- **Scroll:** to the bottom — triggers infinite scroll / lazy loading
- **Filter/Sort:** change dropdowns, checkboxes, search within results
- **Expand:** accordion sections, "See details", hover tooltips

After each interaction:

1. Check `/browser/traffic` for new requests
2. Read the **request payload** — find pagination params (`page`, `offset`, `cursor`, `CurrentPage`, `PageSize`), filter params, sort params
3. Read the **response** — confirm data shape, count items, look for `hasMore`, `remaining`, `totalCount`, `nextCursor`
4. Compare: does the response shape match the initial embedded data? (It often differs — pagination responses may use a flatter structure)

```
Example: boardshop.example.com "Load more boards" button
  Triggers: POST /boards/catalog (same page URL)
  Request:  {"page":2,"pageSize":20,"sort":"price_asc","filterSessionId":"jkl345...","csrf":"abc123..."}
  Response: {"items":[...],"remaining":807,"totalCount":847}
  Note: response has "items" at top level, not nested under "catalog" like the initial page
```

**APIs silently fail.** An empty response doesn't mean "endpoint doesn't exist" — it usually means "missing a required parameter." HTML instead of JSON means wrong headers or missing session. Always read every response carefully.

**Page size limits are undocumented.** Always test with the site's default page size first. Requesting a larger page size often returns empty results with no error message.

## 4. Read the Site's JavaScript

Fetch the JS bundles and analyze how the frontend constructs requests.

- Find all `<script src="...">` tags, fetch the bundle URLs
- Search for **string anchors:** endpoint URLs, field names from the data, parameter names you found in request payloads
- Find the **request builder functions** — the code that constructs each API call
- **Trace values backwards:** for each parameter in a request, find where it comes from — a previous response, a cookie, embedded HTML, a computed value, a decoded blob

```
Example: boardshop.example.com JS bundle search
  Search for "filterSessionId" → found in:
    function loadMoreBoards(page) {
      const csrf = document.getElementById('csrf').value;
      const session = window.__CATALOG_STATE__.filterSessionId;
      return fetch('/boards/catalog', {
        method: 'POST',
        headers: {'Content-Type':'application/json', 'X-CSRF': csrf},
        body: JSON.stringify({page, pageSize: 20, filterSessionId: session})
      });
    }

  Now we know: csrf comes from DOM hidden input, filterSessionId comes from
  window.__CATALOG_STATE__ which was set during hydration from the embedded JSON.
```

Find decoders and transformers: search for `atob`, `JSON.parse`, `decode`, `decompress`, `protobuf`, `msgpack` near data field names. Sites that encode their API responses have decoder functions in the JS bundles.

## 5. Discover GraphQL APIs

Many modern sites use GraphQL as their primary API. GraphQL uses a single endpoint for all queries, making it both easy to find and rich to explore.

How to identify GraphQL:

- **Check traffic** for `POST` requests to URLs containing `graphql` or `gql`
- **Read request bodies** — GraphQL requests have `operationName`, `query` or `extensions.persistedQuery`, and `variables`
- **Check request headers** — look for `Client-ID`, `Authorization`, custom auth headers. These are the required tokens to replay queries.

Two query styles:

1. **Inline queries** — the full GraphQL query string is in the request body's `query` field. You can modify and replay these freely.
2. **Persisted queries** — the request sends a `sha256Hash` instead of the full query. You can only replay with known hashes. To discover more operations, search the JS bundles for `sha256Hash` or `operationName` strings.

Key discovery steps:

- Capture several GQL requests from normal page navigation — each reveals operations the site uses
- Note ALL request headers (auth tokens, session IDs, device IDs) — you need these to replay
- GQL requests are often **batched** — a single POST with a JSON array of multiple operations
- Search JS bundles for `operationName` to find all available queries, even ones not triggered during navigation

```
Example: boardshop.example.com GraphQL API
  Endpoint: POST https://gql.boardshop.example.com/graphql
  Auth: Client-ID header (public, hardcoded in page source)

  Operations found:
    ProductSearch(query: "deck", limit: 20)     → products with prices, images
    ProductDetail(sku: "DECK-001")              → full product info, reviews
    UserCart(userId: "...")                       → cart contents
    StoreInventory(storeId: "NYC-01")           → stock levels

  Persisted query: extensions.persistedQuery.sha256Hash = "a1b2c3..."
  Found 47 more operation hashes by searching JS bundles for "sha256Hash"
```

## 6. Discover Media Streams (HLS, WebRTC, DASH)

Sites that deliver video or audio use specialized protocols. These are NOT captured by XHR/Fetch traffic — they use their own delivery mechanisms.

How to find media streams:

- **Search HTML/JS for** `.m3u8` (HLS), `.mpd` (DASH), `MediaSource`, `RTCPeerConnection` (WebRTC), `getUserMedia`
- **Check `<link rel="preconnect">` tags** — these reveal CDN domains for media delivery
- **Look for access token endpoints** — most streams require a token before you can access the playlist. The token is usually obtained from a REST or GraphQL API.

Common media delivery chain:

1. **Get access token** — via API call (REST or GraphQL), returns a signed token + signature
2. **Request master playlist** — send token to a playlist service (e.g., `usher.domain.com/hls/{channel}.m3u8?sig=...&token=...`)
3. **Master playlist lists quality variants** — 1080p60, 720p, 360p, audio-only, each with its own playlist URL
4. **Variant playlists list video segments** — `.ts` files, typically 2-4 seconds each, on a CDN

```
Example: boardshop.example.com live product demo stream
  Token: POST /api/stream/access → {signature: "abc...", token: "{channel_id:1,expires:...}"}
  Master playlist: GET https://video.boardshop.example.com/hls/live-demo.m3u8?sig=abc&token=...
  Returns:
    #EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080
    https://cdn.boardshop.example.com/v1/playlist/1080p.m3u8
    #EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720
    https://cdn.boardshop.example.com/v1/playlist/720p.m3u8
    #EXT-X-STREAM-INF:BANDWIDTH=160000,CODECS="mp4a.40.2"
    https://cdn.boardshop.example.com/v1/playlist/audio.m3u8

  Discovery chain: API token → usher/playlist service → CDN segments
```

**Multi-protocol sites are common.** A single page may use GraphQL for data, WebSocket for chat/events, and HLS for video — all simultaneously. Run the full discovery process for each transport independently. The same auth tokens (Client-ID, session cookies) often apply across all protocols.

## 7. Discover WebSocket Streams

Many sites use WebSocket connections for real-time data — prices, scores, notifications, chat, live counts. WebSocket discovery requires a different approach than REST because **CDP traffic capture only captures XHR/Fetch — it does NOT capture WebSocket frames.**

How to find WebSocket endpoints:

- **Read the JS bundles** — search for `wss://`, `new WebSocket(`, `WebSocket(`. The endpoint URL is in the code.
- **Check for protobuf** — if the page loads `protobufjs` or similar, the WebSocket likely uses binary protobuf frames, not JSON. Search the JS for `.decode(`, `.encode(`, `protobuf.roots`.
- **Check for custom elements** — sites that stream data often have custom DOM elements that receive updates (e.g., `<live-price>`, `<stream-value>`). Find them with `document.querySelectorAll('[data-field]')` or similar attribute queries.
- **Connect directly** — once you find the `wss://` URL, connect with a plain WebSocket client. Send a subscription message (found in the JS bundle). Read the frames.

Decoding WebSocket messages:

1. If frames are JSON text — read them directly
2. If frames are binary — check the JS bundles for protobuf schema names (e.g., `protobuf.roots.default.quotefeeder`)
3. If the outer frame is JSON wrapping base64 — decode the base64 to get the inner binary, then decode protobuf
4. For quick protobuf exploration without a schema: field 0 = wire type tells you the format (0=varint, 2=string/bytes, 5=float32). Readable strings in the binary often reveal the symbol/ID.

```
Example: boardshop.example.com real-time inventory WebSocket

  Found in JS bundle: new WebSocket("wss://stream.boardshop.example.com/inventory")
  Protobuf loaded: <script src="protobuf.min.js">
  Schema in bundle: protobuf.roots.default.inventoryUpdate

  Subscription: ws.send(JSON.stringify({subscribe: ["DECK-001", "DECK-002"]}))

  Frames received: {"type":"inventory","message":"CghERUNLLTAwMRUAAMhB..."}
  Decoded: {field_1: "DECK-001", field_2_float: 25.0, field_3: 1711234567}
  Meaning: SKU "DECK-001", 25 units in stock, timestamp

  DOM target: <live-inventory data-sku="DECK-001" data-field="stockCount">25</live-inventory>
  The WebSocket updates these elements in real time.
```

**Key limitation:** Our `/browser/traffic` endpoint does NOT capture WebSocket frames. You must connect directly to the WebSocket endpoint or intercept via `page.on('websocket')` in Patchright. Always check for WebSocket URLs in the JS bundles even when traffic capture shows nothing interesting.

## 8. Document the DOM

Map every data-bearing DOM element alongside the JSON structures and API endpoints. The DOM is part of the API — it's where tokens live, where data renders, and where you can triangulate that your extracted data matches what the user sees.

What to map:

- **Custom elements** — sites use custom tags for live data (e.g., `<live-price data-field="price" data-sku="DECK-001">`). Query: `document.querySelectorAll('[data-field]')`. Group by `data-field` to see all tracked data types.
- **Data-testid attributes** — `[data-testid]` elements mark stable, testable UI sections. These are reliable selectors that survive CSS class changes.
- **Hidden inputs** — token sources: `document.querySelectorAll('input[type=hidden]')`
- **Data attributes on containers** — `data-symbol`, `data-id`, `data-category` etc. reveal the relationship between DOM sections and data entities.

For each element, document:

| Property | Why it matters |
|----------|---------------|
| **Selector** | How to find it: `[data-testid="price"]`, `[data-field="stockCount"]` |
| **Tag name** | Standard (`span`, `div`) or custom (`live-price`, `fin-streamer`) |
| **Data attributes** | `data-field`, `data-sku`, `data-value`, `data-symbol` — maps element to data |
| **Text content** | The rendered value the user sees |
| **Parent context** | What section/container it belongs to |

```
Example: boardshop.example.com DOM map

  Custom elements (live-inventory): 48 elements
    data-field="stockCount": 24 elements, skus: [DECK-001, DECK-002, ...]
    data-field="price":      24 elements, skus: [DECK-001, DECK-002, ...]
    Sample: <live-inventory data-sku="DECK-001" data-field="price" data-value="64.99">$64.99</live-inventory>

  Data-testid elements:
    "product-grid"     → <section> — main product listing container
    "product-card"     → <div> — individual product (repeated)
    "product-price"    → <span> — price display within card
    "cart-count"       → <span> — header cart item count
    "filter-panel"     → <aside> — sidebar filters

  Hidden inputs:
    <input type="hidden" id="csrf" value="abc123...">
    <input type="hidden" name="cart-token" value="ghi012...">

  Triangulation: embedded JSON has {price: 64.99} for DECK-001
    DOM shows <live-inventory data-value="64.99">$64.99</live-inventory>
    WebSocket updates this element when stock/price changes
    All three sources agree → data model confirmed
```

This DOM map serves three purposes: (1) confirms the data model by triangulation, (2) identifies token sources for request construction, (3) provides stable selectors if DOM extraction is ever needed as a fallback.

## 9. Follow Every Trail

Each discovery raises the next question. Follow it.

- A token in request N came from response N-1
- A session ID came from a cookie set during the initial page load
- A category ID came from embedded JSON in the HTML
- An auth header was computed from a value in a previous response plus a timestamp
- A product ID in the URL was extracted from a search result's `href`

**Don't stop until you can construct any request from scratch.** If there's a parameter you don't understand, trace it. If a response has a field you haven't seen used, note it — it may be needed later for a different endpoint.

## 10. Document as You Go

Every finding gets logged immediately. The discovery output is a complete map:

| What to document | Where to find it |
|-----------------|-----------------|
| **JSON data structures** | Embedded `<script>` tags, API responses |
| **HTML landmarks** | Script tag IDs, hidden inputs, meta tags, data attributes |
| **Token sources** | Where each required auth/session value lives |
| **Endpoint signatures** | URL, method, required headers, body shape, response shape |
| **Pagination mechanism** | Params, limits, response shape differences from initial load |
| **Selector paths** | Element IDs, class patterns, relationships between DOM elements and data |

HTML markup IS part of the API. Element IDs, hidden inputs, and data attributes are token sources and data extraction points. Document them alongside the JSON structures and endpoints — they provide triangulation when values in the data match values in the DOM.

```
Example: boardshop.example.com complete endpoint map

## Search
  GET /search?q=X → <script id="search-data"> → {results:[{sku,name,price,url}], total, page}
  Pagination: included in embedded JSON, no separate request needed for page 1

## Product Catalog
  GET /boards/performer/ID → <script id="catalog-data"> → {products:[...], totalProducts, pageSize, filterSessionId}
  Pagination: POST /boards/catalog → {page, pageSize, filterSessionId, csrf}
  Response: {items:[...], remaining, totalCount} — items at TOP LEVEL, not nested
  Auth: csrf from <input id="csrf">, filterSessionId from initial embedded JSON

## Product Detail
  GET /board/SKU → <script id="product-data"> → {sku, name, price, specs, variants, reviews}
  No pagination needed — single product

## Token Inventory
  csrf:             <input type="hidden" id="csrf">        — refreshes each page load
  filterSessionId:  embedded JSON → filterSessionId         — per-session, from initial GET
  _sid cookie:      Set-Cookie on initial page load          — persistent session
```

## 11. Produce the Transport Classification Table

**This process is not complete until you produce the Transport Classification table from `data-transport-discovery.md` Step 4 in the conversation.** The table is the mandatory output of discovery. No table = no extraction code. Go back to `data-transport-discovery.md` and fill in every row before writing any fetcher or route code.
