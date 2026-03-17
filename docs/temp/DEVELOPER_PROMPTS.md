# Developer Test Prompts

These are example prompts that a developer should be able to give to Claude Code after cloning this repository. The skills (api-discovery, dashboard-builder, visual-dev, etc.) should guide Claude Code through building each application end-to-end.

Each prompt tests different capabilities of the framework. Use these to validate that the skills are comprehensive enough.

---

## Prompt 1: Event Ticket Price Comparison

> I want to compare ticket prices across StubHub and Ticketmaster. Build domain plugins for both sites — figure out how they serve their search results, event details, and ticket listings.
>
> Build me a dashboard at `/tickets` where I search by artist name and see events from both platforms merged together. Same venue + same date = same event, show both badges. When I click an event, show me a side-by-side comparison of available seats and prices — I want to see which platform is cheaper for each section.
>
> If only one platform has an event, still show it. If a platform's browser isn't connected, show that cleanly without breaking the other one.

**Discovery hints for this prompt:**

- StubHub is pure SSR (Type B) -- CDP traffic buffer is empty; all data is in the DOM via `a[href*="/event/"]` and `[data-listing-id]` elements. Use `innerText` split by `\n` for section/row/quantity parsing.
- Ticketmaster uses a hybrid model: search results may be SSR, but ticket availability data comes from an internal API (`services.ticketmaster.com` ISMDS endpoints) that is CORS-blocked -- use Type B2 traffic capture.
- Ticketmaster event IDs are alphanumeric hex -- use `[A-Z0-9]+` not `\d+` in regex.
- Performer pages on both sites include "Recommended" / "You may also like" sections. Filter extracted URLs to only those containing the performer name slug to avoid unrelated events.
- `data-price` attributes on StubHub may hold USD-internal values that differ from displayed text in non-USD geolocations. Read prices from displayed text.
- TM geolocks to regional domains (`.es`, `.de`, `.co.uk`) based on browser IP. Ensure event URLs use the correct domain.
- TM Discovery API (`app.ticketmaster.com/discovery/v2`) is free but requires email-verified registration at `developer.ticketmaster.com`. Without `TM_API_KEY` env var, the domain plugin should fall back to browser SSR extraction for search. Use the graceful degradation pattern: check env var, try API, fall back to browser.

**What this tests** (framework capabilities exercised by this prompt — not additional requirements. Only implement what the prompt itself asks for)**:**

- Creating 2 domain plugins from scratch (1 SSR Type B, 1 hybrid Type B/B2)
- Multi-step API discovery (search → event detail → ticket listings)
- Event merging across marketplaces (same event detected by venue + date)
- Seat-level comparison grid with section name normalization
- Error resilience (marketplace failing independently)

---

## Prompt 2: Yahoo Finance Market Intelligence

> Build me a market dashboard using Yahoo Finance. I want three things:
>
> **News with sentiment** — poll Yahoo Finance RSS feeds for a watchlist (AAPL, TSLA, NVDA, MSFT, SPY, BTC-USD) every 60 seconds. Run each headline through the Python bridge for sentiment analysis (bull/flat/bear). Push updates to connected dashboard clients over WebSocket so it's live.
>
> **Quote + chart data** — discover Yahoo Finance's internal API endpoints by navigating the site and watching CDP traffic. I want current price, change %, volume, market cap, and intraday chart data for any symbol.
>
> **Dashboard at `/market`** — watchlist sidebar on the left, click a symbol to see its quote card with a sparkline chart and its news feed with sentiment badges. Bottom panel shows all news across all symbols chronologically. Should feel live — updates appear without refreshing.
>
> If Yahoo rate-limits something, show the cached value with a "stale" indicator rather than an error.

**Discovery hints for this prompt:**

- Yahoo Finance's frontend is SvelteKit -- initial data is SSR-embedded in `<script type="application/json" data-sveltekit-fetched>` tags. Client-side interactions (chart range changes) trigger XHR to `query2.finance.yahoo.com`.
- Use `query2.finance.yahoo.com` for chart/quote data. Both `query1` and `query2` subdomains work; `query2` is more reliable.
- Yahoo Finance uses CORS from the main site (`finance.yahoo.com`). Use `browserFetch(url, { navigateTo: 'https://finance.yahoo.com' })` to stay on the main site and let CORS carry cookies.
- Chart endpoints use unix timestamps in seconds for `period1`/`period2` parameters.
- The `crumb` session token is embedded in page state -- visible in POST `/v1/finance/visualization` traffic. For most endpoints, the crumb is optional if the session cookie is valid. Cache it in a module-level variable.
- Heavy testing poisons the browser profile session. If all quote endpoints return 429 but CDN-cached screener endpoints return 200, wipe the browser profile directory and reconnect.
- Node.js `fetch()` gets 429 due to TLS fingerprinting (JA3/JA4). Use `browserFetch()` instead of direct `fetch()` for any Yahoo Finance data endpoints.
- RSS feeds at `https://feeds.finance.yahoo.com/rss/2.0/headline?s={TICKER}` are `browserRequired: false` -- plain HTTP, no auth needed.

**What this tests** (framework capabilities exercised by this prompt — not additional requirements. Only implement what the prompt itself asks for)**:**

- Browserless domain routes -- direct `fetch()` in route handlers without Patchright navigation
- Server-side scheduled polling -- background loop that exposes the framework's lack of job/timer infrastructure
- Server -> client push -- WebSocket broadcast driven by a real data pipeline, not a toy counter
- Python bridge NLP -- extending `worker.py` with VADER sentiment analysis
- Route-level TTL caching -- no caching infrastructure exists; Yahoo rate limits will surface this gap immediately
- CDP REST API discovery -- `query1/query2.finance.yahoo.com` nested JSON (richer than TM ISMDS)
- Cross-source symbol linking -- news + quote + chart all keyed by the same ticker
- SSE streaming (stretch) -- server polls REST every 5s and pushes via SSE; new push pattern without binary decoding

---

## Prompt 3: Vacation Rental Intelligence

> Build me a vacation rental comparison tool. Create domain plugins for Airbnb, VRBO, and Zillow. Figure out how each site serves its search results and listing details — discover the APIs first, then build the routes.
>
> I want to search for a location and dates and see listings from all three platforms side by side. Use the Python bridge to score each listing by value (rating per dollar) and detect cross-listings — same property on multiple platforms matched by coordinates. Show me which platform is cheaper when a property is cross-listed.
>
> Dashboard at `/rentals` — search bar with location, dates, and guests. Card grid sorted by value score with source badges. Cross-listed properties should call out the savings. Sidebar with Zillow long-term rental comps for the same area so I can compare short-term vs long-term economics.

**Discovery hints for this prompt:**

- Airbnb search is pure SSR -- the `StaysSearch` GraphQL call only fires on client-side filter changes, not initial page load. DOM extraction via `a[href*="/rooms/"]` is the only reliable approach for search results.
- Airbnb has a stable public API key (look for `X-Airbnb-API-Key` header in CDP traffic on listing detail page loads). Use it in `browserFetch` headers for GraphQL persisted queries.
- VRBO uses obfuscated HMAC-signed URL paths for all analytics/data (`/2oWWs7BA09XCe/...`). No usable public JSON API was found. DOM extraction is the only option.
- Zillow exposes a JSON API: `PUT https://www.zillow.com/async-create-search-page-state`. Call via `browserFetch(..., { navigateTo: 'https://www.zillow.com' })` so cookies are present.
- Both Airbnb and VRBO are Next.js apps -- check `window.__NEXT_DATA__` on detail pages for structured listing data.

**What this tests** (framework capabilities exercised by this prompt — not additional requirements. Only implement what the prompt itself asks for)**:**

- API catalog as a first-class deliverable -- discovery before implementation, typed schemas from real traffic
- GraphQL proxy -- Airbnb and VRBO POST GraphQL with named operations; first time the framework must forward and parse a GraphQL body
- Public API key extraction -- `X-Airbnb-API-Key` pulled from CDP request headers, not assumed or hardcoded
- Shared schema across sibling domains -- Airbnb and VRBO return the same conceptual data; forces a normalisation layer
- Geospatial bounding-box queries -- `ne_lat/ne_lng/sw_lat/sw_lng` parameters new to the framework
- Python bridge geo-analytics -- coordinate proximity matching + value scoring; first non-NLP bridge use
- Cross-domain lat/lng entity matching -- same property on two platforms matched by coordinate radius
- 10-minute mail as account enabler -- tests whether the minuteinbox domain can unlock auth-gated endpoints

---

## Prompt 4: Job Search Aggregator

> Build me a job search aggregator. Create domain plugins for LinkedIn, Indeed, Glassdoor, and Dice. I want to search by job title and location and see results from all four sites deduplicated — same job posted on multiple sites should merge into one card with badges for each source.
>
> Dashboard at `/jobs` — show salary comparison across sources when a job is cross-listed. Let me star favorites and track application status (saved, applied, interviewing, offered, rejected). Detail view should show the full posting with links to each source.

**What this tests** (framework capabilities exercised by this prompt — not additional requirements. Only implement what the prompt itself asks for)**:**

- Search with location + keyword parameters
- Entity deduplication across sources (same job, different sites)
- Salary range parsing and normalization
- Persistent user state (favorites, application tracking)
- CRUD operations (save, update status)

---

## Prompt 5: Academic Research Aggregator

> Build me an academic paper search tool. Create domain plugins for PubMed, Semantic Scholar, and ArXiv — check if they have public APIs first before trying browser interception.
>
> I want to search a research topic and see papers from all three databases deduplicated by DOI. Dashboard at `/research` — show citation counts, abstracts, authors, and source badges. Sort by most cited. I want to see which papers are the most influential in a field.

**Discovery hints for this prompt:**

- ArXiv has a public Atom API at `export.arxiv.org/api` -- returns XML (Atom format). Parse with regex: `/<entry>([\s\S]*?)<\/entry>/g`. No API key needed.
- Semantic Scholar has a public REST API at `api.semanticscholar.org/graph/v1` -- 100 req/5min unauthenticated. It may return `total: 0` with 200 status under load (soft rate limit) -- retry after a few seconds.
- PubMed/NCBI uses E-utilities at `eutils.ncbi.nlm.nih.gov` -- returns NCBI XML. Parse with `/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g`.
- All three are `browserRequired: false` -- no browser interception needed.
- Since these are independent HTTP calls to different servers (not sharing a browser), they can be fetched in parallel with `Promise.all` -- unlike browser-dependent domain routes which must be sequential.

**What this tests** (framework capabilities exercised by this prompt — not additional requirements. Only implement what the prompt itself asks for)**:**

- Public API approach: all three databases (ArXiv, Semantic Scholar, PubMed) have public REST APIs — no browser needed
- Domain plugins that use direct fetch instead of browserFetch when possible
- Citation graph traversal (follow references)
- Entity resolution (same paper across databases)
- Data visualization (citation network graph)

---

## Prompt 6: Government & Public Records Monitor

> Build me a due diligence tool. Create domain plugins for SEC EDGAR and the federal court system. I want to search by company name and see all their filings, registrations, and court cases in one place.
>
> Dashboard at `/records` — chronological timeline of all activity across sources, color-coded by source type. I want to be able to quickly scan a company's legal and regulatory history.

**Discovery hints for this prompt:**

- SEC EDGAR has public APIs at `efts.sec.gov` and `data.sec.gov` -- `browserRequired: false`. **Important**: SEC requires a descriptive User-Agent with contact info: `'api-interceptor/1.0 (research tool; admin@example.com)'`. Requests without it get 403.
- PACER (federal court dockets) requires paid auth and CAPTCHA. Use CourtListener (`courtlistener.com/api/rest/v4`) as a free open-source mirror instead.
- State business registries are typically pure SSR (Type B) -- no client-side APIs, need DOM extraction.

**What this tests** (framework capabilities exercised by this prompt — not additional requirements. Only implement what the prompt itself asks for)**:**

- Server-side rendered sites with no client-side API (worst case for interception)
- Session-based auth with CAPTCHAs (PACER)
- Scheduled monitoring (check for new filings periodically)
- Timeline/chronological data visualization
- PDF document handling (SEC filings, court documents)
- The compelling "why browser interception matters" story -- these sites resist automation

---

## Prompt 7: Reddit Mobile Client

> Build me a Reddit client that feels like a native mobile app. Create a `reddit` domain plugin — Reddit has a `.json` suffix API (append `.json` to any URL for structured data). Discover if there's a richer internal API too.
>
> Dashboard at `/reddit` — mobile-first design, dark mode by default using Reddit's color palette. Feed view with posts (subreddit, title, thumbnail, score, comments, time ago), sort by Hot/New/Top. Click a post to see the full content with nested comment threads that I can collapse and expand. Search, and bottom navigation bar like the Reddit app.
>
> Voting, saving, and subscribing should use optimistic UI — update immediately, sync in background. The whole thing should feel fast and native on a phone while still working well on desktop.

**Discovery hints for this prompt:**

- Reddit exposes a `.json` suffix on any URL (e.g., `reddit.com/r/programming/hot.json`) for read-only JSON. No API key needed. ~60 req/min rate limit. Pagination via `after` cursor token.
- The internal Reddit API uses GraphQL at `gql.reddit.com` and OAuth endpoints at `oauth.reddit.com`. Look for `Authorization: Bearer ...` and `x-reddit-*` headers in CDP traffic.
- The `.json` suffix pattern is simpler and sufficient for most read operations. The internal GraphQL API provides richer data (awards, flair, nested comments) for write operations and authenticated features.

**What this tests** (framework capabilities exercised by this prompt — not additional requirements. Only implement what the prompt itself asks for)**:**

- GraphQL API discovery -- Reddit's internal GQL endpoint with operation names and variables
- POST mutations through browser proxy -- voting, saving, commenting, subscribing (first write-heavy prompt)
- Mobile-first responsive design -- testing whether the framework + skills can build a phone-native experience
- Infinite scroll with cursor-based pagination -- `after` cursor pattern, load-more triggers
- Nested data rendering -- comment trees with arbitrary depth, collapse/expand state
- Optimistic UI updates -- client-side state management ahead of server confirmation
- Media proxying -- images, videos (v.redd.it), galleries through the browser session
- Real-time interaction density -- many tappable elements per screen (votes, comments, save, subscribe)

---

## Prompt 8: YouTube Without YouTube

> Build me a clean YouTube experience — search, watch, and download videos without ads or tracking. Create a `youtube` domain plugin using yt-dlp through the Python bridge since YouTube aggressively blocks browser automation.
>
> I want to search videos, watch them, and download them in different qualities (1080p/720p/480p) with a progress bar. Downloads should happen in the background and I should be able to play saved videos from a downloads library.
>
> Dashboard at `/youtube` — responsive video grid with thumbnails and duration overlays. Click to watch with the video player at the top. Download button with quality picker. Downloads library where I can play or save my downloaded videos. Keyboard shortcuts for the player (space, fullscreen, seek, volume). Should feel fast and clean on both desktop and mobile.

**Discovery hints for this prompt:**

- YouTube aggressively blocks browser automation. Use `yt-dlp` (CLI tool bridge pattern) via Python bridge rather than browser interception for all data operations.
- `yt-dlp` Python API: `YoutubeDL({'extract_flat': True}).extract_info('ytsearch20:query', download=False)` for search; `YoutubeDL({'skip_download': True}).extract_info(url, download=False)` for video info.
- For downloads, use `threading.Thread(daemon=True)` with a module-level job dict for progress tracking. Parse yt-dlp stdout for `[download] XX.X% of ~XXMiB` progress.
- All routes should be `browserRequired: false` -- yt-dlp handles everything.
- System Python on macOS is 3.9 -- add `from __future__ import annotations` at the top of worker.py.
- `PythonBridge` path from domain plugins: `resolve(import.meta.dirname, '../../../services/python/worker.py')` (3 levels up).

**What this tests** (framework capabilities exercised by this prompt — not additional requirements. Only implement what the prompt itself asks for)**:**

- YouTube's internal API (`youtubei`) -- POST-based with nested context objects, continuation token pagination
- Python bridge for CLI tool orchestration -- shelling out to `yt-dlp`, parsing stdout progress, managing background downloads
- Static file serving -- serving large MP4 files with range request support (seeking in `<video>` element)
- Background job tracking -- download-as-async-job pattern with polling for progress
- Video streaming through proxy -- proxying YouTube's adaptive streams or serving local files
- Anti-bot resilience -- YouTube aggressively blocks automation; yt-dlp as the battle-tested fallback
- localStorage persistence -- client-side watch history without a database
- Keyboard shortcut handling -- media player hotkeys in a web app

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

A prompt is solved when it passes the dashboard-builder Definition of Done — including the prompt compliance check. See `.claude/skills/dashboard-builder/SKILL.md`.
