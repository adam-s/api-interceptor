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

## Parsing: escalate complexity

**If parsing exceeds ~5 lines of regex, stop.** Escalate to a real parser.

| Complexity | Tool | When |
|-----------|------|------|
| Simple | `innerText` + split by `\n` | Clean card layout |
| Moderate | `cheerio` (TS) or `beautifulsoup4` (Python) | HTML has structure but `innerText` concatenates |
| Complex | Python NLP via bridge (`dateutil`, `usaddress`, `thefuzz`) | Unstructured text |
| Very complex | Dedicated TS service or Python worker | Multi-step pipelines |

**HTML parsers:** `cheerio` (Node.js, jQuery-like), `beautifulsoup4`/`lxml` (Python via bridge).

**Python NLP tools:** `dateutil.parser.parse()` for dates, `usaddress.parse()` for addresses, `thefuzz.fuzz.ratio()` for fuzzy matching (threshold ~85).

Add methods to `services/python/worker.py`, register in `METHODS` dict. Install: `pip install python-dateutil thefuzz`

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
