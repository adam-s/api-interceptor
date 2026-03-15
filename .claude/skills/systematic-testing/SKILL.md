---
name: systematic-testing
description: Bottom-up systematic validation for the deep-research pipeline. Use when asked to test, debug, or verify any layer from Python worker through to the dashboard UI.
---

# Systematic Validation

When testing or debugging the pipeline, work bottom-up. Never test a higher layer until the layer below it is verified.

## The Five Layers

| Layer | Name | Key Files | Validation |
|-------|------|-----------|------------|
| L1 | Python Worker | `services/python/{etf_pairs,xgb_etf_pairs,portfolio}_worker.py` | Direct Python invocation, signal output check |
| L2 | Python Bridge | `packages/shared/src/python-bridge/bridge.ts` | IPC health check, method call, JSON-RPC protocol |
| L3 | BullMQ Jobs | `packages/jobs/src/queues/`, `packages/jobs/src/workers/` | Job enqueue, worker execution, status polling |
| L4 | API Routes | `apps/api/src/routes/` (Hono on port 3001) | `/trigger` endpoint, run status, signal retrieval |
| L5 | Dashboard UI | `apps/dashboard/` (Next.js on port 3000) | Component rendering, data display, WebSocket streaming |

Dependency chain: **L1 → L2 → L3 → L4 → L5**

### Worker → Queue → Route mapping

```
Python Worker                Queue              BullMQ Worker            API Route
────────────────────────────────────────────────────────────────────────────────────
portfolio_worker.py       → portfolioQueue  → portfolio.ts        → /portfolio/*
etf_pairs_worker.py       → etfPairsQueue   → etf-pairs.ts        → /etf-pairs/*
xgb_etf_pairs_worker.py   → xgbEtfQueue     → xgb-etf-pairs.ts    → /xgb-etf-pairs/*
```

## Per-Layer Validation

### L1 — Python Workers

**ETF Pairs** (`etf_pairs_worker.py`):
- Methods: `health`, `compute_kz_signals`, `seed_kz_state`, `get_close_prices`, `get_exit_prices`
- Session-aware: morning (hl=246, always-in) vs evening (hl=155, thresholds)
- ATM±20 strike filter on flow aggregation
- Test: trigger with known date, verify z-scores and directions match research

**XGB ETF** (`xgb_etf_pairs_worker.py`):
- Methods: `health`, `compute_xgb_signals`, `initialize_signals`, `extract_extended_features`
- Morning uses KZ always-in; evening uses walk-forward XGBoost classifier
- Test: trigger with known date, verify probabilities and directions

**Portfolio** (`portfolio_worker.py`):
- Methods: `health`, `initialize_signals`, `get_signal`, `get_stock_prices`, `get_close_prices`
- Test: trigger with known date, verify signal matches seed

**Contract**: All workers use JSON-RPC over stdin/stdout. Errors return `{id, error: {code, message}}`.

**Pitfall**: stdout is the RPC channel. Any `print()` to stdout corrupts the JSON-RPC stream. All logging must use `DEBUG()` which writes to stderr.

### L2 — Python Bridge

**Unit**: Lifecycle (start/stop/isConnected). Call health with each worker. Verify `getAvailableMethods()` returns expected methods.

**Contract**: Ready handshake — bridge waits for `{"type":"ready","methods":[...]}\n` on stdout. Requests are `{"id":uuid,"method":string,"params":{}}\n`.

**Error**: Request timeout, startup timeout (bad worker path), call before start, double start, stop with pending requests.

**Pitfall**: The `-u` flag (unbuffered Python) is critical. Without it, the ready message buffers and causes startup timeout.

**Bridge classes**:
- `PythonBridge` — base class (`packages/shared/src/python-bridge/bridge.ts`)
- `EtfPairsBridge` — ETF pairs (`packages/shared/src/python-bridge/etf-pairs-bridge.ts`)

### L3 — BullMQ Jobs

**Queues** (`packages/jobs/src/queues/`):
- `etf-pairs.ts`: `scheduleEtfPairsRuns()` registers morning (11:00 ET) + evening (15:50 ET) schedulers
- `xgb-etf-pairs.ts`: `scheduleXgbEtfRuns()` registers morning + evening schedulers
- `portfolio.ts`: `schedulePortfolioRun()` registers daily (15:45 ET) scheduler

**Workers** (`packages/jobs/src/workers/`):
- Each spawns a Python bridge, calls the worker method, writes results to DB
- `shared/etf-strategy-executor.ts` — unified trade execution for ETF strategies

**Stale job cleanup**: `drainStaleJobs()` in `packages/jobs/src/lib/drain.ts` runs at startup for all queues.

**Test**: Enqueue a job via `/trigger`, poll run status until complete, verify signals written to DB.

### L4 — API Routes

**ETF strategies** (`apps/api/src/routes/shared/etf-strategy-routes.ts`):
- `POST /etf-pairs/trigger` — accepts `{startDate, endDate, session}`, enqueues job
- `POST /xgb-etf-pairs/trigger` — same interface
- `GET /etf-pairs/runs` — list runs with status, duration, error
- `GET /etf-pairs/signals` — list signals with z-scores and directions

**Test**: Trigger a single-date run, poll until complete, query signals endpoint.

### L5 — Dashboard UI

**Pages**:
- `/etf-pairs` — signal cards, equity curve, trades tab, runs tab
- `/portfolio` — portfolio signals and trades

**Test**: Start dashboard (`cd apps/dashboard && bun dev`), navigate to page, verify data renders. Use `/visual-dev` skill for screenshot-based validation.

## Parity Validation

The gold standard: compare production output against research ground truth.

### Existing validation scripts

| Script | What it validates |
|--------|-------------------|
| `scripts/validate-etf-parity.py` | L1-L5 parity: flow ratios, returns, KZ z-scores, signals, incremental replay |
| `scripts/validate-api-db-parity.py` | API vs DB: prices and flow ratios match between Polygon REST and local DB |
| `scripts/validate-session-chain.py` | Session handoff: morning↔evening position state continuity |
| `scripts/validate-xgb-morning-parity.py` | XGB: feature extraction correctness, incremental determinism |

### Running parity checks

```bash
# Start API in DB mode (exact reproduction)
cd apps/api && bun run --env-file ../../.env --hot src/index.ts

# L1-L5 parity
PYTHONPATH=services/python python scripts/validate-etf-parity.py --session both

# API↔DB parity (requires MASSIVE_API_KEY)
PYTHONPATH=services/python python scripts/validate-api-db-parity.py --session both --n-dates 5

# Session chain (requires running API)
PYTHONPATH=services/python python scripts/validate-session-chain.py --api-url http://localhost:3001 --n-days 30

# XGB morning
PYTHONPATH=services/python python scripts/validate-xgb-morning-parity.py --n-dates 30
```

### Two data modes

- `MARKET_DATA_MODE=db` — queries `volatio_market` DB directly. Exact reproduction of research. Use for Tier 1 validation.
- `MARKET_DATA_MODE=api` — uses Polygon REST API via `massive_client.py`. Use for Tier 2 (API fidelity) validation.

### Pass criteria

| Check | Tolerance |
|-------|-----------|
| Flow ratios | < 1e-4 (DB), < 0.1 (API vs DB) |
| KZ z-scores | < 1e-10 |
| Prices | < $0.05 |
| Directions | Exact match |
| Trade counts | Exact match |

## OODA Methodology

Every validation follows observe → orient → decide → act:

```
OBSERVE  →  Trigger run or compare data
   |
ORIENT   →  Compare against reference (research .parquet, DB values, prior run)
   |
DECIDE   →  Match to tolerance? YES → advance. NO → diagnose.
   |
ACT      →  Fix bug, reset state, re-trigger. Back to OBSERVE.
```

Reference: `docs/temp/ooda-production-testing.md` (4 layers of confidence), `docs/temp/ooda-parity-validation.md` (L1-L5 patterns).

## Fix Before Ascending

When a test fails at any layer, fix it before moving up. If L3 BullMQ job fails, check L2 bridge and L1 worker first.

## When Tests Fail Unexpectedly

Use the `/debug-logs` skill to add targeted `DEBUG()` calls:

- **systematic-testing**: what to test and in what order
- **debug-logs**: how to observe runtime behavior when a test reveals unexpected results

Log file: `/tmp/deep-research-debug/debug-YYYY-MM-DD.log` (shared by TypeScript and Python).

## Test Runner

```bash
bun test                  # all vitest tests (workspace mode)
bun run e2e               # playwright e2e tests
```

Vitest config: `vitest.config.ts` (root) with projects: `packages/db`, `packages/shared`, `packages/browser`, `apps/api`, `apps/web`.

Test files follow `*.test.ts` pattern, co-located with source.
