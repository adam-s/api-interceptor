# Blog Ideas: Product & Frontend

12 blog ideas about the trading system, dashboard UI, signals, testing, and the features that were built (and sometimes deleted).

---

## 58. Tailwind v4: Everything That Changed and Nobody Documented

**Commits**: `b3b6d3e5`, `de1dc6b5`, `0258e706`, `7990de73`, `b2f773ba`

**What Happened**: Tailwind CSS v4 adopted from initial scaffold. Immediate rough edges: VS Code warnings for `@theme`/`@source` directives, CSS module type declarations needed for TypeScript, shadcn/ui sidebar class syntax changes. Pattern of "adopt early, fix incrementally" — every few commits included another Tailwind v4 fix.

**The Story/Angle**: Tailwind v4 is a ground-up rewrite with CSS-native configuration. The ecosystem hasn't caught up. VS Code warnings, shadcn/ui incompatibilities, TypeScript CSS module declarations — paper cuts that add up.

**Recommended Styles**:
- **CSS-Tricks**: "Tailwind v4 in Production: What Actually Changed." Definitive reference covering `@theme`, CSS-native config, VS Code setup, shadcn/ui compatibility.

---

## 59. The Admin Dashboard Nobody Wants to Build (Until They Need It)

**Commits**: `1e1492b3`, `99bf3bea`, `ca573c3b`, `c2a2c28a`

**What Happened**: Runtime admin dashboard: config toggle system, BullMQ job queue monitor with SSE streaming, queue pause/resume with optimistic UI, scheduled job visibility. Job service: 397 lines wrapping BullMQ's APIs.

**The Story/Angle**: Admin dashboards are "eat your vegetables." SSE streaming for real-time job status is a clean alternative to WebSockets. The optimistic update pattern for admin UIs deserves first-class attention.

**Recommended Styles**:
- **CSS-Tricks**: "Building a Real-Time Job Queue Dashboard with BullMQ and SSE."
- **A List Apart**: "The Dashboard You Build at 3 AM." Internal tools deserve design attention too.

---

## 60. Building a Bloomberg Terminal in a Browser (With No Bloomberg)

**Commits**: `e4578c0c`, `c73fb87a`, `bba4a136`, `d41096b6`, `0b6a4bbd`, `61ed364a`

**What Happened**: Four rapid phases (Dec 16-17): server-side paged stock screener, news intelligence with virtualized scroll, economic intelligence with FRED charts, corporate intelligence with SEC filings. Terminal-style UI: sticky headers, zebra striping, `tabular-nums`, keyboard navigation.

**The Story/Angle**: The hard part of a financial terminal isn't the data — it's the UI density and interaction design. Bloomberg terminals are 40 years old and their patterns persist because they solve real cognitive load problems.

**Recommended Styles**:
- **A List Apart**: The real challenge in data-dense applications is the interaction layer, not the data layer.
- **CSS-Tricks**: Guide to data-dense React UIs: server-side paging, virtualized scrolling, keyboard shortcuts, sticky headers.

---

## 61. Shipping a Paper Trading Platform in a Day

**Commits**: `0982f925`, `26570424`, `4bff57b3`, `429bddf4`, `967e274e`, `1f174352`

**What Happened**: Between 10:50 AM and 7:07 PM on Dec 23: database schema, CRUD API, trade execution with slippage, NextAuth cookie auth, options trading with real-time Greeks, Bloomberg-inspired keyboard UI, four-page dashboard. Main commit: 28 files, +6,631 lines.

**The Story/Angle**: Not just velocity but what makes it possible: well-structured monorepo, shared packages, existing Robinhood browser API as a data source. The options chain UI (Delta, IV, Bid, Ask, Strike, keyboard nav, 5-second refresh) shows what "professional-grade" means.

**Recommended Styles**:
- **A List Apart**: "Your platform is the product, the features are just its expression." Compounding returns of internal platform investment.
- **Soshnikov**: Trade execution model (slippage, fractional shares), position aggregation, market hours validation.

---

## 62. Building a Signal Detection System on Christmas Day

**Commits**: `fed69f9e`, `5660de54`, `5ebca21a`, `ba2c0701`, `eb0c3aa4`, `f0b85669`, `287f54b3`, `b46678ec`, `0838f145`, `209ef88e`

**What Happened**: Dec 25: Signal Registry with 10 signal types and explicit data dependency tracking. Five detectors built plus ML-based News Direction (TF-IDF ported from Python to TypeScript — 30,000-line JSON model file). SSE dashboard with evidence panel, toast notifications, tab title updates. SSE route ordering bug (Hono's `/:id` matched `/stream`).

**The Story/Angle**: Two angles: (1) porting TF-IDF from Python to TypeScript to avoid cross-language latency, and (2) the Signal Registry pattern — signals declare data dependencies so a validator can determine impact when a data feed goes down. This is dependency injection for data pipelines.

**Recommended Styles**:
- **Soshnikov**: Signal Registry architecture — dependency declaration, freshness requirements, impact analysis. TF-IDF math and implementation.
- **Overreacted**: The SSE route ordering bug where Hono interprets "stream" as a UUID parameter.

---

## 63. ~~Preventing SSE Dashboard Flicker: The Deceptively Hard Real-Time UI Problem~~

> **Covered** in [exploration/08_sse/README.md](../../../exploration/08_sse/README.md) — bugs #2 (route ordering) and #3 (dashboard flashing) in "The Connection That Never Closes"

**Commits**: `eb0c3aa4`, `f0b85669`, `ba2c0701`

**What Happened**: Three rapid bugs: (1) Hono `/:id` matched `/stream` and `/stats` → 500 errors. (2) Every 3-second SSE push triggered React re-render even when data unchanged → panel flash. (3) `ResizablePanel` with conditional `defaultSize` → layout shifts. Fixes: reorder routes, JSON-compare before setState, fixed panel sizes.

**The Story/Angle**: Real-time dashboards look simple until you build one. SSE + React creates specific performance bugs invisible from either technology alone.

**Recommended Styles**:
- **CSS-Tricks**: "Building Real-Time Dashboards with SSE and React Without the Flicker."
- **Soshnikov**: The technical mechanism of SSE + React reconciliation.

---

## 64. The Feature You Build Then Delete (Discord Alerts in 8 Minutes)

**Commits**: `f82b7600`, `b49dc17a`

**What Happened**: 7:30 AM: Full Discord notification system built (webhook, BullMQ event subscriptions, rate limiting, test endpoint). 7:38 AM: Entire feature deleted. Pipeline health dashboard survived; Discord didn't.

**The Story/Angle**: Building something and immediately deleting it. The act of building clarified that the abstraction was wrong.

**Recommended Styles**:
- **Overreacted**: Short, punchy. Build, ship, delete, all before 8 AM. The insight: "I need alerting" (true) vs. "I need Discord alerting on BullMQ events" (false).

---

## 65. Your Trading Calendar Is Wrong (And Your Backtests Know It)

**Commits**: `23155cc8`, `399deb46`, `b4a39e51`

**What Happened**: `getPreviousTradingDay()` only skipped weekends, not US market holidays. Dedicated calendar module created. News signal lookback increased from 5 to 30 minutes due to timing gaps.

**The Story/Angle**: Market holidays are deceptively simple — Juneteenth? Good Friday? Day after Thanksgiving? Wrong calendar = requesting data for closed markets = stale data corrupting signals.

**Recommended Styles**:
- **Overreacted**: "Your calendar is part of your model."

---

## 66. Kill Your Darlings: Deleting 5,600 Lines of Working Code

**Commits**: `89afe659`, `8562807e`, `b5130c44`, `cb8fb68a`

**What Happened**: Two commits gutted poll-based replay (~5,591 lines) and all non-Laplace strategies (MA crossover, options risk-rotation, SEC 8K spike, extrinsic flow). Features that worked, had tests, were built within the same two weeks. Research showed only Laplace had alpha.

**The Story/Angle**: The willingness to throw away working code is the real engineering discipline. The research pipeline provided evidence to cut confidently rather than sentimentally.

**Recommended Styles**:
- **Overreacted**: From "look at all these strategies" to "only one matters" — counterintuitive insight.
- **A List Apart**: Research-driven deletion culture is more valuable than shipping velocity.

---

## 67. The FIFO Position Model: When "Buy" and "Sell" Are Not Enough

**Commits**: `a6070524`, `d665dd45`, `305f973b`, `a1538224`, `3e96eed7`, `6ca81bd3`

**What Happened**: Short positions broke P&L. "Sell" could mean "close a long" or "open a short" — the system silently dropped short P&L. Fix: `TradeIntent` enum (`open_long`, `close_long`, `open_short`, `close_short`) plus FIFO matching for cost basis. Breaking schema change (migration 0011). Bonus: Hono `/ledger` route matched by `/:id`.

**The Story/Angle**: The English word "sell" is ambiguous in trading systems, and this ambiguity silently corrupts P&L. Most tutorials show long-only FIFO. Add short positions and your data model must distinguish intent from direction.

**Recommended Styles**:
- **Soshnikov**: FIFO matching with directional intent, cost basis computation, working through specific examples.
- **CSS-Tricks**: "Building a FIFO Trade Ledger from Scratch" with every edge case.

---

## 68. Building a Trading System in Phases: The Unified Architecture

**Commits**: `0ccabcdb`, `1c4bb124`, `c3a6fafd`, `4e2fe7c5`, `8e334049`, `d2050593`, `ffc8003f`, `6e652c26`

**What Happened**: 7+ phases over 5 days: schema/events (unified trades table for live/paper/replay/synthetic), pure functions (positions, metrics, P&L), event handlers (TradeRecorder, PositionCalculator), executor/resolver, API routes, dashboard, entry/exit filters. `TruthBus` event pattern, mode/intent as orthogonal trade dimensions.

**The Story/Angle**: Showing the phased construction, not just the final architecture. How `TradeEvent` contract stabilized early, how replay mode acts as continuous integration for trading logic.

**Recommended Styles**:
- **CSS-Tricks**: "Complete guide" with named phases, interfaces, and progression diagrams.
- **Soshnikov**: The pure function layer (positions, metrics, P&L) as financial computation primitives.

---

## 69. Building a Strategy Execution Framework in Five Phases

**Commits**: `043252a1`, `4b6335d0`, `9ce0af8c`, `89b94532`, `ce6effdf`, `0095df1e`, `aeb9195d`

**What Happened**: Phase 0 (DB consolidation + contracts), Phase 1 (strategy abstraction: `SignalGenerator`, `ExitRule`, `PositionSizer`), Phase 2 (executor + BullMQ), Phase 3 (position monitoring), Phase 5 (production readiness). 750+ tests, observability metrics, strategy registry.

**The Story/Angle**: Transforming research signals into automated paper trading. Clean phased approach with independently testable stages. The contracts package as single source of truth.

**Recommended Styles**:
- **CSS-Tricks**: "Complete Guide to Building a Strategy Execution Framework."
- **Soshnikov**: The strategy abstraction layer as a design pattern with formal definitions.
