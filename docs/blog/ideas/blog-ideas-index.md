# Blog Ideas Index

69 blog ideas extracted from 611 commits across the Volatio project. Each idea is grouped by theme with recommended writing style(s).

**Style Key:**
- **Overreacted** — Personal narrative, "aha" moments, debugging journeys
- **A List Apart** — Persuasive editorial essay arguing a thesis
- **CSS-Tricks** — Comprehensive bookmarkable reference guide
- **Soshnikov** — Textbook deep-dive with definitions, diagrams, code

---

## Architecture & DevOps (25 ideas)

See [blog-ideas-architecture-devops.md](blog-ideas-architecture-devops.md) for full details.

| # | Title | One-Liner | Styles |
|---|-------|-----------|--------|
| 1 | Scaffolding a Full-Stack Monorepo in a Weekend with AI | 11-phase scaffold from empty repo to full monorepo — docs-first, code-second | Overreacted, A List Apart |
| 2 | The Zod 3 to Zod 4 Migration Nobody Warned You About | Zod 4 broke react-hook-form; fix requires switching to `standardSchemaResolver` | CSS-Tricks, Soshnikov |
| 3 | Building an Auth System You'll Actually Debug at 2 AM | NextAuth v5 + Drizzle + Playwright E2E — the gap between "works in dev" and "works in CI" | Overreacted, CSS-Tricks |
| 4 | Making E2E Tests Fast Enough to Actually Run | 2.6 minutes to 20 seconds via `storageState`, port isolation, and browser caching | Soshnikov, Overreacted |
| 5 | Building a Provider Architecture You Can Actually Extend | `defineProvider()` + `PipelineBuilder` + `SchedulerRegistry` — the monorepo platform layer | A List Apart, Soshnikov |
| 6 | .env Files in a Bun Monorepo: Harder Than You Think | Bun doesn't load root `.env` from sub-packages; 10-minute fix, 2-hour debug | Overreacted |
| 7 | The Great Monorepo Cleanup: A One-Day Refactoring Sprint | Domain schemas, versioned routes, Knip found 69 unused exports, Turborepo added | Overreacted, A List Apart |
| 8 | Seventeen Commits to Log In | NextAuth v5 behind Caddy reverse proxy in Docker on EC2 — a 17-commit debugging saga | Overreacted, CSS-Tricks |
| 9 | Dockerizing a Bun + Next.js Monorepo: Eight Fixes in Two Hours | pnpm for builds, bun for runtime, standalone output paths, tsconfig copying | CSS-Tricks, Overreacted |
| 10 | The Dockerfile That Took Seven Tries | Bun + pnpm + Patchright + glibc + ARM64 = seven sequential Docker fix commits | Overreacted, CSS-Tricks |
| 11 | Your Healthcheck Is a Fork Bomb | Docker HEALTHCHECK imported the full BullMQ worker, spawning zombie processes every 30s | Overreacted |
| 12 | Lazy Initialization, or How an Import Broke CI | Transitive import opened a database connection; Proxy-based lazy init fixed it | A List Apart, Soshnikov |
| 13 | Next.js Environment Variables Are Baked at Build Time | `NEXT_PUBLIC_*`, CSP `connect-src`, and `AUTH_SECRET` in Edge — three deployment gotchas | CSS-Tricks |
| 14 | The Patchright Dependency That Infected Everything | One browser library cascaded through bundler, Docker, pnpm, Bun CPU bugs, and ARM64 | Overreacted, A List Apart |
| 15 | From 20,000 Lines to Zero | Replaced a broken job system by deleting 20,497 lines and adding 2,864 | Overreacted, A List Apart |
| 16 | Making a Monorepo Reproducible From Scratch | `.env.example`, seed data, migration fixes, `make setup` — fresh clone to running dashboard | A List Apart, CSS-Tricks |
| 17 | Seven Attempts to Make a Database Migration Non-Interactive | `yes` pipe, `CI=true`, `TERM=dumb`, then finally `drizzle-orm migrate()` | Overreacted, A List Apart |
| 18 | Bun Inlines Your Environment Variables at Build Time | `NODE_ENV` hardcoded by Bun bundler broke auth cookie names in production | Overreacted, CSS-Tricks |
| 19 | Database Consolidation in a Running Monorepo | Merging `@volatio/db` and `@volatio/market-db` across 51+ files with zero downtime | A List Apart, Soshnikov |
| 20 | The ioredis Version Trap: Phantom Type Errors | `AbstractConnector is not AbstractConnector` — same class from two package versions | Overreacted |
| 21 | ~~SSE, networkidle, and the Playwright Tests That Never Finished~~ | **Written** → [exploration/08_sse](../../exploration/08_sse/README.md) "The Connection That Never Closes" | Overreacted |
| 22 | The Synthetic Development Environment | Seeded PRNG prices, `DataProvider` abstraction, `pnpm dev:synthetic` — no API keys needed | A List Apart, CSS-Tricks |
| 23 | Making Simulations Survive Server Restarts | Four architectures: HTTP → SSE → in-memory registry → BullMQ job persistence | Soshnikov, A List Apart |
| 24 | Bridging Python and TypeScript: IPC Patterns | JSON-RPC over stdin/stdout, stderr for logging, five-hop progress chain | Soshnikov, CSS-Tricks |
| 25 | E2E Tests as Architecture Documentation | Rewritten three times through three refactors — tests as living architecture maps | A List Apart, Overreacted |

---

## Data Engineering (20 ideas)

See [blog-ideas-data-engineering.md](blog-ideas-data-engineering.md) for full details.

| # | Title | One-Liner | Styles |
|---|-------|-----------|--------|
| 26 | Scraping the Web Without Getting Caught (Ethically) | Playwright → Patchright → browser pools → `defineScraperProvider` | Overreacted, CSS-Tricks |
| 27 | Building an Economic Calendar from Three Different APIs | Investing.com, TradingEconomics, direct API — three experiments, one winner | Overreacted, A List Apart |
| 28 | Building a Financial Data Lake from Scratch | 374M minute bars, 334K news articles, SEC filings, Fed docs — all in TimescaleDB | CSS-Tricks, A List Apart |
| 29 | Reverse-Engineering a Financial Data API: XOR, Gzip, and Stealth | TradingEconomics CloudFront API uses XOR+gzip encryption on responses | Soshnikov, Overreacted |
| 30 | Building an Economic Events System End-to-End | Full vertical slice: TimescaleDB schema → API → visx charts → scheduling | CSS-Tricks, A List Apart |
| 31 | Eleven Scrapers in Forty-Eight Hours | The power of repeatable patterns — first scraper took hours, last took minutes | Overreacted, CSS-Tricks |
| 32 | The Economic Release Capture Problem | Capturing GDP/CPI at the moment of release — temporal constraints, fire-and-forget caching | Soshnikov, Overreacted |
| 33 | The Scraper Registry Pattern | `defineScraper()` with metadata, schedule hints, rate limits — extracted after scraper #10 | CSS-Tricks, A List Apart |
| 34 | Rate Limiting as Architecture | Five strategies for five constraints: quotas, anti-detection, reliability, resources, anti-scraping | A List Apart, Soshnikov |
| 35 | One Browser at a Time: Taming Headless Chromium with BullMQ | `concurrency=1` → priority queues → rate limiting → incremental sync | Soshnikov, Overreacted |
| 36 | Streaming a Remote Browser Through WebSockets | CDP `Page.screencast`, canvas coordinate mapping, copy/paste over WebSocket | CSS-Tricks, Soshnikov |
| 37 | The Pipeline Health Problem: Knowing When Your Data Is Stale | Monitor data freshness, not job execution — `/health/pipeline` endpoint | A List Apart, Overreacted |
| 38 | Nanoseconds, Time Zones, and Other Ways Financial Data Betrays You | 19-digit timestamps, BigInt conversion, scrape-but-don't-persist bugs | Overreacted, Soshnikov |
| 39 | The Browser That Wanted to Be Human | FingerprintJS blocking, WebGL spoofing, browsing history warmup, residential proxies | Overreacted, CSS-Tricks |
| 40 | When Yahoo Finance Moved to SvelteKit and Broke Everything | Silent sitemap migration, double-fix, static date closure bug at midnight | Overreacted, A List Apart |
| 41 | The Operational Reality of Headless Browsers in Docker | Zombie Chrome via tini, persistent profiles, lifecycle management, BuildKit caches | CSS-Tricks, A List Apart |
| 42 | Ingesting 2.6 Billion Options Records with PostgreSQL COPY | INSERT → COPY protocol, multiprocess workers, 60M rows/hour | Soshnikov, CSS-Tricks |
| 43 | ON CONFLICT Requires Your Full Primary Key | Same bug in three tables — partial composite key matches silently fail | CSS-Tricks |
| 44 | Building Browser Scrapers That Don't Get Blocked | Lifecycle management, concurrency control, observability, stealth, timeout discipline | CSS-Tricks, A List Apart |
| 45 | The Hybrid Data Pipeline | Flat files (T-1) + REST API (same-day) + cached z-scores — three sources, one truth | Soshnikov, CSS-Tricks |

---

## Research & Quantitative Finance (12 ideas)

See [blog-ideas-research-quant.md](blog-ideas-research-quant.md) for full details.

| # | Title | One-Liner | Styles |
|---|-------|-----------|--------|
| 46 | News Headlines Cannot Predict Stock Prices (And Here Is the Proof) | 62.8% accuracy collapsed to 50% at scale — temporal leakage and the 30-minute gap | Overreacted, Soshnikov |
| 47 | From Macro Signals to Sector Rotation: A Quantitative Research Sprint | 22 economic series, OECD paradox, composite model backtested in a single day | Soshnikov, Overreacted |
| 48 | The 30-Minute Gap: Why Publication Delay Breaks Financial ML | News available 30 minutes after the price already moved — predicting the present | Overreacted |
| 49 | When Your Model Works Too Well: Focal Loss and Coverage-Accuracy | 81% accuracy at 6.3% coverage vs 74.4% at 36.3% — the dual-model routing solution | Soshnikov, A List Apart |
| 50 | The 78% Accuracy That Wasn't | Timezone bug in `AT TIME ZONE` inflated options flow accuracy from 61.7% to 78.4% | Overreacted, Soshnikov |
| 51 | 100 Experiments, Zero Alpha | Systematic negative results across options flow, calendar events, SEC 8-K, extrinsic value | A List Apart, Overreacted |
| 52 | The Look-Ahead Bias That Ate Our Alpha | Cooldown used T+1 returns for T decisions — Sharpe collapsed from +9.86 to +0.25 | Overreacted, Soshnikov |
| 53 | Three Signal Systems and a Funeral | Laplace, divergence, flow-regime all deleted — 60,000 lines removed, one system survived | Overreacted, A List Apart |
| 54 | Achieving 100% Signal Parity Between Research and Production | Seven parity bugs: bucket look-ahead, stale prev_price, unstable sort, missing holiday | CSS-Tricks, Soshnikov |
| 55 | The Research Experiment Factory: 80 Experiments in 80 Commits | Shared audit framework, 15-proof validation, Optuna, structured experiment directories | CSS-Tricks, A List Apart |
| 56 | When Deep Learning Loses to `if` Statements: VXX Regime Trading | LSTM and Transformer both lost to hand-crafted rules; 12-proof audit framework | A List Apart, Overreacted |
| 57 | Research-to-Production Parity: The Laplace Signal Bridge | 0/6 fixture z-scores correct initially — the gap between notebook and production | Soshnikov, Overreacted |

---

## Product & Frontend (12 ideas)

See [blog-ideas-product-frontend.md](blog-ideas-product-frontend.md) for full details.

| # | Title | One-Liner | Styles |
|---|-------|-----------|--------|
| 58 | Tailwind v4: Everything That Changed and Nobody Documented | `@theme`, `@source`, CSS module types, shadcn/ui incompatibilities | CSS-Tricks |
| 59 | The Admin Dashboard Nobody Wants to Build (Until They Need It) | BullMQ monitor with SSE, optimistic queue pause/resume, runtime config toggles | CSS-Tricks, A List Apart |
| 60 | Building a Bloomberg Terminal in a Browser (With No Bloomberg) | Four-phase data terminal: screener, news, economic, corporate intelligence | A List Apart, CSS-Tricks |
| 61 | Shipping a Paper Trading Platform in a Day | Full paper trading system (schema, API, options UI, dashboard) in 8 hours | A List Apart, Soshnikov |
| 62 | Building a Signal Detection System on Christmas Day | Signal Registry, 5 detectors, TF-IDF port from Python to TypeScript, SSE dashboard | Soshnikov, Overreacted |
| 63 | ~~Preventing SSE Dashboard Flicker~~ | **Covered** in [exploration/08_sse](../../exploration/08_sse/README.md) (bugs #2, #3) | Overreacted |
| 64 | The Feature You Build Then Delete (Discord Alerts in 8 Minutes) | Built and deleted a Discord alert system in 8 minutes flat | Overreacted |
| 65 | Your Trading Calendar Is Wrong (And Your Backtests Know It) | `getPreviousTradingDay()` only skipped weekends, not Juneteenth or Good Friday | Overreacted |
| 66 | Kill Your Darlings: Deleting 5,600 Lines of Working Code | MA crossover, options risk-rotation, poll-based replay — all built, tested, and deleted | Overreacted, A List Apart |
| 67 | The FIFO Position Model: When "Buy" and "Sell" Are Not Enough | Short positions broke P&L — `TradeIntent` enum made semantics explicit | Soshnikov, CSS-Tricks |
| 68 | Building a Trading System in Phases | TruthBus events, mode/intent orthogonal dimensions, 7 phases over 5 days | CSS-Tricks, Soshnikov |
| 69 | Building a Strategy Execution Framework in Five Phases | `SignalGenerator` → `ExitRule` → `PositionSizer` pipeline, strategy registry, 750+ tests | CSS-Tricks, Soshnikov |

---

## Style Distribution

| Style | Primary | Secondary | Total |
|-------|---------|-----------|-------|
| Overreacted | 28 | 17 | 45 |
| CSS-Tricks | 18 | 17 | 35 |
| A List Apart | 11 | 17 | 28 |
| Soshnikov | 12 | 14 | 26 |

---

## Top 10 Strongest Ideas

These have the most compelling narrative, broadest audience, and clearest angle:

1. **#52 — The Look-Ahead Bias That Ate Our Alpha** — Sharpe 9.86 to 0.25; universal quant cautionary tale
2. **#8 — Seventeen Commits to Log In** — Every Next.js deployer will relate
3. **#11 — Your Healthcheck Is a Fork Bomb** — Perfect short-form hook
4. **#46 — News Headlines Cannot Predict Stock Prices** — Contrarian, data-backed
5. **#31 — Eleven Scrapers in Forty-Eight Hours** — Velocity + pattern story
6. **#39 — The Browser That Wanted to Be Human** — Anti-detection arms race
7. **#50 — The 78% Accuracy That Wasn't** — Timezone bug destroys results
8. **#15 — From 20,000 Lines to Zero** — Deletion as engineering discipline
9. ~~**#21 — SSE, networkidle, and the Playwright Tests That Never Finished**~~ — **Written** → [exploration/08_sse](../../exploration/08_sse/README.md)
10. **#17 — Seven Attempts to Make a DB Migration Non-Interactive** — Comedy of errors
