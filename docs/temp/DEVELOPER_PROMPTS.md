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

**Discovery hints for this prompt:**

- StubHub is pure SSR (Type B) -- CDP traffic buffer is empty; all data is in the DOM via `a[href*="/event/"]` and `[data-listing-id]` elements. Use `innerText` split by `\n` for section/row/quantity parsing.
- Ticketmaster uses a hybrid model: search results may be SSR, but ticket availability data comes from an internal API (`services.ticketmaster.com` ISMDS endpoints) that is CORS-blocked -- use Type B2 traffic capture.
- Ticketmaster event IDs are alphanumeric hex -- use `[A-Z0-9]+` not `\d+` in regex.
- Performer pages on both sites include "Recommended" / "You may also like" sections. Filter extracted URLs to only those containing the performer name slug to avoid unrelated events.
- `data-price` attributes on StubHub may hold USD-internal values that differ from displayed text in non-USD geolocations. Read prices from displayed text.
- TM geolocks to regional domains (`.es`, `.de`, `.co.uk`) based on browser IP. Ensure event URLs use the correct domain.
- TM Discovery API (`app.ticketmaster.com/discovery/v2`) is free but requires email-verified registration at `developer.ticketmaster.com`. Without `TM_API_KEY` env var, the domain plugin should fall back to browser SSR extraction for search. Use the graceful degradation pattern: check env var, try API, fall back to browser.

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

**Discovery hints for this prompt:**

- Yahoo Finance's frontend is SvelteKit -- initial data is SSR-embedded in `<script type="application/json" data-sveltekit-fetched>` tags. Client-side interactions (chart range changes) trigger XHR to `query2.finance.yahoo.com`.
- Use `query2.finance.yahoo.com` for chart/quote data. Both `query1` and `query2` subdomains work; `query2` is more reliable.
- Yahoo Finance uses CORS from the main site (`finance.yahoo.com`). Use `browserFetch(url, { navigateTo: 'https://finance.yahoo.com' })` to stay on the main site and let CORS carry cookies.
- Chart endpoints use unix timestamps in seconds for `period1`/`period2` parameters.
- The `crumb` session token is embedded in page state -- visible in POST `/v1/finance/visualization` traffic. For most endpoints, the crumb is optional if the session cookie is valid. Cache it in a module-level variable.
- Heavy testing poisons the browser profile session. If all quote endpoints return 429 but CDN-cached screener endpoints return 200, wipe the browser profile directory and reconnect.
- Node.js `fetch()` gets 429 due to TLS fingerprinting (JA3/JA4). Use `browserFetch()` instead of direct `fetch()` for any Yahoo Finance data endpoints.
- RSS feeds at `https://feeds.finance.yahoo.com/rss/2.0/headline?s={TICKER}` are `browserRequired: false` -- plain HTTP, no auth needed.

**What this tests:**

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

**Discovery hints for this prompt:**

- Airbnb search is pure SSR -- the `StaysSearch` GraphQL call only fires on client-side filter changes, not initial page load. DOM extraction via `a[href*="/rooms/"]` is the only reliable approach for search results.
- Airbnb has a stable public API key (look for `X-Airbnb-API-Key` header in CDP traffic on listing detail page loads). Use it in `browserFetch` headers for GraphQL persisted queries.
- VRBO uses obfuscated HMAC-signed URL paths for all analytics/data (`/2oWWs7BA09XCe/...`). No usable public JSON API was found. DOM extraction is the only option.
- Zillow exposes a JSON API: `PUT https://www.zillow.com/async-create-search-page-state`. Call via `browserFetch(..., { navigateTo: 'https://www.zillow.com' })` so cookies are present.
- Both Airbnb and VRBO are Next.js apps -- check `window.__NEXT_DATA__` on detail pages for structured listing data.

**What this tests:**

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

> Create domains for LinkedIn, Indeed, Glassdoor, and Dice. Search for "senior React developer in Austin", get job postings with salary, company, and requirements from each site. Build a dashboard that deduplicates the same job posted on multiple sites and compares salary ranges. Let me save favorites and track application status.

**What this tests:**

- Search with location + keyword parameters
- Entity deduplication across sources (same job, different sites)
- Salary range parsing and normalization
- Persistent user state (favorites, application tracking)
- CRUD operations (save, update status)

---

## Prompt 5: Academic Research Aggregator

> Create domains for PubMed, Semantic Scholar, and ArXiv. Some of these may have public REST APIs — prefer using those directly over browser interception when available. Search for a research topic, collect papers with citations, abstracts, and authors. Deduplicate papers that appear in multiple databases. Build a literature review dashboard that shows citation networks and identifies the most influential papers in a field.

**Discovery hints for this prompt:**

- ArXiv has a public Atom API at `export.arxiv.org/api` -- returns XML (Atom format). Parse with regex: `/<entry>([\s\S]*?)<\/entry>/g`. No API key needed.
- Semantic Scholar has a public REST API at `api.semanticscholar.org/graph/v1` -- 100 req/5min unauthenticated. It may return `total: 0` with 200 status under load (soft rate limit) -- retry after a few seconds.
- PubMed/NCBI uses E-utilities at `eutils.ncbi.nlm.nih.gov` -- returns NCBI XML. Parse with `/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g`.
- All three are `browserRequired: false` -- no browser interception needed.

**What this tests:**

- Hybrid approach: direct API calls (ArXiv, Semantic Scholar have public APIs) vs browser interception (PubMed may need it)
- Domain plugins that use direct fetch instead of browserFetch when possible
- Citation graph traversal (follow references)
- Entity resolution (same paper across databases)
- Data visualization (citation network graph)

---

## Prompt 6: Government & Public Records Monitor

> Create domains for SEC EDGAR, my state's business registry, county property records, and the federal court docket system (PACER). Search by company name, aggregate all filings, registrations, and court cases. Build a due diligence dashboard that shows a timeline of all activity and alerts me when new filings appear.

**Discovery hints for this prompt:**

- SEC EDGAR has public APIs at `efts.sec.gov` and `data.sec.gov` -- `browserRequired: false`. **Important**: SEC requires a descriptive User-Agent with contact info: `'api-interceptor/1.0 (research tool; admin@example.com)'`. Requests without it get 403.
- PACER (federal court dockets) requires paid auth and CAPTCHA. Use CourtListener (`courtlistener.com/api/rest/v4`) as a free open-source mirror instead.
- State business registries are typically pure SSR (Type B) -- no client-side APIs, need DOM extraction.

**What this tests:**

- Server-side rendered sites with no client-side API (worst case for interception)
- Session-based auth with CAPTCHAs (PACER)
- Scheduled monitoring (check for new filings periodically)
- Timeline/chronological data visualization
- PDF document handling (SEC filings, court documents)
- The compelling "why browser interception matters" story -- these sites resist automation

---

## Prompt 7: Reddit Mobile Client

> Create a `reddit` domain plugin. Reddit has a well-documented JSON API — appending `.json` to any Reddit URL returns structured data (e.g., `https://www.reddit.com/r/programming.json`). Use CDP traffic capture to discover the internal API endpoints that the new Reddit UI (`sh.reddit.com` / `www.reddit.com`) actually hits — these are richer than the public `.json` endpoints and include vote counts, awards, user flair, and nested comment trees. Fall back to the `.json` suffix pattern for any gaps.
>
> **Phase 1: API Discovery**
>
> Navigate to reddit.com, log in, and browse: the front page, a subreddit (`/r/programming`), a post with comments, user profile, search results, and the inbox. Capture all `gql.reddit.com` and `oauth.reddit.com` traffic via CDP. Document every endpoint with URL pattern, method, required headers (especially `Authorization: Bearer ...` and any `x-reddit-*` headers), request/response shapes as Zod schemas. Reddit's internal API is GraphQL-heavy — identify the operation names and variables for: feed posts, subreddit listings, post detail + comments, search, user profile, and vote/save/subscribe mutations.
>
> **Phase 2: Routes**
>
> Expose these as REST-style proxy routes:
>
> - `GET /api/reddit/feed?sort=hot|new|top&after=cursor` → home feed posts (paginated)
> - `GET /api/reddit/r/:subreddit?sort=hot|new|top&after=cursor` → subreddit feed
> - `GET /api/reddit/post/:id` → post detail + full comment tree (nested)
> - `GET /api/reddit/search?q=query&type=posts|subreddits|users` → search
> - `GET /api/reddit/user/:username` → profile + recent posts/comments
> - `GET /api/reddit/inbox` → messages and notifications
> - `POST /api/reddit/vote` → `{ id, direction: 1|0|-1 }` upvote/downvote/unvote
> - `POST /api/reddit/save` → `{ id }` save/unsave a post
> - `POST /api/reddit/subscribe` → `{ subreddit, action: "sub"|"unsub" }`
> - `POST /api/reddit/comment` → `{ parentId, text }` post a comment
>
> **Phase 3: Mobile-First Dashboard at `/reddit`**
>
> Build a mobile-responsive Reddit client designed to feel like a native app. This must work well on phone screens (test at 390×844 iPhone viewport) while remaining usable on desktop.
>
> - **Feed view (default):** Infinite-scroll card feed. Each card shows: subreddit pill, post title, thumbnail/preview image (if media post), upvote count, comment count, time ago, author. Tap a card to open post detail. Top bar has feed type selector (Hot / New / Top) and a search icon.
> - **Post detail view:** Full post content (text, image, link preview, or embedded video). Below: nested comment tree with indent lines (like the Reddit app), collapse/expand on tap, upvote/downvote buttons on each comment. Swipe right or back button to return to feed. Reply button that opens a comment composer.
> - **Subreddit view:** Subreddit header (icon, name, subscriber count, description), then its post feed. Subscribe/unsubscribe button in header.
> - **Search:** Full-screen search with tabs for Posts / Subreddits / Users. Results update as you type (debounced 300ms).
> - **Bottom navigation bar:** Feed | Search | Inbox | Profile (4 tabs, like the Reddit mobile app)
> - **Interactions:** Tap upvote/downvote arrows on posts and comments (optimistic UI — update count immediately, reconcile on response). Long-press a post to save it. Pull-to-refresh on feeds.
> - **Media handling:** Image posts show inline. Video posts (v.redd.it) show with a play button — use the browser-proxied video URL. Gallery posts show a horizontal swipe carousel.
> - **Dark mode by default** with a toggle in profile tab. Use Reddit's color palette: `#FF4500` orange for upvotes, `#7193FF` blue for downvotes, `#1A1A1B` dark background.
>
> The entire app should use **CSS-only responsive layout** (no separate mobile/desktop builds). Use `tailwindcss` with mobile-first breakpoints. Touch targets must be at least 44×44px. Animate transitions between views (slide left/right).

**Discovery hints for this prompt:**

- Reddit exposes a `.json` suffix on any URL (e.g., `reddit.com/r/programming/hot.json`) for read-only JSON. No API key needed. ~60 req/min rate limit. Pagination via `after` cursor token.
- The internal Reddit API uses GraphQL at `gql.reddit.com` and OAuth endpoints at `oauth.reddit.com`. Look for `Authorization: Bearer ...` and `x-reddit-*` headers in CDP traffic.
- The `.json` suffix pattern is simpler and sufficient for most read operations. The internal GraphQL API provides richer data (awards, flair, nested comments) for write operations and authenticated features.

**What this tests:**

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

> Create a `youtube` domain plugin backed by both browser API interception and the Python bridge running `yt-dlp`. The goal: a clean, fast YouTube experience — search, watch, and save videos — without ads, tracking, or UI bloat.
>
> **Phase 1: API Discovery**
>
> Navigate to `youtube.com`, log in, and browse: the home feed, search results, a video watch page, a channel page, and the subscriptions feed. Capture all traffic to `youtubei.googleapis.com` via CDP. YouTube's internal API uses POST requests to `/youtubei/v1/{endpoint}` with a JSON body containing a `context` object (client name, version, API key). Document the key endpoints:
>
> - `/youtubei/v1/search` — search query + continuation token for pagination
> - `/youtubei/v1/browse` — home feed, subscriptions, channel pages (driven by `browseId`)
> - `/youtubei/v1/player` — video metadata, streaming URLs, adaptive formats
> - `/youtubei/v1/next` — related videos, comments, description
>
> Extract the `INNERTUBE_API_KEY`, `INNERTUBE_CONTEXT`, and any `SAPISIDHASH` / session headers from CDP traffic. Document the full request shape for each endpoint as Zod schemas.
>
> **Phase 2: Python Bridge — yt-dlp Integration**
>
> Extend `services/python/worker.py` with methods that shell out to `yt-dlp` (install via `pip install yt-dlp`):
>
> - `get_video_info(params)` — `yt-dlp --dump-json {url}` → returns full metadata: title, description, duration, upload date, view count, channel, thumbnail URL, and all available format streams (resolution, codec, filesize)
> - `download_video(params)` — `yt-dlp -f "bestvideo[height<=1080]+bestaudio/best[height<=1080]" -o "{output_dir}/{id}.%(ext)s" --merge-output-format mp4 {url}` → downloads to a server-side directory (`./downloads/youtube/`), returns the file path and progress updates via stdout line parsing
> - `get_download_progress(params)` — check if a download is in progress, return percentage and ETA (parse yt-dlp stdout `[download] XX.X% of ~XXMiB at XXMiB/s ETA XX:XX`)
> - `list_downloads(params)` — list all downloaded videos in `./downloads/youtube/` with file size, duration, and thumbnail
>
> Add a static file serving route: `GET /api/youtube/downloads/:filename` → serves the MP4 file from the downloads directory with proper `Content-Type` and `Content-Range` headers for seeking.
>
> Routes:
>
> - `GET /api/youtube/search?q=query&continuation=token` → search results
> - `GET /api/youtube/feed?type=home|subscriptions|trending` → feed pages
> - `GET /api/youtube/video/:id` → video metadata + streaming URLs (from browser API)
> - `GET /api/youtube/video/:id/comments?continuation=token` → comment thread
> - `GET /api/youtube/channel/:id` → channel info + recent uploads
> - `POST /api/youtube/download` → `{ videoId, quality?: "1080p"|"720p"|"480p" }` → starts yt-dlp download, returns job ID
> - `GET /api/youtube/download/:jobId` → download progress (percentage, ETA, status)
> - `GET /api/youtube/downloads` → list all saved videos
> - `GET /api/youtube/downloads/:filename` → stream the saved MP4 file
>
> **Phase 3: Dashboard at `/youtube`**
>
> Build a clean, fast video interface. No ads, no recommendations sidebar, no autoplay nagging.
>
> - **Home / Search:** Top search bar (full width). Below: video grid (responsive — 1 col mobile, 2 col tablet, 3-4 col desktop). Each card: thumbnail with duration overlay, title (2 lines max), channel name, view count, upload date. Click to watch.
> - **Video player page:** Video fills the top of the viewport. Use a `<video>` element pointed at the proxied streaming URL from the `/video/:id` route (or the direct stream URL via browserFetch). Below the player:
>   - Title, view count, upload date
>   - Channel name + subscriber count + subscribe button
>   - Expandable description
>   - **Download button** — click opens a quality picker (1080p / 720p / 480p), starts download via `POST /api/youtube/download`. Show a progress bar that polls `/download/:jobId` every 2 seconds. When complete, the button changes to "Play saved copy" which loads from `/api/youtube/downloads/:filename`.
>   - Comments section (lazy-loaded on scroll, paginated via continuation tokens)
> - **Downloads library (`/youtube/downloads`):** Grid of all saved videos. Each card shows thumbnail, title, file size, duration. Click to play from local file (no network needed after download). Delete button to remove files.
> - **Channel page:** Channel banner, avatar, subscriber count, description. Tabs: Videos | Shorts | About. Video grid for uploads.
> - **Keyboard shortcuts:** `Space` play/pause, `F` fullscreen, `←/→` seek 5s, `↑/↓` volume, `M` mute.
> - **Mobile responsive:** On small screens, video player goes full-width, grid collapses to single column, bottom nav appears (Home | Search | Downloads).
>
> **Stretch goal: Watch history + Resume playback**
>
> Store watch history in browser localStorage: `{ videoId, title, thumbnail, channel, watchedAt, progress }`. Show a "Continue watching" row on the home page with a progress bar overlay on thumbnails. When opening a previously watched video, seek to the saved position.

**Discovery hints for this prompt:**

- YouTube aggressively blocks browser automation. Use `yt-dlp` (CLI tool bridge pattern) via Python bridge rather than browser interception for all data operations.
- `yt-dlp` Python API: `YoutubeDL({'extract_flat': True}).extract_info('ytsearch20:query', download=False)` for search; `YoutubeDL({'skip_download': True}).extract_info(url, download=False)` for video info.
- For downloads, use `threading.Thread(daemon=True)` with a module-level job dict for progress tracking. Parse yt-dlp stdout for `[download] XX.X% of ~XXMiB` progress.
- All routes should be `browserRequired: false` -- yt-dlp handles everything.
- System Python on macOS is 3.9 -- add `from __future__ import annotations` at the top of worker.py.
- `PythonBridge` path from domain plugins: `resolve(import.meta.dirname, '../../../services/python/worker.py')` (3 levels up).

**What this tests:**

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

A prompt is "solved" when:

- [ ] All domain plugins are created and registered
- [ ] API routes are discovered and proxied through the browser
- [ ] Dashboard UI is functional (search, display, interact)
- [ ] Data from multiple sources is composed into a unified view
- [ ] The app works end-to-end without manual intervention after the initial prompt
