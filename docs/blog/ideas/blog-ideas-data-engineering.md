# Blog Ideas: Data Engineering

20 blog ideas about web scraping, data pipelines, browser automation, and financial data infrastructure.

---

## 26. Scraping the Web Without Getting Caught (Ethically)

**Commits**: `58bb37e1`, `c623900a`, `deead6e0`, `779ccc19`

**What Happened**: Browser automation evolved through three stages: (1) Playwright stealth with anti-detection config, (2) replacing Playwright with Patchright (a fork designed for stealth), (3) building full infrastructure with `BrowserPool`, `BlockerManager`, and `defineScraperProvider`. Patchright replaced Playwright with a net-negative-lines change.

**The Story/Angle**: Sometimes the best abstraction is someone else's fork. Then the deeper story: treating scrapers as first-class data providers in the system architecture.

**Recommended Styles**:
- **Overreacted**: "I Replaced 100 Lines of Stealth Config with a Different Import."
- **CSS-Tricks**: "The Complete Guide to Ethical Web Scraping with Patchright."

---

## 27. Building an Economic Calendar from Three Different APIs

**Commits**: `779ccc19`, `77040e3b`, `cafc6127`

**What Happened**: Three APIs explored (Investing.com, TradingEconomics, direct API), one won. Complete pipeline built: Drizzle schema, BullMQ worker, backfill, API routes, dashboard with countdown timers and importance indicators. 6 incremental migrations squashed into one.

**The Story/Angle**: Financial data is surprisingly hard to get. The experiments that fail teach you more about your data model than the one that works.

**Recommended Styles**:
- **Overreacted**: "Three APIs, Two Experiments, One Calendar."
- **A List Apart**: Argue that "experiment directories" should be first-class project structure.

---

## 28. Building a Financial Data Lake from Scratch: Scrapers, APIs, and 374 Million Rows

**Commits**: `d03064db`, `38cd28e4`, `4f906e7a`, `d16fc950`, `2a0ba911`, `64490e74`, `82319d1a`, `90950751`, `7af7a3f2`, `1f6930c8`

**What Happened**: Complete data acquisition infrastructure: scraper package, separate `market-db` with TimescaleDB, import pipelines for minute bars (374M rows), daily bars, 334K news articles, 45K SEC filings, 77 Fed documents, FRED economic series.

**The Story/Angle**: The unsexy but critical work of data engineering. The design decision of maintaining a separate research database (`market-db` on port 5433) alongside production — keeping research isolated.

**Recommended Styles**:
- **CSS-Tricks**: "The Complete Guide to Building a Financial Data Lake with TimescaleDB."
- **A List Apart**: Argue for separating research and production databases. Analogy: workshop bench vs. kitchen counter.

---

## 29. Reverse-Engineering a Financial Data API: XOR, Gzip, and Browser Stealth

**Commits**: `bc07f327`, `9b744e14`, `6f845dd1`, `51e29c9b`, `d03064db`, `38cd28e4`

**What Happened**: TradingEconomics CloudFront API uses XOR+gzip encryption on responses. Chrome 134 User-Agent pools, headless detection evasion, and a full lifecycle of `browser2` → experiment → consolidation back into the main package.

**The Story/Angle**: XOR decryption, User-Agent fingerprint management, and the meta-story of porting working experiment code back into clean architecture.

**Recommended Styles**:
- **Soshnikov**: Deep-dive into XOR+gzip decryption, stealth config, multi-source scraper architecture.
- **Overreacted**: "The Experiment That Came Home" — the pattern of experimental code earning its place in production.

---

## 30. Building an Economic Events System End-to-End

**Commits**: `edd25247`, `bc07f327`, `9b744e14`, `6f845dd1`, `51e29c9b`, `f30bbb02`, `19273da0`, `b9391bd6`

**What Happened**: Full vertical slice: TimescaleDB hypertables, seed scripts, API endpoints, visx charts with trend visualization and color-coded surprise tables, automated ingestion scheduling.

**The Story/Angle**: What "full-stack" actually means for a data-driven application. Data features require 3x the infrastructure of CRUD (ingestion + storage + presentation).

**Recommended Styles**:
- **CSS-Tricks**: Comprehensive walkthrough from database to dashboard.
- **A List Apart**: Argue that data features require 3x the infrastructure planning of CRUD features.

---

## 31. Eleven Scrapers in Forty-Eight Hours

**Commits**: `d465d2b7`, `973bf94f`, `d1ff9bad`, `c8fcb4a8`, `af9d1c08`, `dd67871e`, `cb22d57a`, `38731891`, `190c48cc`, `6c106b06`, `dacda036` (plus fix/debug/docs commits)

**What Happened**: Over ~48 hours, eleven production scrapers deployed: Yahoo Finance, TradingEconomics, minute bars from S3, FRED, stock universe (Finviz), Fed documents, Polygon news, SEC 8-K, earnings calendar, and more. First scraper took hours (establishing architecture). By scraper 8, each shipped in under an hour.

**The Story/Angle**: The power of repeatable patterns. The first scraper establishes architecture; the last ones are plug-and-play. But the remaining 20% is always different (SEC needs retries, Investing.com needs a real browser, Finviz needs ad-blocking).

**Recommended Styles**:
- **Overreacted**: "I built 11 scrapers in a weekend" — the moment where each new one gets faster is the "aha."
- **CSS-Tricks** (companion): "Complete Guide to Building a Scraper Registry."

---

## 32. The Economic Release Capture Problem

**Commits**: `97ea689d`, `4dc288a5`, `938a8f66`, `80e00125`, `ffc83d62`, `e53834bb`, `dab1b192`, `8fbfac9a`, `64ad2593`

**What Happened**: Capturing GDP/CPI at the moment of release required solving cascading problems: Chrome not found in Docker (silent failure), 12-hour time parsing ("09:45 AM" → invalid ISO), colons in BullMQ job IDs, three architecture iterations (direct scrape → `waitUntilFinished` → fire-and-forget with shared cache). Final refactoring: 49 passing tests.

**The Story/Angle**: Building a real-time capture system for data that's only "news" for seconds. You cannot retry tomorrow. The warm cache pattern appears in many real-time systems.

**Recommended Styles**:
- **Soshnikov**: Temporal constraints, cache architecture, queue concurrency model, event-matching logic.
- **Overreacted**: The parade of surprising failures (colons in job IDs! 12-hour time formats! Chrome not found but no error!).

---

## 33. The Scraper Registry Pattern

**Commits**: `38731891`, `dacda036`

**What Happened**: After 10 scrapers with similar but ad-hoc structures, a centralized registry emerged: `defineScraper()` with metadata, schedule hints, rate limits, health checks, and discovery by source/tag/browser requirement.

**The Story/Angle**: "Extract the framework after the third time." Built after scraper #10, shaped by real needs rather than speculation.

**Recommended Styles**:
- **CSS-Tricks**: Document the registry pattern as a "how to build a plugin system" reference.
- **A List Apart**: Argue that frameworks should be extracted, not designed upfront.

---

## 34. Rate Limiting as Architecture

**Commits**: `a046a7e5`, `000ef617`, `f82c507d`, `6c106b06`, `973bf94f`, `d1ff9bad`

**What Happened**: Five different rate-limiting strategies for five different constraints: Yahoo (market-hours-aware frequency), enrichment queue (BullMQ built-in 1/2s), FRED (1.5s delay for API quota), SEC EDGAR (exponential backoff for 5xx), Finviz (Patchright + Ghostery for anti-detection).

**The Story/Angle**: Rate limiting is usually discussed as one technique. In practice, you need a portfolio. Each data source's constraints differ: API quotas, anti-scraping detection, server reliability, your own resource limits.

**Recommended Styles**:
- **A List Apart**: Rate limiting is a design dimension, not a technique. Use five strategies as evidence.
- **Soshnikov**: Formalize the taxonomy: quota-based, detection-based, reliability-based, resource-based.

---

## 35. One Browser at a Time: Taming Headless Chromium with BullMQ

**Commits**: `85eb1d90`, `bd8089fe`, `0e81ce74`, `bbfd2476`, `4b95aa1c`, `f53a4ff3`, `4ae3fef1`

**What Happened**: Six scraping jobs all needed Chromium. Running simultaneously crashed the server. Solution evolved: `concurrency=1` → priority system (CRITICAL/HIGH/NORMAL/LOW) → reduced frequency → smart incremental sync with Redis-based global rate limiter at 1 req/s.

**The Story/Angle**: A case study in resource contention. Scheduling frequency and job duration have a non-obvious relationship — you can't schedule your way out of a throughput problem.

**Recommended Styles**:
- **Soshnikov**: Textbook progression through mutual exclusion, priority scheduling, rate limiting, incremental sync.
- **Overreacted**: "The 60-second sync that took 60 seconds."

---

## 36. Streaming a Remote Browser Through WebSockets

**Commits**: `67834a5f`, `3a37a246`, `0eebcc87`, `2b93ffc5`, `a0a1f85f`

**What Happened**: Remote browser viewer: CDP `Page.screencast` for frame streaming, canvas with coordinate scaling, copy/paste over WebSocket, navigation controls, URL sync. The CDP screencast API is poorly documented outside DevTools.

**The Story/Angle**: Building a "browser-in-a-browser" and the technical journey from screenshot polling to CDP screencast. Coordinate scaling is geometrically interesting.

**Recommended Styles**:
- **CSS-Tricks**: Complete guide to CDP screencast, WebSocket relay, canvas rendering, coordinate mapping.
- **Soshnikov**: Deep dive into the CDP `Page.screencast` API and coordinate geometry.

---

## 37. The Pipeline Health Problem: Knowing When Your Data Is Stale

**Commits**: `39cfb506`, `94f1e52a`, `9ce0882e`, `9dc29551`, `4bcc3e8e`, `f5bad7d4`, `82e2c3a5`

**What Happened**: API endpoint (`/health/pipeline`) checks DB freshness for every table. CLI script for production monitoring. Container health check saga: `curl` → containers don't have `curl` → `wget --spider` → add `curl` back because other tools need it.

**The Story/Angle**: The gap between "jobs are running" and "data is fresh." BullMQ tells you a job succeeded, not whether the data is current. Invert the question: monitor data staleness, not job execution.

**Recommended Styles**:
- **A List Apart**: Job monitoring vs. data monitoring — most observability is pointed at the wrong layer. Analogy: monitoring machines vs. monitoring output quality.
- **Overreacted**: The `curl`/`wget` comedy about base image assumptions.

---

## 38. Nanoseconds, Time Zones, and Other Ways Financial Data Betrays You

**Commits**: `a64af8d0`, `40afd1ac`, `7000ba38`, `958afe26`, `93e5c71c`

**What Happened**: Polygon CSVs use 19-digit nanosecond timestamps (exceeds `Number.MAX_SAFE_INTEGER`). Calendar scraper scraped but silently didn't persist (P0 bug). Daily bars sync must auto-detect trading days skipping weekends and holidays.

**The Story/Angle**: Financial data has more implicit assumptions per byte than any other domain. Each story is short; the collection is compelling.

**Recommended Styles**:
- **Overreacted**: "The Data Was There the Whole Time (It Just Wasn't Saved)."
- **Soshnikov**: Numbered catalog of financial data gotchas with code examples.

---

## 39. The Browser That Wanted to Be Human

**Commits**: `443c1b02`, `3d531155`, `372a4be9`, `f179b985`, `83bec962`, `8050517c`, `6bda9545`, `b73cac83`, `e6d491a7`, `0926bd3d`, `32f8600a`, `9824c458`, `66accccf`

**What Happened**: 17 commits in 6 days: FingerprintJS/Arkose blocking, WebGL renderer spoofing ("Apple M1" on Linux ARM), Mac User-Agent (Robinhood flags Linux), browsing history warmup (Google/Wikipedia/Reddit), residential proxies via Bright Data. Plus: zombie Chrome needing `tini`, profile locks causing reconnect failures, `about:blank` refusing init scripts.

**The Story/Angle**: An arms race in bot detection. Each commit is a move and countermove. When does anti-detection engineering become its own discipline?

**Recommended Styles**:
- **Overreacted**: Drops you into "Robinhood was detecting Linux ARM as suspicious" — each discovery is a surprise.
- **CSS-Tricks**: "How Browser Anti-Detection Actually Works" — reference covering each detection vector.

---

## 40. When Yahoo Finance Moved to SvelteKit and Broke Everything

**Commits**: `38d3a1b0`, `daff16f1`, `737d5a58`, `4c71100e`, `9f548758`, `7ca3e016`, `eb349fa8`

**What Happened**: Yahoo silently migrated sitemaps from HTML to SvelteKit JSON. Pipeline fixed, broke again on pagination change, fixed again. Critical static-date bug: `new Date()` captured at schedule registration, frozen after midnight → zero articles. Pipeline went from 60s/run (Chromium) to 2-5s/run (HTTP), 50 articles/day to 2,400/day.

**The Story/Angle**: The fragility of scraping-dependent pipelines. No changelog, no announcement. The closure bug (date frozen at registration) is the real lesson.

**Recommended Styles**:
- **Overreacted**: Waking up to zero articles, the forensic debugging, the midnight bug.
- **A List Apart**: "Your data pipeline is one SvelteKit migration away from silence."

---

## 41. The Operational Reality of Headless Browsers in Docker

**Commits**: `0932b0e2`, `0926bd3d`, `5507d439`, `b164dbf0`, `715cb463`, `d234724e`, `1b8831db`, `0d8044e7`

**What Happened**: Zombie Chrome (PID 1 can't reap orphans → tini), lost browser profiles (container restart → named volumes), lifecycle manager simplified (Playwright doesn't expose browser PID → in-memory singleton), BuildKit cache incompatibilities.

**The Story/Angle**: The gap between "it works" and "it works in Docker." Containers abstract away OS concerns until they don't.

**Recommended Styles**:
- **CSS-Tricks**: "The Complete Guide to Running Headless Chrome in Docker" — PID 1, profiles, caches, lifecycle.
- **A List Apart**: "Docker Lies About Being an Operating System."

---

## 42. Ingesting 2.6 Billion Options Records with PostgreSQL COPY

**Commits**: `37eb2d4b`, `c1394e4c`, `f2cc46d7`, `535fbcf6`, `d910d14b`

**What Happened**: Parallel workers with batch INSERTs (~6k rows/sec) → multiprocess with PostgreSQL COPY (~16k rows/sec/worker, ~60M rows/hour). OPRA condition codes describe *how* trades execute, not buy/sell direction. Per-file compression for disk management.

**The Story/Angle**: The INSERT → COPY performance journey, plus the discovery that a data column was nonsense (OPRA codes ≠ trade direction).

**Recommended Styles**:
- **Soshnikov**: PostgreSQL COPY protocol mechanics, worker architecture, TimescaleDB chunk compression.
- **CSS-Tricks**: "The Complete Guide to Bulk Loading TimescaleDB."

---

## 43. ON CONFLICT Requires Your Full Primary Key (And Other PostgreSQL Upsert Surprises)

**Commits**: `725d7d83`, `8b51dfbd`, `01e22fb6`, `eeb5195d`

**What Happened**: Same bug in three tables: `ON CONFLICT` with partial composite key → silent failures. Plus: PostgreSQL's ~32,767 parameter limit requiring batch size reduction to 100.

**The Story/Angle**: "The same bug in three different places." Small, practical lessons that save hours.

**Recommended Styles**:
- **CSS-Tricks**: "PostgreSQL ON CONFLICT: The Complete Guide to Getting It Right."

---

## 44. Building Browser Scrapers That Don't Get Blocked

**Commits**: `211fd800`, `29e8483b`, `ff60e827`, `523b0953`, `e84de376`

**What Happened**: Browser scrapers for Investing.com with Patchright stealth. Infrastructure: lifecycle manager with mutex locks, memory tracking, session metrics, health endpoint, timeout protection.

**The Story/Angle**: Beyond "just use Puppeteer" — lifecycle management, concurrency control, observability, timeout discipline.

**Recommended Styles**:
- **CSS-Tricks**: "Production Browser Automation: Beyond Puppeteer Scripts."
- **A List Apart**: The fragility of scraped data and the engineering overhead of reliability.

---

## 45. The Hybrid Data Pipeline: Reconciling Flat Files, REST APIs, and Database Caches

**Commits**: `04cf23c5`, `66fdf5b2`, `0c743ef0`, `e954099a`, `9546c94a`

**What Happened**: Three-source pipeline: S3 flat files (T-1, canonical), REST API (same-day T), cached z-scores (derived). Flat files replace API rows the next day. DTE-30 filter bug: `WHERE NOT IN` vs `CASE WHEN`.

**The Story/Angle**: Financial data has a temporal hierarchy: stale-but-reliable, fresh-but-provisional, derived. Most posts focus on one source; this reconciles all three.

**Recommended Styles**:
- **Soshnikov**: Data freshness hierarchy, upsert semantics, parity verification with SQL examples.
- **CSS-Tricks**: "The Complete Guide to Multi-Source Financial Data Pipelines."
