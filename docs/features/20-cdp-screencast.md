# A Complete Guide to CDP Screencast

Streaming a browser session to a remote viewer usually starts with polling `page.screenshot()` in a loop. It works, but it's slow—each screenshot is a full-page render, and you're paying the cost of PNG encoding, base64 serialization, and round-trip latency on every frame. At 1 FPS that's tolerable. At 10 FPS the CPU pegs and frames start dropping.

CDP's `Page.screencast` solves this natively. Chrome pushes JPEG frames to you at its own render rate, and you control the flow with acknowledgements. Here's the simplest possible version:

```typescript
const cdp = await context.newCDPSession(page);

cdp.on('Page.screencastFrame', (evt) => {
  const bytes = Buffer.from(evt.data, 'base64');
  sendToClient(bytes);
  cdp.send('Page.screencastFrameAck', { sessionId: evt.sessionId });
});

await cdp.send('Page.startScreencast', {
  format: 'jpeg',
  quality: 70,
  maxWidth: 1280,
  maxHeight: 720,
});
```

That's a working screencast in twelve lines. Let's break down how it works and everything else you need to know.

---

## Table of Contents

- [Background](#background)
- [Getting a CDP Session](#getting-a-cdp-session)
- [startScreencast Options](#startscreencast-options)
  - [format](#format)
  - [quality](#quality)
  - [maxWidth & maxHeight](#maxwidth--maxheight)
  - [everyNthFrame](#everynthframe)
- [The screencastFrame Event](#the-screencastframe-event)
- [The ACK Protocol](#the-ack-protocol)
- [Frame Throttling](#frame-throttling)
  - [The Double-Buffer Pattern](#the-double-buffer-pattern)
- [Streaming Over WebSocket](#streaming-over-websocket)
- [Page Switching](#page-switching)
- [Common Pitfalls](#common-pitfalls)
- [Common Patterns](#common-patterns)
- [Cleanup](#cleanup)

---

## Background

CDP (Chrome DevTools Protocol) is the low-level protocol that Chrome DevTools uses to communicate with the browser. Playwright and Patchright expose it through `context.newCDPSession(page)`, giving you direct access to protocol commands.

`Page.screencast` is a CDP domain command that tells Chrome to continuously capture the visible page as JPEG or PNG frames and send them as events. Unlike `page.screenshot()`, which is a request-response cycle, screencast is push-based—Chrome decides when to send a new frame based on visual changes.

**Requires:** Patchright or Playwright. Works with headless and headed modes. The examples here use Patchright.

---

## Getting a CDP Session

```typescript
import { chromium } from 'patchright';

const context = await chromium.launchPersistentContext('/tmp/profile', {
  headless: false,
  viewport: { width: 1280, height: 720 },
});

const page = context.pages()[0] ?? await context.newPage();
const cdp = await context.newCDPSession(page);
```

The CDP session is bound to a specific page. If the user opens a new tab, you need a new session for that tab. We'll cover page switching later.

---

## startScreencast Options

```typescript
await cdp.send('Page.startScreencast', {
  format: 'jpeg' | 'png',
  quality: 0-100,
  maxWidth: number,
  maxHeight: number,
  everyNthFrame: number,
});
```

### format

Controls the image encoding for each frame.

- `'jpeg'` (recommended): Lossy compression. Smaller frames, faster encoding. Use for streaming where latency matters more than pixel accuracy.
- `'png'`: Lossless. Larger frames, slower encoding. Use only when you need exact pixel reproduction (visual regression testing).

> **Gotcha:** PNG frames at 1280x720 are typically 500KB-2MB each. At 4 FPS, that's 2-8 MB/s of bandwidth. JPEG at quality 70 is usually 30-80KB per frame.

### quality

JPEG quality from 0 (worst) to 100 (best). Only applies when `format` is `'jpeg'`. Ignored for PNG.

- `30`: Adequate for monitoring. Visible compression artifacts but UI elements readable.
- `70`: Good default. Clear text, minimal artifacts.
- `90+`: Diminishing returns. Frame size doubles for marginal quality improvement.

```typescript
// Low bandwidth: monitoring dashboard
{ format: 'jpeg', quality: 30 }

// Interactive use: user controlling the browser
{ format: 'jpeg', quality: 70 }
```

### maxWidth & maxHeight

Maximum dimensions for the captured frame. Chrome scales down if the viewport is larger than these values. Does not upscale.

- Should match your viewport dimensions for 1:1 capture
- Reducing these below viewport size saves bandwidth at the cost of resolution
- Input coordinates (clicks, mouse moves) must map to viewport dimensions, not frame dimensions

```typescript
// 1:1 capture (recommended)
{ maxWidth: 1280, maxHeight: 720 }

// Half resolution for bandwidth savings
{ maxWidth: 640, maxHeight: 360 }
```

> **Gotcha:** If you use `deviceScaleFactor: 2` for HiDPI, the internal render is 2x the viewport. Set `maxWidth`/`maxHeight` to the viewport size, not the internal size, or you'll get frames twice as large as expected.

### everyNthFrame

Tells Chrome to send every Nth frame instead of every frame.

- `1` (default): Every frame
- `2`: Every other frame
- `5`: Every fifth frame

> **Gotcha:** This does NOT reliably control frame rate. Chrome's internal render rate varies based on page complexity, animations, and system load. Setting `everyNthFrame: 5` doesn't mean "5 FPS"—it means "skip 4 out of every 5 frames that Chrome happens to render." If Chrome renders 60 frames during an animation, you get 12. If the page is static and Chrome renders 2 frames, you get 0. For reliable frame rate control, use server-side throttling instead.

---

## The screencastFrame Event

```typescript
cdp.on('Page.screencastFrame', (evt) => {
  evt.data;        // Base64-encoded image string
  evt.sessionId;   // Integer ID for ACK protocol
  evt.metadata;    // { offsetTop, pageScaleFactor, deviceWidth, deviceHeight, scrollOffsetX, scrollOffsetY, timestamp }
});
```

The `data` field is a base64 string. Decode it to get raw bytes:

```typescript
const bytes = Buffer.from(evt.data, 'base64');
// bytes is a Uint8Array containing JPEG or PNG image data
```

The `metadata.timestamp` is a seconds-since-epoch floating point. Convert to milliseconds:

```typescript
const timestampMs = evt.metadata.timestamp
  ? evt.metadata.timestamp * 1000
  : Date.now();
```

---

## The ACK Protocol

After processing a frame, you must acknowledge it. Chrome will not send the next frame until the previous one is ACKed.

```typescript
await cdp.send('Page.screencastFrameAck', {
  sessionId: evt.sessionId,
});
```

> **Gotcha:** If you forget to ACK, the screencast silently stops after one frame. There's no error, no timeout, no warning. It just freezes. This is the single most common screencast bug.

For streaming applications, ACK immediately—don't wait for the frame to be sent to the client:

```typescript
cdp.on('Page.screencastFrame', (evt) => {
  // ACK immediately to keep the pipeline flowing
  void cdp.send('Page.screencastFrameAck', { sessionId: evt.sessionId });

  // Then process the frame asynchronously
  processFrame(evt.data);
});
```

The `void` keyword prevents unhandled promise warnings while keeping the ACK fire-and-forget.

---

## Frame Throttling

CDP fires frames at Chrome's internal render rate. During animations or page loads, that can be 30-60 frames per second. Your WebSocket to the client probably can't handle that, and most use cases don't need it.

The naive approach—using `everyNthFrame`—doesn't work reliably because Chrome's render rate is variable. Server-side throttling gives you consistent output regardless of Chrome's behavior.

### The Double-Buffer Pattern

Keep only the latest frame. Send at a fixed interval. Drop everything in between.

```typescript
let lastFrameSentAt = 0;
let pendingFrame: FrameData | null = null;
const frameIntervalMs = 1000; // 1 FPS

cdp.on('Page.screencastFrame', (evt) => {
  void cdp.send('Page.screencastFrameAck', { sessionId: evt.sessionId });

  const bytes = Buffer.from(evt.data, 'base64');
  const frame = { bytes: new Uint8Array(bytes), timestamp: Date.now() };

  const now = Date.now();
  const elapsed = now - lastFrameSentAt;

  if (elapsed >= frameIntervalMs) {
    // Enough time has passed — send immediately
    lastFrameSentAt = now;
    pendingFrame = null;
    sendToClient(frame);
  } else {
    // Too soon — store as pending (overwrites previous pending)
    const hadPending = pendingFrame !== null;
    pendingFrame = frame;

    if (!hadPending) {
      // Schedule send for remaining interval time
      setTimeout(() => {
        if (pendingFrame) {
          lastFrameSentAt = Date.now();
          sendToClient(pendingFrame);
          pendingFrame = null;
        }
      }, frameIntervalMs - elapsed);
    }
  }
});
```

Why "double-buffer"? At any moment there are at most two frames in play: the one most recently sent, and the one waiting to be sent. Everything else is dropped. The client always sees the most recent state, never a queue of stale frames.

To change the frame rate dynamically:

```typescript
function setFps(fps: number) {
  frameIntervalMs = Math.floor(1000 / Math.max(0.5, Math.min(30, fps)));
}
```

---

## Streaming Over WebSocket

The typical architecture: CDP screencast pushes frames to your server, the double-buffer pattern throttles them, and a WebSocket pushes the surviving frames to the browser client.

```typescript
// Server side (Hono/Express WebSocket handler)
ws.on('open', () => {
  service.start((frame) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(frame.bytes); // Send raw JPEG bytes
    }
  });
});

ws.on('close', () => {
  service.stop();
});
```

```typescript
// Client side (browser)
const ws = new WebSocket('wss://your-server/stream');
ws.binaryType = 'arraybuffer';

const img = document.getElementById('stream') as HTMLImageElement;

ws.onmessage = (event) => {
  const blob = new Blob([event.data], { type: 'image/jpeg' });
  const url = URL.createObjectURL(blob);
  img.onload = () => URL.revokeObjectURL(url);
  img.src = url;
};
```

> **Gotcha:** Always set `ws.binaryType = 'arraybuffer'`. The default is `'blob'`, which adds overhead for converting to an image URL. With `'arraybuffer'` you skip one copy.

---

## Page Switching

When the user opens a new tab or a link navigates to a new page, you need to transfer the screencast to the new page.

```typescript
async function switchPage(newPage: Page): Promise<void> {
  // Stop current screencast
  await cdp.send('Page.stopScreencast');
  await cdp.detach();

  // Start new session on new page
  cdp = await context.newCDPSession(newPage);
  // Re-attach screencastFrame listener...
  await cdp.send('Page.startScreencast', { /* same options */ });
}

// Listen for new tabs
context.on('page', async (newPage) => {
  await newPage.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
  await switchPage(newPage);
});
```

---

## Common Pitfalls

**Screencast freezes after one frame.** You forgot to ACK. Send `Page.screencastFrameAck` for every frame.

**Frames arrive faster than expected.** `everyNthFrame` is not a frame rate limiter. Use the double-buffer pattern for consistent output.

**Frames look blurry.** Check that `maxWidth`/`maxHeight` match your viewport, and that `deviceScaleFactor` isn't creating oversized renders that get downscaled.

**High CPU usage.** PNG encoding is expensive. Switch to JPEG. Reduce quality below 70 if you don't need crisp text.

**WebSocket backpressure.** If the client can't consume frames fast enough, buffer on the server. The double-buffer pattern handles this naturally since it only keeps the latest frame.

**Memory leak on page switch.** Always `cdp.detach()` the old session before creating a new one. Orphaned CDP sessions hold references to the page.

---

## Common Patterns

### Monitoring dashboard (low bandwidth)

```typescript
{ format: 'jpeg', quality: 30, maxWidth: 1024, maxHeight: 576, everyNthFrame: 1 }
// + server-side throttle at 1 FPS
// ~20-40 KB/s bandwidth
```

### Interactive remote browser (user controlling)

```typescript
{ format: 'jpeg', quality: 70, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 }
// + server-side throttle at 4 FPS
// ~120-320 KB/s bandwidth
```

### Visual regression capture (pixel-perfect)

```typescript
{ format: 'png', maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 }
// No throttling — capture every frame
// High bandwidth, use only for short captures
```

---

## Cleanup

Always stop the screencast and detach the CDP session when done:

```typescript
await cdp.send('Page.stopScreencast');
await cdp.detach();
cdp = null;
```

If the browser crashes or the context closes, the CDP session becomes invalid. Wrap detach in try-catch:

```typescript
try {
  await cdp.send('Page.stopScreencast');
  await cdp.detach();
} catch {
  // CDP session already invalid
} finally {
  cdp = null;
}
```

---

*Last updated: February 2026. Based on Chromium 131 / Patchright 1.57.0.*
