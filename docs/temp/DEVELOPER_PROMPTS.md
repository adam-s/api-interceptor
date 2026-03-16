# Developer Test Prompts

These are example prompts that a developer should be able to give to Claude Code after cloning this repository. The skills (api-discovery, dashboard-builder, visual-dev, etc.) should guide Claude Code through building each application end-to-end.

Each prompt tests different capabilities of the framework. Use these to validate that the skills are comprehensive enough.

---

## Prompt 1: Event Ticket Price Comparison

> Create domain plugins for StubHub and Ticketmaster. Discover the search API for each site so I can search by artist name. Then discover the event detail and ticket listing APIs to get available tickets with sections, rows, and prices.
>
> Build a polished dashboard page at /tickets where I type an artist name into a search box. It should:
>
> 1. Search both sites sequentially (one shared browser — never parallel). For each platform, validate that results are for the actual artist: performer/event names must contain the search query. Skip tribute bands (e.g., "Bad Bunny Tribute Experience"), theater productions, and comedy shows. If a result name doesn't closely match the artist query, discard it.
> 2. Merge events across platforms by matching normalized venue name + date. Normalize: lowercase, strip all non-alphanumeric characters, parse dates to YYYY-MM-DD. Same venue + same date = same event → one merged row with both marketplace badges. TM-only or SH-only events still show with a single badge.
> 3. When I click an event, fetch ticket listings from both marketplaces sequentially and show a seat-level comparison grid
> 4. Rows = sections (normalize names: "Section 101" = "Sec 101" = "101"), columns = StubHub | Ticketmaster
> 5. Each cell shows min price and listing count; highlight the cheapest price per section row in green
> 6. Handle errors gracefully — if a site's browser isn't connected, show that clearly without breaking the other site
>
> **Test with a major US-touring artist** like "Kendrick Lamar" or "Morgan Wallen" — someone with real upcoming US arena/stadium shows so both TM (US domain only) and StubHub return actual concerts. Avoid artists whose tours are exclusively outside the US (e.g. Bad Bunny, Taylor Swift at time of writing); TM returns US results only and will surface tribute events instead.

**What this tests:**

- Creating 2 domain plugins from scratch (1 SSR Type B, 1 hybrid Type B/B2)
- Multi-step API discovery (search → event detail → ticket listings)
- Event merging across marketplaces (same event detected by venue + date)
- Seat-level comparison grid with section name normalization
- Error resilience (marketplace failing independently)

---

## Prompt 2: Yahoo Finance Market Intelligence

> Create a `yahoo-finance` domain plugin. The app has three data layers:
>
> **1. News with sentiment — polled every 60 seconds**
> Fetch headlines for a watchlist of stock symbols using Yahoo Finance's per-ticker
> RSS feeds (no browser needed — plain HTTP):
> `https://feeds.finance.yahoo.com/rss/2.0/headline?s={TICKER}&region=US&lang=en-US`
>
> Build a server-side background poller that runs every 60 seconds, fetches RSS for
> each symbol in the watchlist (AAPL, TSLA, NVDA, MSFT, SPY), and passes new articles
> through the Python bridge for sentiment classification. Extend `services/python/worker.py`
> with a `batch_sentiment` method using VADER (`pip install vaderSentiment`). Map compound
> score to: bull (>0.05), flat (-0.05–0.05), bear (<-0.05). After each poll cycle,
> broadcast the updated article list to all connected dashboard clients via the existing
> WebSocket infrastructure. Cache each symbol's RSS response for 5 minutes to respect
> rate limits.
>
> Route: `GET /api/yahoo-finance/news?symbols=TSLA,AAPL` →
> `[{ symbol, title, summary, url, publishedAt, sentiment: "bull"|"flat"|"bear", score }]`
>
> **2. Quote + chart data — discovered via CDP**
> Navigate to `https://finance.yahoo.com/quote/TSLA` and watch CDP traffic to find the
> internal REST endpoints (likely on `query1.finance.yahoo.com` or
> `query2.finance.yahoo.com`). Discover endpoints for: current price, % change, volume,
> market cap, 52-week high/low, P/E ratio, and intraday chart data (5-min intervals).
>
> Routes (proxy through browser with inherited session headers):
> - `GET /api/yahoo-finance/quote/:symbol` → price, change, key stats
> - `GET /api/yahoo-finance/chart/:symbol?interval=5m&range=1d` → OHLC array
>
> **3. Dashboard at `/market`**
> - Left sidebar: watchlist (AAPL, TSLA, NVDA, MSFT, SPY, BTC-USD) — click to focus
> - Main panel when a symbol is focused:
>   - Quote card: price (large), change % (green/red), volume, market cap, P/E, 52w range
>   - Mini sparkline using **visx** (`@visx/sparkline` or `@visx/shape` + `@visx/scale`) — last 7 data points from chart endpoint
>   - News feed: article cards for this symbol, each with bull/flat/bear badge
> - Bottom panel: "All News" — articles from all watchlist symbols merged chronologically, each card showing its symbol badge and sentiment badge
> - Live updates: the dashboard subscribes to the server's WebSocket and re-renders when new articles arrive from the 60-second poll cycle (no manual refresh needed)
>
> Show a "last updated" timestamp and a subtle pulse indicator when a new poll cycle completes. If Yahoo rate-limits a request, show the cached value with a faint "stale" tag rather than an error.
>
> **Stretch goal — faster price refresh via SSE**
> Add a server-sent event endpoint that polls `GET /api/yahoo-finance/quote/:symbol`
> on the server every 5 seconds and streams each result as an SSE event:
> `GET /api/yahoo-finance/stream?symbols=TSLA,AAPL`
> Each event: `{ symbol, price, changePercent, volume, timestamp }`
> Wire the quote card to this SSE stream so prices update without a full page refresh.
> This tests a new server push pattern (SSE) without requiring binary protocol decoding.

**What this tests:**

- Browserless domain routes — direct `fetch()` in route handlers without Patchright navigation
- Server-side scheduled polling — background loop that exposes the framework's lack of job/timer infrastructure
- Server → client push — WebSocket broadcast driven by a real data pipeline, not a toy counter
- Python bridge NLP — extending `worker.py` with VADER sentiment analysis
- Route-level TTL caching — no caching infrastructure exists; Yahoo rate limits will surface this gap immediately
- CDP REST API discovery — `query1/query2.finance.yahoo.com` nested JSON (richer than TM ISMDS)
- Cross-source symbol linking — news + quote + chart all keyed by the same ticker
- SSE streaming (stretch) — server polls REST every 5s and pushes via SSE; new push pattern without binary decoding

---

## Prompt 3: Vacation Rental Intelligence

> Create domain plugins for **Airbnb**, **VRBO**, and **Zillow**. This prompt is
> **discovery-first**: the primary deliverable is a typed API catalog, not the UI.
>
> **Phase 1: API Catalog (the real deliverable)**
>
> For each site, navigate the search page for "Austin, TX", browse 2–3 listing detail
> pages, and capture every fetch()/XHR JSON call via CDP. Prefer `browserFetch()` over
> DOM extraction wherever a clean JSON response exists.
>
> For each discovered endpoint, produce:
>
> - The full URL pattern (with path params as `:id` placeholders)
> - HTTP method and operation name (for GraphQL)
> - Required headers (especially `X-Airbnb-API-Key` for Airbnb — extract from CDP traffic)
> - Request shape as a TypeScript interface or inline comment
> - Response shape as a Zod schema (use `.passthrough()` on deeply nested objects)
> - A one-line description of what the endpoint returns
>
> Document everything in a comment block at the top of each domain's `routes.ts`.
> Aim for at minimum: 1 search endpoint + 1 listing detail endpoint + 1 pricing/
> availability endpoint per site.
>
> **Phase 2: Routes**
>
> Implement the discovered endpoints as domain routes. Normalize all three domains to
> a shared listing schema:
>
> ```typescript
> interface Listing {
>   id: string;
>   source: 'airbnb' | 'vrbo' | 'zillow';
>   name: string;
>   lat: number;
>   lng: number;
>   nightlyRate: number;      // base nightly rate (no fees)
>   totalPrice?: number;      // total for the requested dates inc. fees
>   cleaningFee?: number;
>   rating?: number;
>   reviewCount?: number;
>   roomType?: string;
>   imageUrl?: string;
>   listingUrl: string;
> }
> ```
>
> Routes:
>
> - `GET /api/airbnb/search?location=Austin,TX&checkin=YYYY-MM-DD&checkout=YYYY-MM-DD&guests=2`
> - `GET /api/airbnb/listing/:id`
> - `GET /api/vrbo/search?location=Austin,TX&checkin=YYYY-MM-DD&checkout=YYYY-MM-DD&guests=2`
> - `GET /api/vrbo/listing/:id`
> - `GET /api/zillow/rentals?location=Austin,TX` → long-term comps (monthly rent, zpid, address)
> - `GET /api/zillow/property/:zpid`
>
> **Phase 3: Python bridge — Weekend Getaway Scorer**
>
> Add a `score_getaways` method to `services/python/worker.py`. Given a merged list of
> Airbnb + VRBO listings for a search, compute per listing:
>
> - `value_score`: `rating / (totalPrice / nights)` — higher rating per dollar = better value
> - `cross_listed`: `true` if a listing at the same lat/lng (within 80m) exists on both platforms
> - `cheaper_platform`: if cross-listed, which platform is cheaper and by how much
>
> Returns the listings sorted by `value_score` descending, with `cross_listed` and
> `cheaper_platform` fields appended.
>
> Route: `POST /api/rentals/score` with body `{ listings: Listing[], nights: number }`
>
> **Phase 4: Dashboard at `/rentals`**
>
> - Location + date range + guests search bar (default: Austin, TX / next weekend / 2 guests)
> - After search (sequential — never parallel), show a card grid sorted by value score
> - Each card: photo, name, nightly rate, total price, rating stars, source badge (Airbnb/VRBO)
> - If cross-listed: show both source badges + "Save $X on [platform]" callout in green
> - Right panel: Zillow long-term comps for the same area (monthly price, beds/baths)
> - Empty / loading / error states for all panels
>
> **Stretch goal: 10-minute mail account creation**
>
> Use the registered `minuteinbox` domain to generate a disposable email address.
> Attempt to create an Airbnb guest account with it. Document whether phone verification
> blocks completion. If an account is created, check CDP traffic for any new auth-gated
> endpoints and add them as additional routes. Expected outcome: blocked at phone step —
> record this as a gap (no SMS bridge in the framework).

**What this tests:**

- API catalog as a first-class deliverable — discovery before implementation, typed schemas from real traffic
- GraphQL proxy — Airbnb and VRBO POST GraphQL with named operations; first time the framework must forward and parse a GraphQL body
- Public API key extraction — `X-Airbnb-API-Key` pulled from CDP request headers, not assumed or hardcoded
- Shared schema across sibling domains — Airbnb and VRBO return the same conceptual data; forces a normalisation layer
- Geospatial bounding-box queries — `ne_lat/ne_lng/sw_lat/sw_lng` parameters new to the framework
- Python bridge geo-analytics — coordinate proximity matching + value scoring; first non-NLP bridge use
- Cross-domain lat/lng entity matching — same property on two platforms matched by coordinate radius
- 10-minute mail as account enabler — tests whether the minuteinbox domain can unlock auth-gated endpoints

---

## Prompt 4: Job Search Aggregator

> Create domains for LinkedIn, Indeed, Glassdoor, and Dice. Search for "senior React developer in Austin", get job postings with salary, company, and requirements from each site. Build a dashboard that deduplicates the same job posted on multiple sites and compares salary ranges. Let me save favorites and track application status.

**What this tests:**

- Search with location + keyword parameters
- Entity deduplication across sources (same job, different sites)
- Salary range parsing and normalization
- Persistent user state (favorites, application tracking)
- CRUD operations (save, update status)

---

## Prompt 5: Social Media Cross-Poster & Analytics

> Create domains for Twitter/X, LinkedIn, Bluesky, and Mastodon. Log into my accounts on each platform. Build a dashboard where I write a post once and publish it to all four platforms simultaneously. Then aggregate engagement metrics — likes, reposts, impressions — into a single view so I can see which platform performs best for each post.

**What this tests:**

- POST operations through the API proxy (publishing content)
- Authenticated write access to multiple platforms
- Polling for metrics updates over time
- Data aggregation and comparison charts
- Rich text / media handling across different API formats

---

## Prompt 6: Academic Research Aggregator

> Create domains for PubMed, Semantic Scholar, and ArXiv. Some of these may have public REST APIs — prefer using those directly over browser interception when available. Search for a research topic, collect papers with citations, abstracts, and authors. Deduplicate papers that appear in multiple databases. Build a literature review dashboard that shows citation networks and identifies the most influential papers in a field.

**What this tests:**

- Hybrid approach: direct API calls (ArXiv, Semantic Scholar have public APIs) vs browser interception (PubMed may need it)
- Domain plugins that use direct fetch instead of browserFetch when possible
- Citation graph traversal (follow references)
- Entity resolution (same paper across databases)
- Data visualization (citation network graph)

---

## Prompt 7: Government & Public Records Monitor

> Create domains for SEC EDGAR, my state's business registry, county property records, and the federal court docket system (PACER). Search by company name, aggregate all filings, registrations, and court cases. Build a due diligence dashboard that shows a timeline of all activity and alerts me when new filings appear.

**What this tests:**

- Server-side rendered sites with no client-side API (worst case for interception)
- Session-based auth with CAPTCHAs (PACER)
- Scheduled monitoring (check for new filings periodically)
- Timeline/chronological data visualization
- PDF document handling (SEC filings, court documents)
- The compelling "why browser interception matters" story — these sites resist automation

---

## How to Use These Prompts

1. Clone the repository
2. Run `pnpm install && pnpm run dev`
3. Open Claude Code (CLI or VS Code extension)
4. Paste one of the prompts above
5. Claude Code should use the skills to:
   - Check for existing domain plugins
   - Create new ones by capturing browser traffic
   - Generate proxy routes
   - Build the dashboard UI
   - Wire everything together

## Success Criteria

A prompt is "solved" when:

- [ ] All domain plugins are created and registered
- [ ] API routes are discovered and proxied through the browser
- [ ] Dashboard UI is functional (search, display, interact)
- [ ] Data from multiple sources is composed into a unified view
- [ ] The app works end-to-end without manual intervention after the initial prompt
