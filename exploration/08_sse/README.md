# The Connection That Never Closes

The E2E tests passed locally. In CI, they hung forever.

Not a flaky assertion. Not a missing dependency. The test runner was waiting for the network to go idle, and the network never went idle, because we had an SSE connection open. Server-Sent Events keep a persistent HTTP connection alive — that's the whole point. But every tool in the ecosystem assumes connections eventually close.

This is a story about what breaks when they don't.

---

We were building a trading dashboard. Real-time price updates, position changes, signal alerts — the kind of thing where polling every 5 seconds isn't fast enough and WebSockets are more machinery than you need. SSE was the obvious choice. One-directional server push over HTTP. The browser's built-in `EventSource` API handles reconnection automatically. No socket.io, no ws, no protocol upgrades.

The server side is almost comically simple. Here's the entire pattern in a Next.js Route Handler:

```typescript
export async function GET(request: Request) {
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: object) => {
        controller.enqueue(
          encoder.encode(`event: state\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      // Send current state immediately
      send(getState());

      // Clean up when client disconnects
      request.signal.addEventListener("abort", () => {
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
```

The client is even simpler:

```typescript
const es = new EventSource("/api/events");
es.addEventListener("state", (e) => {
  setState(JSON.parse(e.data));
});
```

That's it. Server pushes, client receives. Works on the first try.

And then you ship it.

---

The first bug didn't look like a bug. Playwright has a method called `waitForLoadState('networkidle')`. It waits until there are no network connections for 500 milliseconds. We used it everywhere — a reasonable way to ensure the page was fully loaded before asserting.

With SSE, the network is never idle. `networkidle` becomes `waitForever`.

The fix was embarrassingly simple. Instead of waiting for the network, wait for the thing you actually care about:

```typescript
// Before
await page.waitForLoadState('networkidle');

// After
await expect(
  page.getByRole('button', { name: /New Session/i })
).toBeVisible({ timeout: 15000 });
```

But the bug wasn't in our code. It was in our assumption. We assumed the network would eventually settle down, because that's how web pages have worked for 30 years. SSE breaks that assumption.

---

The second bug was a framework thing. We had routes like this:

```
GET /signals/stream   → SSE endpoint
GET /signals/stats    → aggregation endpoint
GET /signals/:id      → single signal by ID
```

The parameterized route `/:id` was registered first. When a request came in for `/stream`, the router parsed "stream" as the `:id` parameter, tried to look up a signal with ID "stream", and returned 500.

The fix: specific routes before parameterized ones. In Next.js App Router this isn't an issue — the file system does it for you. But in any framework with manual route registration, order matters, and SSE endpoints often have paths that look like they could be parameters.

---

The third bug was the most insidious, because it looked like the feature was working. The dashboard updated in real time. Signals appeared, prices changed, everything looked alive.

But every 3 seconds, the entire UI flickered. Every component unmounted and remounted. The scrollbar jumped to the top. Selected rows deselected. It was like the page was refreshing itself.

The SSE stream was pushing state every 3 seconds. React was receiving it and calling `setState`. React re-rendered. The problem: the state hadn't actually changed. The server was sending the same data, and React was faithfully re-rendering it.

The fix is a single line:

```typescript
es.addEventListener("state", (e) => {
  if (e.data === lastJsonRef.current) return;
  lastJsonRef.current = e.data;
  setState(JSON.parse(e.data));
});
```

Compare the raw JSON string before parsing. If nothing changed, don't update state. The server should also do this — compare `JSON.stringify(state)` before broadcasting — but the client guard is essential because you can't trust every SSE server to be well-behaved.

This is a React problem that only manifests with SSE, because SSE is the only pattern where the server pushes data at an interval without the client requesting it. With polling, you control the cadence. With WebSockets, you usually have request-response semantics. SSE just streams.

---

The fourth bug was the loudest. Every time a user navigated away from the dashboard, the Node.js error logs filled with `ECONNRESET`. Stack traces, error codes, the works. It looked like the server was crashing.

It wasn't. The browser was closing the SSE connection normally — that's what happens when you navigate away. But Node.js interprets a client-initiated TCP reset as an error. The connection was functioning correctly. The error handling was wrong.

```typescript
// In server instrumentation
process.on('uncaughtException', (error) => {
  if (error.code === 'ECONNRESET') return;
  if (error.message === 'aborted') return;
  console.error('Uncaught Exception:', error);
});
```

We suppress `ECONNRESET` in development. In production, you'd want structured logging that classifies this as expected behavior rather than an error. The point is: a normal SSE lifecycle — connect, receive data, navigate away — produces an error in Node.js. That's not a bug in your code. It's a mismatch between Node's error model and SSE's connection model.

---

The fifth bug was a test race condition, and it taught us the most important lesson about testing event-driven systems.

We had a background job that emitted progress events: 0%, 50%, 100%. The test waited for the job to complete, then asserted that all three progress events had been received.

Sometimes the test passed. Sometimes it didn't. The job completed before the progress events arrived at the test. "Completed" is a producer concept — it means the work is done. But the events are in transit. The consumer hasn't received them yet.

```typescript
// Wrong: wait for the producer
await worker.on('completed');
assert(progressValues).toEqual([0, 50, 100]); // race condition

// Right: wait for the consumer
const done = new Promise((resolve) => {
  queueEvents.on('progress', ({ data }) => {
    if (data === 100) resolve();
  });
});
await done;
assert(progressValues).toEqual([0, 50, 100]); // deterministic
```

Wait for the event, not the producer. This applies everywhere — not just SSE, but any system where the thing that generates events is separate from the thing that consumes them.

---

The sixth bug was invisible. Everything worked in development, where the dashboard and API ran on the same port. In staging, they were on different origins. The SSE connection failed silently.

CORS with credentials has a specific rule that trips up everyone: you cannot use `Access-Control-Allow-Origin: *` with credentials. You must echo the specific requesting origin. This is a browser security requirement, and it applies to `EventSource` connections just like any other fetch.

Same-origin SSE (like Next.js Route Handlers) avoids this entirely. If your SSE endpoint lives inside your Next.js app, there are no CORS issues. This is one reason to prefer Route Handlers over a separate API server for SSE.

---

Six bugs. Six assumptions that SSE violates:

1. The network eventually goes idle. (It doesn't.)
2. Route parameters won't match literal path segments. (They will.)
3. Pushing the same data won't cause re-renders. (It will.)
4. Closing a connection isn't an error. (Node thinks it is.)
5. When the producer is done, the consumer has received everything. (It hasn't.)
6. `Access-Control-Allow-Origin: *` works with credentials. (It doesn't.)

None of these are in any SSE tutorial. The tutorials show you `new EventSource()` and `text/event-stream` and call it done. The implementation is the easy part. Living with a connection that never closes — integrating it into your test infrastructure, your error handling, your React rendering, your deployment topology — that's where the real work is.

SSE isn't hard to implement. It's hard to live with.
