# Phase 3: Extract

## Type A: JSON API routes

Route with `targetUrl` — proxied through `browserFetch()` automatically. Cookies and auth are inherited.

```typescript
{ method: 'GET', path: '/search', targetUrl: 'https://api.example.com/v1/search', description: 'Search' }
```

## Type B: SSR extraction via `page.evaluate()`

**Always use `innerText` not `textContent`** — `innerText` respects CSS layout and adds `\n` between block elements.

```typescript
handler: async (c, browser) => {
  await browser.navigate(`https://www.example.com/search?q=${encodeURIComponent(q)}`);
  await new Promise(r => setTimeout(r, 5000));  // hydration wait
  const items = await browser.getPage()!.evaluate(() =>
    Array.from(document.querySelectorAll('a[href*="/item/"]')).map(a => ({
      url: (a as HTMLAnchorElement).href,
      name: (a as HTMLElement).innerText?.replace(/\s+/g, ' ').trim().slice(0, 120) ?? '',
    }))
  );
  return c.json({ items, total: items.length });
}
```

## Parsing: escalate complexity early

**If parsing exceeds ~5 lines of regex, stop.** Escalate to a real parser. Fragile regex chains that break on the next site change are worse than no parser at all. The Python bridge exists specifically for this — use it.

| Complexity | Tool | When |
|-----------|------|------|
| Simple | `innerText` + split by `\n` | Clean card layout, obvious separators |
| Moderate | `cheerio` (TS) or `beautifulsoup4` (Python) | HTML has structure but `innerText` concatenates |
| Complex | Python NLP via bridge (`dateutil`, `usaddress`, `thefuzz`, `spacy`) | Unstructured text, mixed formats, entity extraction |
| Very complex | Dedicated Python worker with multi-step pipeline | Cross-referencing, fuzzy matching across sources |

**The Python bridge is the right tool for non-trivial extraction.** Sites concatenate text without separators (e.g., "7:30 PMNew York, NY, USMadison Square Garden"), use inconsistent date formats ("MAR 20FRI7:30 PM" vs "3/20/26, 7:30 PM"), and mix venue/city/event names in unpredictable ways. NLP libraries handle these robustly where regex breaks:

- `dateutil.parser.parse()` — handles any date format without custom regex
- `usaddress.parse()` — separates venue from city from state
- `thefuzz.fuzz.ratio()` — fuzzy matching for entity dedup across platforms (threshold ~85)
- `spacy` — named entity recognition for venues, performers, locations

**HTML parsers:** `cheerio` (Node.js, jQuery-like), `beautifulsoup4`/`lxml` (Python via bridge).

**How to use:** Add methods to `services/python/worker.py`, register in `METHODS` dict. Call from TS via `bridge.call('method_name', params)`. Install: `pip install python-dateutil thefuzz`. See [phase-0-public-api.md](phase-0-public-api.md) for bridge setup details.

## DOM Extraction Rules

- **Displayed text is ground truth.** Data attributes may differ from what the user sees.
- **Constrain selectors to the narrowest match.** Broad selectors return nav links, ads, etc.
- **Extracted text contains layout noise.** Compare to what a user would read and strip extras.
- **Navigate like a user.** Go search → list → detail in order for session trust.

## Data source preference order

1. **Type A (direct proxy)** — clean JSON, no browser needed. Best case.
2. **Type B2 (traffic capture)** — JSON from CORS-blocked endpoints.
3. **Type B (DOM extraction)** — last resort.

**Type A sources can die without warning.** Write defensively — if 403/429, fall to Type B2 or B.

## Authentication: Never Hardcode API Keys

Route files must NEVER contain hardcoded API keys, Bearer tokens, or session credentials. These values change per user, per session, and per profile. Hardcoding them creates routes that work once and break forever.

**The interceptor pattern:**
1. CDP captures traffic including auth headers (Bearer tokens, API keys, CSRF tokens)
2. `GenericInterceptor.extractHeaders()` pulls required headers from captured requests
3. `GenericSessionManager.setHeaders()` stores them per profile with disk persistence
4. Route handlers retrieve them via `GenericSessionManager.getHeaders(profileName)`

**In route files:**
```typescript
handler: async (c, browser) => {
  const sessionMgr = GenericSessionManager.getInstance('domain-name');
  const headers = sessionMgr.getHeaders('domain-name');
  if (!headers) return c.json({ error: 'Not authenticated — connect browser first' }, 401);

  // Use captured headers for API calls
  const resp = await browser.browserFetch('https://api.example.com/data', { headers });
  return c.json(resp.data);
}
```

The framework's `GenericSessionManager` and `GenericInterceptor` (in `packages/browser/src/shared/`) implement this pattern. The interceptor config specifies `requiredHeaders` and `interceptPatterns`; the interceptor captures matching headers from live traffic; the session manager persists them to disk per profile.

**What about embedded API keys in JS bundles?** Some sites embed public API keys in their JavaScript (e.g., `apikey`/`apisecret` params in internal API adapter URLs). Even these should be captured from traffic, not hardcoded — they rotate without notice and differ between environments.

## Rate-limited outbound fetch

Use `rateLimitedFetch` from `@interceptor/shared` for `browserRequired: false` routes. Register host limits in `apps/api/src/register-domains.ts`.

## browserFetch timeout

Default 20-second timeout. Override with `{ timeout: 30000 }` for slow endpoints.

## Type B2: Traffic capture for CORS-blocked APIs

```typescript
await fetch('http://localhost:3001/browser/traffic', { method: 'DELETE' });
await browser.navigate(pageUrl);
await new Promise(r => setTimeout(r, 8000));
const traffic = await (await fetch('http://localhost:3001/browser/traffic')).json();
const data = traffic.entries.find(e => e.url.includes('/desired-endpoint'));
```

## `browserFetch()` cross-origin

| Origin type | Approach |
|-------------|----------|
| Same-origin | `browserFetch(url)` directly |
| CORS subdomain | `browserFetch(url, { navigateTo: 'https://main-site.com' })` |
| No CORS | Type B2 traffic capture |
| SPA-internal | `evaluate(fetch(...))` on current page |

**SPA context gotcha:** Some endpoints depend on cookies/CSRF set by the SPA's JS. If `browserFetch` navigates to the bare origin, it destroys SPA context. Skip navigation if already on correct origin.

## Type C: Hybrid (SSR + pagination API)

Page 1: extract from SSR HTML. Page 2+: `browserFetch()` the pagination API.
