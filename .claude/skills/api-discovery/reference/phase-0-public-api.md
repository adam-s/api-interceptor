# Phase 0: Check for a Public API

Before launching a browser, check if the target site has a documented public REST API. If the user's prompt includes discovery hints or notes about the target site, read them first — they may contain answers that save hours of trial and error.

## How to check

1. **WebSearch** for `"<site-name> API documentation"` — mandatory, never guess endpoints
2. Look for `api.example.com` / `developer.example.com` subdomains
3. Some sites expose a `.json` suffix on regular URLs for read-only JSON (no key needed) — fastest path to `browserRequired: false` routes
4. When the primary source requires paid auth or CAPTCHA, look for **free open-source mirrors**

## If the API requires a key — use a disposable email for dev

1. Get a temp email address (disposable email service or domain plugin)
2. Register on the target service's signup page with the temp email
3. Read the verification email, extract the confirmation link
4. Navigate to the link → API key issued. Dev only — production uses `.env` credentials.

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
