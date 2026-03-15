# Two Protocols Walk Into a Server

We had SSE working. It was elegant — a `ReadableStream` that pushed JSON state through `text/event-stream`, the browser's built-in `EventSource` handling reconnection, the whole thing testable with `curl`. We even wrote a [blog post](../08_sse/README.md) about the six bugs we hit along the way. The connection that never closes. We were proud of it.

Then we needed to stream JPEG frames from a browser to a client.

CDP screencast pushes raw JPEG bytes at render speed — 10, 15, sometimes 30 frames per second. Each frame is a `Buffer` of binary data. SSE is a text protocol. You can base64-encode binary into SSE's `data:` field, but base64 inflates every frame by 33%, and you're paying the cost of encoding and decoding on every single frame. At 15 FPS with 50KB frames, that's an extra 250KB per second of pure overhead, plus the CPU cost of encoding on the server and decoding on the client. For a protocol whose entire value proposition is simplicity, we'd be fighting the format.

So we needed WebSocket. The question was whether we also still needed SSE.

---

The obvious architecture is both. SSE for the multiplier state updates (it's already working), WebSocket for the binary screencast frames (it's the only option). Every tutorial on real-time web says this is fine. Use the right tool for each job. Clean separation of concerns.

But "clean separation" is a concept that lives on whiteboards. In a running system, two real-time protocols means two sets of connection logic. Two heartbeat strategies — SSE uses a `:heartbeat\n\n` comment every 15 seconds to keep the connection alive; WebSocket uses ping/pong frames at the protocol level. Two reconnection paths — `EventSource` retries automatically with exponential backoff; `WebSocket` gives you an `onclose` event and wishes you luck. Two sets of error handling. Two things to monitor. Two things that can be half-broken in production while the other half works fine, making the bug report "sometimes the dashboard updates but the video doesn't" or "the video works but the multiplier is frozen."

I stared at this for a while. The SSE code was working. The blog post was written. There was real gravity pulling me toward keeping it.

But I kept coming back to a simpler question: if I were starting today, knowing I need both state push and binary streaming, would I use two protocols? No. Obviously not. I'd use WebSocket for everything. The only reason to keep SSE was that it already existed.

That's not a reason. That's inertia.

---

The migration itself was almost anticlimactic. The state engine — the actual logic of tracking a multiplier, counting ticks, managing pause/play, broadcasting to connected clients — is about 50 lines of code. It didn't change at all. Here's the `sendTo` function from the SSE version:

```typescript
function sendTo(client: Client, state: State): void {
  if (client.closed) return;
  try {
    const message = `event: state\ndata: ${JSON.stringify(state)}\n\n`;
    client.controller.enqueue(encoder.encode(message));
  } catch {
    client.closed = true;
    clients.delete(client);
  }
}
```

And here's the WebSocket version:

```typescript
function sendTo(client: WsClient, state: State): void {
  if (client.closed) return;
  try {
    client.ws.send(JSON.stringify({ type: "state", data: state }));
  } catch {
    client.closed = true;
    clients.delete(client);
  }
}
```

The structure is identical. The error handling is identical. The client-tracking `Set`, the `broadcast()` loop, the JSON dedup guard, the `addClient` and `removeClient` lifecycle — all unchanged. The only difference is the transport: `controller.enqueue(encoder.encode(...))` became `ws.send(...)`. We rewrote three lines.

The state module moved from `apps/web/src/lib/state.ts` (inside the Next.js app, because SSE routes lived there) to `apps/api/src/state.ts` (a Hono/Bun API server, because WebSocket upgrade needs a real server). The `Client` interface changed from wrapping a `ReadableStreamDefaultController` to wrapping a `WSContext`. The twelve unit tests ported over with one find-and-replace.

The SSE endpoint — that `GET` route handler with its `ReadableStream`, its heartbeat interval, its `request.signal.addEventListener("abort", ...)` cleanup — disappeared entirely. The REST action endpoint — the `POST` handler with its `switch` on `body.action` — also disappeared. Both were replaced by a single WebSocket message handler:

```typescript
onMessage(event: MessageEvent, ws: WSContext) {
  const msg = JSON.parse(event.data as string);
  switch (msg.type) {
    case "increment":
      setMultiplier(getState().multiplier + 1);
      break;
    case "decrement":
      setMultiplier(getState().multiplier - 1);
      break;
    case "pause":
      setRunning(false);
      break;
    case "play":
      setRunning(true);
      break;
    case "reset":
      resetState();
      break;
  }
}
```

That's it. No `fetch()`. No `POST`. No response body. The client sends `{ type: "increment" }` and the server broadcasts the new state to everyone. The response *is* the broadcast.

---

But there is one place where SSE was genuinely better, and I miss it.

SSE has named events built into the protocol. The server sends `event: state\ndata: {...}\n\n` and the client listens with `es.addEventListener("state", ...)`. The event type is part of the wire format. The browser parses it for you. You can have `event: state`, `event: error`, `event: progress` on the same stream, and the client subscribes to each one independently with separate handlers. The protocol does the dispatch.

WebSocket gives you a raw pipe. A `message` event with `event.data`, and whatever's in there is your problem. So you build your own envelope:

```typescript
{ type: "state", data: { multiplier: 3, count: 42, ... } }
```

And on the client, you parse every message and dispatch manually:

```typescript
ws.addEventListener("message", (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "state") { ... }
  else if (msg.type === "compute:result") { ... }
  else if (msg.type === "compute:error") { ... }
});
```

This is fine. It's a few lines of code. But it's a few lines of code that SSE handled for free at the protocol level. Every WebSocket application reinvents this dispatch, and every one does it slightly differently. Some use `type`, some use `event`, some use `action`. Some nest the payload under `data`, some spread it at the top level. SSE had one answer. WebSocket has as many answers as there are applications.

---

The deeper shift is about request-response semantics.

With SSE, the architecture was naturally clean. State updates flowed down through the event stream. Actions flowed up through REST. Every `fetch("/api/multiplier", { method: "POST", body: ... })` got its own HTTP response with the new state. The action and its result were coupled by the request-response cycle itself. You didn't have to think about it.

With WebSocket, actions and responses share one channel. The client sends `{ type: "compute", requestId: "abc-123", numbers: [1, 2, 3] }` and gets back `{ type: "compute:result", requestId: "abc-123", data: { mean: 2 } }` some time later. That `requestId` exists because the channel is shared — if two compute requests are in flight, you need to match each response to its request. It's a correlation ID. You're building request-response on top of a protocol that doesn't have it.

SSE never had this problem because it never tried to be bidirectional. The separation was the feature. State goes down the stream; actions go through REST; the two paths never cross. Simple. With WebSocket, you gain bidirectionality and immediately need machinery to manage it.

Our `handleCompute` function routes a WebSocket message to a Python bridge, waits for the result, then sends the response back through the same socket with the `requestId` attached. It's not complicated — maybe 15 lines of code. But it's 15 lines that exist solely because WebSocket doesn't distinguish requests from pushes.

---

Here's what we actually lost:

Built-in reconnection. `EventSource` retries automatically when the connection drops. `WebSocket` fires `onclose` and leaves the rest to you. We'll need to write a reconnection loop with backoff, and we'll probably get it wrong the first time.

The ability to test with `curl`. The SSE endpoint was a GET request that returned a stream. `curl -N http://localhost:3000/api/events` and you're watching state updates in your terminal. WebSocket needs `websocat` or a custom script. It's a small thing, but small things add up when you're debugging at midnight.

The simplicity of the endpoint itself. The SSE route was 25 lines of boilerplate that any HTTP framework understands. The WebSocket upgrade requires framework-specific support — Hono's `createBunWebSocket()`, the `upgradeWebSocket` helper, the `websocket` export on the server config. Different frameworks wire this up differently.

Here's what we gained:

One protocol. The screencast frames and the state updates flow through the same connection infrastructure. One heartbeat strategy. One reconnection path. One set of connection lifecycle events.

Binary support. JPEG frames go over the wire as raw `ArrayBuffer` with zero encoding overhead. `ws.send(frame.bytes)` and on the client `ws.binaryType = 'arraybuffer'`. The screencast that motivated this whole migration works without fighting the transport.

Bidirectional communication. The Python compute bridge — send numbers, get statistics back — works through the same connection. No separate REST endpoint, no CORS configuration, no extra `fetch()`.

---

I keep thinking about a line I almost wrote in the SSE blog post: "SSE is the right answer." It would have been true at the time. For server-push state updates over HTTP, SSE is genuinely simpler than WebSocket. Less code, better browser support for reconnection, built-in event dispatch, works with standard HTTP infrastructure.

But "the right answer" depends on the question, and the question changed.

SSE is the right answer when you need server push and nothing else. The moment you need anything else — binary data, bidirectional messaging, request-response over a persistent connection — you need WebSocket. And keeping SSE around "for the simple stuff" is how you end up maintaining two of everything. Two connection managers, two heartbeat intervals, two reconnection strategies, two sets of bugs, two blog posts explaining why each one is the right choice.

We chose one. The state engine didn't notice.
