---
description: "The investigative process for reverse-engineering how a website serves data. Read the source, catalog tokens, interact and watch, read the JS, follow every trail. Companion to data-transport-discovery.md."
---

# Discovery Process

**This is how you find data.** The decision tree in `data-transport-discovery.md` classifies what transport type the data uses. This document teaches the investigative work that happens first — the reverse engineering that discovers WHERE the data lives, HOW requests are constructed, and WHAT tokens/IDs are required.

**Do this for every new domain.** Every step builds on the previous. Each discovery raises the next question. Don't stop until you can construct any request the site makes, from scratch.

## 1. Read the Page Source

Get the full HTML — not DOM text, the actual response body.

- Use `page.evaluate(() => document.documentElement.outerHTML)` or fetch the URL directly with the browser's cookies
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

Sources to check:

- **HTML hidden inputs:** `<input type="hidden" id="x-csrf-token" value="...">`
- **HTML meta tags:** `<meta name="api-key" content="...">`
- **HTML data attributes:** `<div data-session-id="...">`
- **Cookies:** both request cookies and `Set-Cookie` response headers
- **JavaScript globals:** `window.__CONFIG__`, `window.__SESSION__`
- **Inline script assignments:** `<script>var API_TOKEN = "...";</script>`
- **Response headers:** `X-Request-Id`, `X-Session-Token`, custom headers

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

Fetch the JS bundles and reverse-engineer how the frontend constructs requests.

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

## 5. Follow Every Trail

Each discovery raises the next question. Follow it.

- A token in request N came from response N-1
- A session ID came from a cookie set during the initial page load
- A category ID came from embedded JSON in the HTML
- An auth header was computed from a value in a previous response plus a timestamp
- A product ID in the URL was extracted from a search result's `href`

**Don't stop until you can construct any request from scratch.** If there's a parameter you don't understand, trace it. If a response has a field you haven't seen used, note it — it may be needed later for a different endpoint.

## 6. Document as You Go

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
