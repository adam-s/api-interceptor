# Two Runtimes, One Timeline

We had a bug where the Python bridge returned correct stats but the dashboard showed stale values. The TypeScript logs said the SSE broadcast fired. The Python logs said the computation finished. Both were right. Both were useless — because they were in different files, in different formats, with different clocks.

TypeScript logged to the console with `console.log`. Python logged to stderr with `print()`. To reconstruct what happened, you'd open two terminals, eyeball the timestamps, and try to mentally interleave them. At 15:32:01.442 Python finished computing. At 15:32:01.??? TypeScript received the response. Did it? The console had already scrolled past it.

---

The fix was 90 lines of code split across two languages. Both write to the same file. Same format. Same clock. Same function signature.

TypeScript:

```typescript
DEBUG("api/compute", "calling bridge", () => ({ count: numbers.length }));
```

Python:

```python
DEBUG("worker.compute", "computed stats", lambda: {"count": len(floats), "mean": result["mean"]})
```

Output:

```text
[2026-02-16T21:15:10.801Z] [DEBUG] [api/compute] calling bridge {"count":20}
[2026-02-16T21:15:10.803Z] [DEBUG] [PythonBridge.call] method="compute" {"paramKeys":["numbers"]}
[2026-02-16T21:15:10.805Z] [DEBUG] [worker.compute] computed stats {"count":20,"mean":42.5}
[2026-02-16T21:15:10.806Z] [DEBUG] [api/compute] result {"mean":42.5,"median":41}
```

Four lines. Two runtimes. One timeline. You can `grep` it, `tail -f` it, diff it against yesterday's log.

---

The interesting design decision was where the two runtimes meet. The obvious answer is the bridge — TypeScript spawns Python, so TypeScript should collect Python's logs and write them somewhere. That's what we tried first. The bridge captured Python's stderr and relayed it to the TypeScript log file.

This created a problem. Python's DEBUG() wrote to stderr. The bridge read stderr and wrote to the log file. But Python also wrote to the log file directly. Every Python debug line appeared twice.

The solution was to stop relaying. Python writes to the file itself. TypeScript writes to the file itself. Neither knows about the other's writes. The shared contract isn't a function call or a message — it's a file path and a format string.

```
/tmp/deep-research-debug/debug-YYYY-MM-DD.log
[{ISO timestamp}] [DEBUG] [{location}] {message} {json data}
```

That's the interface. Two runtimes, zero coordination, one timeline.

---

The lazy data factory is the part that matters most in production and matters least in the blog post, so I'll keep it short. Debug logging that's always on needs to be free when you're not looking at it. Both implementations take a function, not an object:

```typescript
// TypeScript — the factory only runs when DEBUG_ENABLED is true
DEBUG("api/compute", "result", () => ({
  mean: result.mean,
  median: result.median,
}));
```

```python
# Python — same pattern, lambda instead of arrow function
DEBUG("worker.compute", "computed stats", lambda: {
    "count": len(floats), "mean": result["mean"]
})
```

If logging is disabled (production, test), the factory never executes. No object allocation, no `JSON.stringify`, no string concatenation. The call site is a function reference check — effectively free.

If the factory throws, both implementations catch it and log `{"_error": "boom"}` instead of crashing your application because of a debug statement. Debug logging that can crash the thing it's debugging isn't debug logging.

---

The enable/disable logic is identical in both languages. Enabled by default in development. Disabled in production and test. Override with `DEBUG_LOGGING=true` to force it on anywhere.

```typescript
const DEBUG_ENABLED =
  process.env.DEBUG_LOGGING === "true" ||
  (process.env.NODE_ENV !== "production" &&
   process.env.NODE_ENV !== "test");
```

```python
_DEBUG_ENABLED = (
    os.environ.get("DEBUG_LOGGING", "").lower() == "true"
    or os.environ.get("NODE_ENV", "").lower() not in ("production", "test")
)
```

The `test` exclusion keeps debug output out of Vitest's console. When a test fails, you want assertion errors, not two hundred lines of `[DEBUG] [tick] {"count":1}`. But when a test fails and you can't figure out why, `DEBUG_LOGGING=true pnpm test` turns it back on.

---

The architecture ended up with four layers, each writing to the same file:

```
Browser (React)
    │
    ▼
API Route (Next.js)          DEBUG("api/compute", ...)  ──→  log file
    │
    ▼
PythonBridge (shared pkg)    DEBUG("PythonBridge.call", ...)  ──→  log file
    │ stdin/stdout
    ▼
Python Worker                DEBUG("worker.compute", ...)  ──→  log file
```

The web app re-exports DEBUG from the shared package — five lines replacing a 75-line local implementation. The bridge logs spawn, ready, call, and stop events. The Python worker logs computation results. The API routes log incoming requests and outgoing responses.

When something breaks, `tail -f /tmp/deep-research-debug/debug-*.log` shows the full request lifecycle across both runtimes in chronological order. No log aggregation service. No distributed tracing. A file.

---

Volatio's production system has the same pattern at larger scale — a Python worker computing breadth consensus signals over IPC, with TypeScript orchestrating the pipeline. The debug log there interleaves BullMQ job progress, Python divergence calculations, bridge lifecycle events, and API responses. Same file, same format, same `tail -f`.

The pattern scales down to a counter app and up to a trading system because the interface is the simplest possible thing: append a line to a file. No schema to version. No transport to configure. No dependency to install. Both runtimes have `appendFileSync` and `open(path, "a")` in their standard libraries.

The fancier version of this is OpenTelemetry with Jaeger and trace IDs propagated through context. We'll probably get there. But the version that costs ninety lines and zero infrastructure is the one you'll actually use at 2 AM when the bridge is hanging and you need to know which side stopped talking.
