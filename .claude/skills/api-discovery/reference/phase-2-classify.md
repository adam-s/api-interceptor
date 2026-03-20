# Phase 2: Classify the Data Source

**⚠️ Classification is per-ENDPOINT, not per-site.** A single site can be SSR for search results and API-driven for ticket inventory. You MUST classify each page/endpoint independently. Do not assume that because one page is SSR, all pages on that site are SSR.

Compare what you SEE on the page vs what CDP CAPTURED.

| Type | Signal | Approach |
|------|--------|----------|
| **A: JSON API** | Traffic contains the visible data | Proxy routes for XHR/Fetch endpoints |
| **B: SSR** | Traffic empty after 15s; data is in initial HTML; Steps 2g validation from `data-transport-discovery.md` ALL pass | Extract from DOM via `page.evaluate()` — **LAST RESORT ONLY, requires proof** |
| **C: Hybrid** | Page 1 SSR; pagination triggers API calls | SSR for page 1, `browserFetch` for page 2+ |
| **D: Bot-Protected** | `captcha-delivery.com` or `datadome` in body HTML | Return structured 403 (see below) |
| **B3: SSR-Embedded JSON** | Page renders data via interactive widgets (maps, modals, canvases) but `innerText` has zero matches. HTML response body contains JSON. | Use CDP `Network.getResponseBody` on the HTML response to extract the embedded JSON blob |
| **E: Fresh Browser** | Persistent context pages get 401/captcha on detail pages, but fresh `chromium.launch()` passes | Launch temporary browser per-request, intercept API via `page.on('response')`, close after |

**Type D CAPTCHA gate protocol:** Return `{ blocked: true, captchaRequired: true, browserUrl: '/browser?profile=<domain>&capture=<domain>', message: 'Pass the challenge at /browser to unlock this source' }` with HTTP 403. Dashboard detects `captchaRequired` and shows an alert with a link to `/browser` where the user can pass the challenge manually. Profile cookies persist after the challenge — subsequent requests from that profile succeed.

**Confirm SSR:** Search the initial HTML for data patterns — if prices/items are in the HTML, it's SSR.

**Discover pagination APIs:** Click "Load more" or "Next page" and watch for new API calls in the traffic buffer.

## Per-Endpoint Classification Gate (MANDATORY)

Before writing a DOM extraction route for ANY data type, you must prove the data actually exists in the DOM:

1. Navigate to the page that will serve this data
2. Run: `page.evaluate(() => document.body.innerText)` and search for the specific data you need (prices, section names, listings, etc.)
3. Count the matches. Paste the count as proof.
4. If count = 0, or the DOM shows "Loading..." / spinner placeholders, this endpoint is **NOT SSR** — the data arrives via API
5. Check captured traffic for the API calls that deliver this data

**GATE: You must paste proof that the DOM contains the target data before writing a Type B extraction route. "Loading..." or zero matches = the data comes from an API. Write a Type A route instead.**

**Common trap — cross-page:** A site's search page renders results in HTML (Type B), so you assume the detail/listing page is also SSR. But the detail page loads its data via XHR after the initial HTML loads. The DOM shows a loading spinner while the API call completes. If you write DOM extraction code without checking, you get zero data and waste time debugging the wrong layer.

**Common trap — visible ≠ extractable:** Data may be visible on the page (numbers on a map, prices on hover, counts in a widget) but NOT present in `document.body.innerText`. Interactive widgets render data via canvas, SVG, or JS overlays — not DOM text nodes. When `innerText` returns zero matches but the page clearly shows data: (1) check the HTML response body with CDP `Network.getResponseBody` for embedded JSON (Type B3), (2) check `page.on('response')` for XHR calls that delivered the data after page load (Type A).

**Common trap — anti-bot varies by page type within the same site:** Search and listing pages are often less protected than detail pages (product pages, checkout, pricing). If a persistent browser page gets 401/captcha on a detail page but works on listing pages, try a fresh `chromium.launch()` instance (Type E). Anti-bot escalates with page value — the more commercially sensitive the data, the harder the challenge.

**Common trap — same page:** Even a single page can be hybrid. The page shell, event title, date, and venue render via SSR (they're in the initial HTML), but the primary data — prices, inventory, ticket listings — loads via XHR after the page renders. The DOM shows the event name immediately but shows "Loading..." where ticket data will appear. Always check for the SPECIFIC data you need, not just whether the page has any content at all.

## Pagination Awareness

Pagination affects data completeness. After extracting page 1, always check for more data:

1. **API params** — look for `offset`, `limit`, `page`, `cursor`, `after` in the intercepted API URL
2. **"Show more" / "Load more" buttons** — clicking triggers new API calls visible in traffic
3. **Infinite scroll** — scrolling to bottom triggers new requests; watch for `IntersectionObserver` patterns
4. **"Showing N of M" text** — compare extracted count to total; if N < M, pagination exists
5. **Response metadata** — `total`, `totalPages`, `hasMore`, `nextCursor` fields in API response

Document the pagination type and total vs extracted count in every route response. If extraction returns significantly fewer items than the page claims exist, the route is incomplete.
