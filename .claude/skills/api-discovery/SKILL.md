---
name: api-discovery
description: Discover any website's API and create domain plugins with proxy routes. Use when the user wants to create an API for a website, reverse-engineer a web service, add a new domain, capture browser traffic, build typed API clients, or integrate with a third-party site. Also use when the user mentions a website name and wants to interact with it programmatically.
---

# API Discovery

Reverse-engineer how a website delivers its data, then create a domain plugin that exposes it as a typed API. Works with JSON APIs, WebSocket streams, GraphQL, gRPC-Web, SSE, encoded/obfuscated APIs, and SSR pages.

**Core principle:** Navigate as a real user. Never guess a URL. Let every endpoint reveal itself through real browser actions. **Before writing ANY route, run the Data Transport Discovery Protocol (`.claude/rules/data-transport-discovery.md`).** Interception ALWAYS over extraction — if the data exists in any network response, intercept it; DOM extraction is the absolute last resort.

**Discovery process:** Before writing ANY route, follow the investigative process in `.claude/rules/discovery-process.md` — read the page source for embedded JSON, catalog every token and auth value, interact with the page and watch network traffic, read the site's JavaScript to trace values backwards, follow every trail until you can construct any request from scratch.

**Development principle:** Use debug-logs and visual-dev skills at every step. Debug logs turn guessing into knowing. Screenshots turn assumptions into proof. **GATE: You may NOT write the next component until you have screenshotted the current one.**

**Prompt compliance gate:** Before committing: list every prompt requirement, state evidence for each (curl output, screenshot, Patchright click). Any requirement without evidence = not done. Loop until all have evidence.

**Decision rules:**

- **Intercepted data > DOM extraction. ALWAYS.** This includes encoded, obfuscated, binary, protobuf, or any other format. If data exists in ANY network response, decode and intercept it. Never fall back to DOM extraction for data that's in the wire. See `.claude/rules/data-transport-discovery.md`.
- If parsing takes more than ~5 lines of regex, escalate to a real parser. The Python bridge with NLP libraries (`dateutil`, `spacy`, `thefuzz`) is the right tool for complex text extraction — use it rather than building fragile regex chains.
- If extracted data doesn't match what the browser renders, trace the decoder — don't hack around the mismatch. See [reference/decoding.md](reference/decoding.md).
- Auto-start browser has no traffic capture. Connect via WebSocket for discovery.
- Multi-domain: use `browser.getOrCreatePage('domain-name')` to give each domain its own page. This enables `Promise.all` across domains — each page navigates independently in the same browser context.
- Domain routes should use `page.goto(url, { waitUntil: 'commit', timeout: 30000 })` directly instead of `browser.navigate()`. Wrap in try/catch — sites may redirect (ERR_ABORTED).
- Anti-bot escalation: if the persistent browser's cookies/history cause blocks (401, captcha), try a fresh `chromium.launch()`. Some sites require browsing history (use warmup); others block persistent sessions on high-value pages. Test both approaches. Use a real Chrome channel (`channel: 'chrome'`) when headless detection is active. See Phase 2 Type E.
- Never hardcode API keys or Bearer tokens in route files. The interceptor captures them from traffic automatically. See Phase 3 "Authentication" section.
- Every route must return real data from curl before you touch the dashboard.
- Pagination: always check extracted count vs total. If the API or DOM indicates more data exists, document the pagination type. See Phase 2 "Pagination Awareness".

## ⚠️ DO NOT SKIP PHASES

Phase 1 (Observe) is **NOT optional**. You MUST:
1. Connect a browser via WebSocket: `ws://localhost:3001/browser/stream?profile=<domain>&url=<target>`
2. Capture traffic: `curl -s http://localhost:3001/browser/traffic | jq '.entries | length'`
3. Screenshot the page with visual-dev skill to see what data is visible

**Auto-start browser ≠ WS-connected browser.** The server auto-starts a headless browser for simple proxy routes, but it has **NO CDP traffic capture**. If you skip WebSocket connection, `/browser/traffic` will always return 0 entries and you will be forced to guess.

**If you have not connected a browser via WS and captured traffic, you are guessing. Stop and observe.**

## Traffic Capture Pipeline

CDP (`Network.enable`) is the ONLY reliable capture method. `page.route()` only intercepts URL patterns you specify — it misses API calls to unexpected subdomains. Many sites split their API across multiple domains (e.g., `api.example.net`, `cdn.example.io`) that don't match the main site's domain.

```
Browser navigation → CDP Network.enable → captures ALL XHR/Fetch
    → setupNetworkCapture() filters to JSON, skips analytics
    → onNetworkCapture() callback → addTrafficEntry() → trafficBuffer[]
    → GET /browser/traffic returns captured entries
    → Run Data Transport Discovery Protocol → classify per data type → build routes
```

**Current capture scope:** CDP only captures `XHR` and `Fetch` request types. WebSocket frames, SSE streams, and gRPC-Web are NOT yet captured by the framework. When the transport discovery protocol identifies these transports, capture must be implemented per-domain or the CDP listener extended. See `.claude/rules/data-transport-discovery.md` for the full classification tree.

**Why the auto-start browser returns empty traffic:** `startScreencast()` calls `setupNetworkCapture()` which registers CDP listeners. But those listeners check `if (!this.networkCaptureCallback) return` — without the callback, events are silently discarded. The callback is wired ONLY inside `handleBrowserWebSocket()` when a WebSocket client connects. The auto-start browser never wires it.

**After discovery:** Once you know the endpoints, `page.route()` is fine for targeted interception in domain plugins. CDP is for the discovery phase; `page.route()` is for the production interception.

## Quick Check: Does the Domain Plugin Already Exist?

```bash
ls domains/ | grep <domain-name>
```

If it exists, read `domains/<name>/src/routes.ts` and skip to "Use Existing Domain" in [reference/phase-5-scaffold.md](reference/phase-5-scaffold.md).

## Phase Overview

| Phase | Purpose | Details |
|-------|---------|---------|
| **0. Public API** | Check for documented APIs before launching a browser | [reference/phase-0-public-api.md](reference/phase-0-public-api.md) |
| **1. Observe** | Connect browser, capture traffic, screenshot ground truth | [reference/phase-1-observe.md](reference/phase-1-observe.md) |
| **2. Classify** | Determine Type A/B/C/D per endpoint (MANDATORY gate) | [reference/phase-2-classify.md](reference/phase-2-classify.md) |
| **3. Extract** | Write routes — proxy, DOM extraction, or traffic capture | [reference/phase-3-extract.md](reference/phase-3-extract.md) |
| **4. Verify** | curl every route, confirm real data (MANDATORY gate) | [reference/phase-4-verify.md](reference/phase-4-verify.md) |
| **5. Scaffold** | Create domain plugin, register, test end-to-end | [reference/phase-5-scaffold.md](reference/phase-5-scaffold.md) |

**Cross-cutting references:**
- [reference/decoding.md](reference/decoding.md) — When API values don't match rendered DOM
- [reference/anti-bot.md](reference/anti-bot.md) — 429/403 troubleshooting checklist
- [reference/gotchas.md](reference/gotchas.md) — Common problems, singleton browser, background polling
- [reference/architecture.md](reference/architecture.md) — System architecture overview

## Critical Gates

**Phase 2 gate:** You must paste proof that the DOM contains the target data before writing a Type B extraction route. "Loading..." or zero matches = the data comes from an API. Write a Type A route instead.

**Phase 4 gate:** Do NOT proceed to the dashboard-builder skill until EVERY route returns real data from curl.

**Scaffold command:** `bash ${CLAUDE_SKILL_DIR}/scripts/scaffold-domain.sh <name> <root-domain>`
