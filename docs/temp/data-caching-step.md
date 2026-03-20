# Data Caching Step: Bridge Between API Discovery and UI Development

## The Problem

After discovering APIs and building routes, the agent jumps straight into dashboard UI development. Every page reload, every component iteration, every screenshot hits the live API — which means 30-60s browser navigation per request. A 10-iteration UI polish cycle takes 10+ minutes of pure waiting.

## The Solution: Cache Step

After routes are proven with curl, cache ALL the real data to disk as fixtures. Then build the entire dashboard UI against the cached data. The cache is instant (0ms), deterministic (same data every time), and doesn't require a browser session.

```
Phase 1: Discover API (browser required)
Phase 2: Build routes + prove with curl (browser required)
Phase 3: Cache real data to disk ← NEW STEP
Phase 4: Build dashboard UI (NO browser needed — instant from cache)
Phase 5: Integration test with live API (browser required, final verification)
```

## How It Works

### Step 3a: Capture Real Data

After each route is proven with curl, save the response:

```bash
# For each working route, save real data as a fixture
mkdir -p data/fixtures/{domain}

curl -s http://localhost:3001/api/youtube/search?q=react+hooks > data/fixtures/youtube/search-react-hooks.json
curl -s http://localhost:3001/api/youtube/video/dQw4w9WgXcQ > data/fixtures/youtube/video-dQw4w9WgXcQ.json
curl -s http://localhost:3001/api/youtube/channel/UCsBjURrPoezykLs9EqgamOA > data/fixtures/youtube/channel-fireship.json

curl -s http://localhost:3001/api/yahoo-finance/quote/SPY > data/fixtures/yahoo-finance/quote-SPY.json
curl -s http://localhost:3001/api/yahoo-finance/stream/SPY?duration=10 > data/fixtures/yahoo-finance/stream-SPY.json
```

### Step 3b: Create Fixture Index

Generate a manifest that maps route patterns to fixture files:

```json
{
  "youtube": {
    "search": { "default": "search-react-hooks.json", "variants": {"q=taylor+swift": "search-taylor.json"} },
    "video": { "default": "video-dQw4w9WgXcQ.json" },
    "channel": { "default": "channel-fireship.json" }
  }
}
```

### Step 3c: Enable Fixture Mode

The DataService (or API server) serves cached data when `FIXTURE_DIR` is set:

```bash
# UI development mode — instant responses, no browser needed
FIXTURE_DIR=data/fixtures pnpm --filter @interceptor/api dev

# Live mode — real browser navigation
pnpm --filter @interceptor/api dev
```

## Why This Step is Critical

| Without cache step | With cache step |
|---|---|
| UI reload = 30-60s (browser navigation) | UI reload = 0ms (disk read) |
| Browser session required for UI dev | No browser needed |
| Data changes between requests (live) | Deterministic data (same every time) |
| Rate limiting / WAF blocks during UI iteration | No rate limiting |
| Agent wastes tokens waiting for browser | Agent focuses purely on UI |
| Can't iterate UI without network access | Offline UI development works |

## Integration with the Iteration Loop

### Before (current flow):
```
Step 0: Requirements
Step 1: API Discovery (browser)
Step 2: Build routes (browser)
Step 3: Build dashboard UI (browser — SLOW)
Step 4: Screenshot verification
Step 5: Compliance matrix
```

### After (with cache step):
```
Step 0: Requirements
Step 1: API Discovery (browser)
Step 2: Build routes + prove with curl (browser)
Step 3: Cache all route responses to disk (NEW — one-time browser cost)
Step 4: Build dashboard UI against cached data (NO browser — FAST)
Step 5: Screenshot verification (no browser needed — cached data renders instantly)
Step 6: Integration test with live API (browser — one final check)
Step 7: Compliance matrix
```

## What Gets Cached

For each route, capture:
- **Default response** — the happy path with real data
- **Search variants** — 2-3 different queries to test search UI
- **Empty state** — a query that returns zero results (for empty state UI)
- **Error response** — what the API returns on 404/500 (for error state UI)
- **Pagination** — page 1 and page 2 (for pagination UI)

This gives the UI agent everything it needs to build and test all states without a single live request.

## Fixture File Naming Convention

```
data/fixtures/{domain}/{route}-{variant}.json

data/fixtures/youtube/search-react-hooks.json
data/fixtures/youtube/search-empty.json
data/fixtures/youtube/video-dQw4w9WgXcQ.json
data/fixtures/stubhub/events-lakers.json
data/fixtures/stubhub/tickets-event-123.json
```

## For Sub-Agent Instruction Tuning

When testing dashboard-builder instructions with sub-agents, provide fixtures upfront:
- Agent doesn't need to discover APIs or build routes (already done)
- Agent focuses purely on UI quality
- Results are deterministic and comparable across A/B tests
- Cache eliminates the browser as a variable — UI quality is the only thing being measured

## Cache Invalidation

Fixtures are snapshots, not live data. They go stale. Rules:
- **During UI development:** Never invalidate. Stale data is fine — we're iterating on layout, not data freshness.
- **Before final integration test:** Re-capture with live API to verify the data shape hasn't changed.
- **After API route changes:** Re-capture affected fixtures.
- **Fixtures live on test branches, not base** — they contain domain-specific data.
