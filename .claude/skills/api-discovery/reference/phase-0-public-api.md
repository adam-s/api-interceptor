# Phase 0: Public API Check (RESTRICTED)

> **GATE: This phase is ONLY applicable when ALL of the following are true:**
> 1. The user's prompt explicitly requests using a known public API (e.g., "use the Reddit API" or "use the GitHub API")
> 2. OR: You have already completed Phases 1-2, produced a Transport Classification table, and discovered that the site's internal endpoints require authentication you cannot obtain via browser interception
>
> **Do NOT use this phase to skip browser-based discovery.** The project's core purpose is intercepting internal browser traffic. Searching for public APIs as a first step violates the #1 Rule in CLAUDE.md.
>
> **If the user's prompt says "discover the API for example.com" or similar, this means browser traffic interception — NOT searching for public API documentation.** Go directly to Phase 1.

## When this phase applies

Public APIs are appropriate when:
- The user explicitly asks to use a documented API and provides credentials
- A CLI tool (yt-dlp, gallery-dl) covers the exact use case and the user requests it

Public APIs are NOT appropriate when:
- You haven't tried browser interception yet
- You assume the site "probably has an API"
- You want to avoid the complexity of browser traffic capture
- You don't have API keys (we almost never do)

## How to check (ONLY when the gate above is met)

1. **WebSearch** for `"<site-name> API documentation"` — only after the gate above is satisfied
2. Look for `api.example.com` / `developer.example.com` subdomains
3. Some sites expose a `.json` suffix on regular URLs for read-only JSON (no key needed)

## If the API requires a key

**STOP.** If the public API requires registration, API keys, or OAuth credentials, this phase does not apply. Go to Phase 1 and discover the internal endpoints the site uses when a real user browses — those don't need keys because the browser session handles auth.

## Public API route pattern

Set `browserRequired: false`, use direct `fetch()`. Key differences from browser routes: no interceptor patterns, empty `interceptPatterns`/`baseUrls` arrays, handle 429 responses. Some APIs return XML — parse with regex (see RSS section in gotchas). Government APIs often require a descriptive `User-Agent` with contact info or they 403.

**After writing each route, verify immediately:** `curl` the route, check the response shape, add `DEBUG('route-name', () => ({ status, itemCount }))` inside the handler to confirm it's being hit and returning real data. Don't write the next route until the current one is proven.

```typescript
{ method: 'GET', path: '/search', browserRequired: false, handler: async (c) => {
  const res = await fetch(`https://api.example.com/search?q=${encodeURIComponent(c.req.query('q') ?? '')}`,
    { headers: { 'User-Agent': 'api-interceptor/1.0 (research tool)' } });
  if (res.status === 429) return c.json({ error: 'Rate limited' }, 429);
  if (!res.ok) return c.json({ error: `API error: ${res.status}` }, 502);
  return c.json(await res.json());
}}
```

Hybrid approach: `browserRequired: false` for public API routes, `browserRequired: true` for browser-dependent routes.

## Graceful API key degradation

Try API key first, fall back to browser SSR extraction. Route works with or without the key.

## Python bridge for NLP / analytics

Add methods to `services/python/worker.py`, register in `METHODS` dict. Lazy-import heavy libraries so worker degrades gracefully. Call from TS via `bridge.call('method_name', params)`.

## CLI tool bridge — when sites aggressively block automation

Use battle-tested CLI tools via Python bridge: `yt-dlp` (video), `gallery-dl` (images), `spotdl` (audio), `aria2` (downloads).

| Gotcha | Detail |
|--------|--------|
| Path resolution | `resolve(import.meta.dirname, '../../../services/python/worker.py')` (3 levels: src → name → domains → root) |
| Python 3.9 compat | `from __future__ import annotations` at top of worker.py |
| Bridge config | `import { PythonBridge } from '@interceptor/shared'`; `timeoutMs: 60_000` for downloads |
| Progress tracking | `threading.Thread(daemon=True)` + module-level job dict |
| pythonPath | If system python3 not on PATH: `pythonPath: '/usr/bin/python3'` |
| Registration | Add to `METHODS` dict; `browserRequired: false` on all routes |

If no public API exists and no CLI tool covers the site, proceed to Phase 1.
