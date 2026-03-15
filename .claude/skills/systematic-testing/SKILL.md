---
name: systematic-testing
description: Bottom-up systematic validation for the deep-research pipeline. Use when asked to test, debug, or verify any layer from Python worker through to the dashboard UI.
---

# Systematic Validation

When testing or debugging the pipeline, work bottom-up. Never test a higher layer until the layer below it is verified.

## The Four Layers

| Layer | Name | Key Files | Tests |
|-------|------|-----------|-------|
| L1 | Python Worker | `services/python/worker.py` | None standalone |
| L2 | PythonBridge | `packages/shared/src/python-bridge/bridge.ts` | `bridge.test.ts` (8) |
| L3 | API Routes + State | `apps/web/src/app/api/`, `apps/web/src/lib/state.ts` | `state.test.ts` (12) |
| L4 | Dashboard UI | `apps/web/src/app/multiplier-panel.tsx` | None |

Dependency chain: **L1 → L2 → L3 → L4**

## Per-Layer Validation

At each layer, verify three things:

### L1 — Python Worker

**Unit**: Import `handle_compute` and `handle_health` directly. Test known inputs (`[2,4,6,8,10]` → `mean=6, stdev≈3.162`). Test edge cases: single element (stdev=0), empty list (raises ValueError).

**Contract**: `compute` returns `{mean, median, stdev, min, max, count}` as numbers. `health` returns `{status, service, version}`. Errors return `{id, error: {code, message}}`.

**Error**: Non-JSON on stdin → no crash (worker does `continue` on JSONDecodeError). Unknown method → error code -32601. `numbers: "not-a-list"` → ValueError.

**Pitfall**: stdout is the RPC channel. Any `print()` to stdout (not stderr) corrupts the JSON-RPC stream and hangs the bridge. All logging must use `DEBUG()` which writes to stderr.

### L2 — PythonBridge

**Unit**: Lifecycle (start/stop/isConnected). Call health and compute with known inputs. `getAvailableMethods()` returns `["health", "compute"]` after start.

**Contract**: Ready handshake — bridge waits for `{"type":"ready","methods":[...]}\n` as the first stdout line. Requests are `{"id":uuid,"method":string,"params":{}}\n`. Responses resolve/reject the correct pending promise by matching UUID.

**Error**: Request timeout (`timeoutMs: 50`). Startup timeout (bad worker path). Call before start. Double start. Stop with pending requests.

**Pitfall**: The `-u` flag (unbuffered) on the spawned Python process is critical. Without it, the ready message may buffer in Python's stdout and never arrive, causing a startup timeout.

### L3 — API Routes + State

**Unit**: State module is well tested. Verify: initial state, setMultiplier clamping [-10,10], tick increments by multiplier, pause/play, broadcast dedup, client add/remove, history truncation at MAX_HISTORY=20, resetState.

**Contract**: `POST /api/compute` expects `{numbers: number[]}`, returns `{mean, median, stdev, min, max, count}`. `POST /api/multiplier` expects `{action: string, value?: number}`, returns `State`. `GET /api/events` returns SSE stream: `event: state\ndata: JSON\n\n`.

**Error**: `/api/compute` with `[]` or `[1]` (< 2 numbers) → 400. `/api/multiplier` with `set` but no `value` → 400. Unknown action → 400.

**Pitfall**: Turbopack module isolation. In dev mode, `next dev --turbopack` can create separate module instances for `state.ts`, so the compute route and SSE route may see different state singletons. This only affects integration testing — unit tests with direct imports are fine.

### L4 — Dashboard UI

**Unit**: Renders "Connecting..." when state is null. Shows count, multiplier, controls when connected. Stats section shows "--" when stats is null, numbers when populated.

**Contract**: SSE client listens for `event: state` events. Auto-compute fires `POST /api/compute` when `history.length >= 2` changes. `computingRef` prevents concurrent requests.

**Error**: SSE disconnect shows "Disconnected". Compute fetch failure is silently caught. Reset clears stats to null.

## Boundary Verification

### A: Python → Bridge (stdin/stdout IPC)

- Worker sends `{"type":"ready","methods":[...]}\n` on startup
- Bridge writes `{"id":uuid,"method":string,"params":{}}\n` to stdin
- Worker replies `{"id":same-uuid,"result":...}\n` or `{"id":same-uuid,"error":{code,message}}\n`
- **Channel rule**: stdout = RPC only, stderr = DEBUG only

### B: Bridge → Routes (module import)

- `apps/web/src/lib/bridge.ts` lazy-initializes a singleton via `getBridge()`
- Second call returns same instance if `isConnected()` is true
- Singleton lifecycle outlives individual HTTP requests

### C: Routes → SSE → UI (HTTP + Server-Sent Events)

- `POST /api/multiplier` mutates state → `broadcast()` → pushes to all SSE clients
- `GET /api/events` registers client via `addClient(controller)`, sends initial state
- UI `EventSource` parses `event: state\ndata: ...\n\n`, updates React state

## Fix Before Ascending

When a test fails at any layer, fix it before moving up. If L2 bridge tests show the worker sends malformed JSON, fix the worker (L1) first. Don't patch around it at the bridge level.

## Integration Last

After all layers pass individually:

1. Start the bridge, call `compute` with known numbers, verify response, stop
2. If Next.js is running: `POST /api/multiplier` → wait for tick → `GET /api/multiplier` → verify count changed → `POST /api/compute` → verify stats

If an integration test fails, go back to the specific layer's tests to debug — don't debug in the integration test.

## When Tests Fail Unexpectedly

Use the `/debug-logs` skill to add targeted `DEBUG()` calls. The two skills complement each other:

- **systematic-testing**: what to test and in what order
- **debug-logs**: how to observe runtime behavior when a test reveals unexpected results

Log file: `/tmp/deep-research-debug/debug-YYYY-MM-DD.log` (shared by TypeScript and Python)

## Test Runner

```bash
pnpm test              # all tests (workspace mode)
pnpm turbo test        # all tests via Turborepo
```

Test files follow `*.test.ts` pattern, co-located with source.
