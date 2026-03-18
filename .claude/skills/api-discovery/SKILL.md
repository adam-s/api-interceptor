---
name: api-discovery
description: Discover any website's API and create domain plugins with proxy routes. Use when the user wants to create an API for a website, reverse-engineer a web service, add a new domain, capture browser traffic, build typed API clients, or integrate with a third-party site. Also use when the user mentions a website name and wants to interact with it programmatically.
---

# API Discovery

Reverse-engineer how a website delivers its data, then create a domain plugin that exposes it as a typed API. Works with JSON APIs, SSR pages, and hybrid sites.

**Core principle:** Navigate as a real user. Never guess a URL. Let every endpoint reveal itself through real browser actions.

**Development principle:** Use debug-logs and visual-dev skills at every step. Debug logs turn guessing into knowing. Screenshots turn assumptions into proof. **GATE: You may NOT write the next component until you have screenshotted the current one.**

**Prompt compliance gate:** Before committing: list every prompt requirement, state evidence for each (curl output, screenshot, Patchright click). Any requirement without evidence = not done. Loop until all have evidence.

**Decision rules:**

- Intercepted JSON > DOM extraction. Always prefer the site's internal API over scraping HTML.
- If parsing takes more than ~5 lines of regex, use a real parser (cheerio, beautifulsoup, or Python NLP via bridge).
- If extracted data doesn't match what the browser renders, trace the decoder — don't hack around the mismatch. See [reference/decoding.md](reference/decoding.md).
- Auto-start browser has no traffic capture. Connect via WebSocket for discovery.
- One browser, sequential calls. Never `Promise.all` across browser-dependent domains.
- Every route must return real data from curl before you touch the dashboard.

## ⚠️ DO NOT SKIP PHASES

Phase 1 (Observe) is **NOT optional**. You MUST:
1. Connect a browser via WebSocket: `ws://localhost:3001/browser/stream?profile=<domain>&url=<target>`
2. Capture traffic: `curl -s http://localhost:3001/browser/traffic | jq '.entries | length'`
3. Screenshot the page with visual-dev skill to see what data is visible

**Auto-start browser ≠ WS-connected browser.** The server auto-starts a headless browser for simple proxy routes, but it has **NO CDP traffic capture**. If you skip WebSocket connection, `/browser/traffic` will always return 0 entries and you will be forced to guess.

**If you have not connected a browser via WS and captured traffic, you are guessing. Stop and observe.**

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
