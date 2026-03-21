> **GATE: Complete this protocol and produce the Transport Classification table BEFORE writing any extraction code. No table = no code.**

# Discovery Protocol

Discover endpoints by navigating as a real user and capturing browser traffic. Do NOT search for public APIs, scraping guides, or external documentation. The ONLY valid source is captured traffic from `/browser/traffic`.

## The Decision Tree

Follow this tree top-to-bottom. At every branch, take the cheapest path that works. Never retry a failed path if a cheaper alternative already has the data.

```
STEP 1: Fetch target URL with rateLimitedFetch
        ├── 200 → go to STEP 2
        ├── 429/202 → try browserFetch ONCE
        │            ├── 200 → go to STEP 2 (mark: needs browser)
        │            └── fail → try homepage instead, go to STEP 1
        └── other error → bail

STEP 2: Search HTML for embedded JSON
        Check: __NEXT_DATA__, data-deferred-state, data-sveltekit-fetched,
        <script type="application/json">, ytInitialData, window.__DATA__
        ├── FOUND → extract it. This is your data.
        │           DO NOT call any API for this same data.
        │           Go to STEP 3.
        └── NOT FOUND → this is a SPA. Go to STEP 4.

STEP 3: Do you need more data? (pagination, detail pages, other types)
        For each additional data need:
        ├── Different PAGE on same site?
        │   ├── rateLimitedFetch → 200? Parse embedded JSON.
        │   ├── 429/202? browserFetch raw HTML → parse embedded JSON.
        │   └── Both fail? Use homepage data. Don't fight WAF.
        ├── Pagination of same page?
        │   └── Check embedded JSON for cursor/page/offset params.
        │       Try next URL with rateLimitedFetch.
        └── Different data type (real-time, streaming)?
            └── Go to STEP 4 for this data type only.

STEP 4: Connect browser, capture traffic
        Wait 15 seconds. Check /browser/traffic.
        ├── GraphQL? → Extract auth (Client-ID, etc) from page source.
        │               rateLimitedFetch → 200? Done.
        │               429? → browserFetch. Done.
        ├── WebSocket? → Note URL from JS bundles. Build WS route.
        ├── JSON API? → rateLimitedFetch → 200? Done.
        │               429? → Same data in embedded JSON?
        │                      ├── YES → use embedded JSON. STOP.
        │                      └── NO → browserFetch. Done.
        └── Nothing? → Interact (click, scroll). Re-check traffic.
```

**Critical rule:** If embedded JSON has data X, NEVER call an API for data X. One 429 is enough signal — escalate or use embedded JSON. Never retry.

## Framework Identification

Check the HTML source for these markers — they tell you where data lives:

| Marker | Framework | Data location |
|--------|-----------|--------------|
| `__NEXT_DATA__` or `/_next/` | Next.js | `<script id="__NEXT_DATA__">`, often with Redux/RTK Query state |
| `data-sveltekit-fetched` | SvelteKit | `<script data-sveltekit-fetched>` — JSON envelope, double-parse |
| `data-deferred-state` | Custom SSR | `<script id="data-deferred-state-0">` — deep nested arrays |
| `__NUXT_DATA__` | Nuxt | `<script id="__NUXT_DATA__">` or `/_payload.json` |
| `data-reactroot` (no `__NEXT_DATA__`) | React SPA | No embedded data — all data in traffic (STEP 4) |
| `__remixContext` | Remix | Loader data in `<script>` tags |

## Catalog Tokens

Scan every source for auth values BEFORE you need them:

1. Embedded JSON in `<script>` tags (tokens embedded in SSR data)
2. Hidden inputs: `<input type="hidden">`
3. Meta tags: `<meta name="api-key">`
4. Cookies (request + `Set-Cookie` response headers)
5. JS globals: `window.__CONFIG__`, `window.__SESSION__`
6. **Last:** dedicated token endpoints (`/api/crumb`) — often rate-limited

## Working Examples

Every transport type has a working route in `domains/boardshop/src/routes.ts`:

| Transport | Routes | Pattern |
|-----------|--------|---------|
| Embedded JSON | 1-2, 15-16, 20-21 | Standard, Next.js Redux, deferred state, hydration-stripped, SvelteKit |
| JSON API | 4-7, 12, 17 | Cursor pagination, CSRF POST, API key, custom headers, crumb auth, ?method= |
| GraphQL | 8 | Inline query with Client-ID header |
| HLS media | 9 | Token → master playlist → quality variants |
| Encoded API | 10-11 | Base64 JSON, MessagePack binary |
| WebSocket | 13-14 | JSON frames, protobuf frames |
| Rate-limit fallback | 19 | API returns 429, fall back to embedded JSON |

## Produce the Transport Classification Table

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

**This table is mandatory. No routes without it.** Evidence must come from captured traffic or page source analysis — never from external research.
