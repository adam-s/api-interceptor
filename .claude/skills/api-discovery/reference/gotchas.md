# Gotchas

## Single browser singleton — sequential calls only

One browser instance, module-level singleton. New WebSocket profile connection destroys the existing browser. Consequences:
- Only one domain active at a time; most recent profile wins
- Concurrent `navigate()` calls race — always call domain APIs **sequentially**
- Traffic capture is profile-scoped; use `&capture=api.otherdomain.com` query param for cross-domain capture
- Type B2 discovery requires the proxy browser — standalone Patchright scripts have no traffic buffer

## Common problems and fixes

| Problem | Fix |
|---------|-----|
| Traffic shows 0 entries | SSR — use `extractFromPage(url, fn)` |
| Body text empty after navigate | Bot-protected — check for captcha iframe |
| `textContent` concatenates everything | Use `innerText` instead |
| `browserFetch` loses session cookies | Use `navigateTo` for CORS subdomains, or Type B2 if no CORS |
| CORS error from `page.evaluate(fetch)` | Use Type B2 traffic capture |
| Real-time 429, cached 200 | CDN passes cached (no bot check); origin blocks headless. `age > 0` = CDN |
| Persistent 429, curl returns 200 | Poisoned profile — wipe and recreate (see anti-bot.md Step 0) |
| Direct `fetch()` 429 but browser 200 | TLS fingerprinting (JA3/JA4) — use `browserFetch()` instead |
| Route 404 after editing routes.ts | Kill port 3001, rerun `pnpm dev` |
| ID regex misses alphanumeric IDs | Use `[A-Z0-9]+` not `\d+` |
| `data-*` attr != displayed value | Always read from displayed text |
| `browserRequired: false` gets 503 | Guard must be `if (!browser && route.browserRequired !== false)` |
| Domain switch returns stale/empty data | Navigate to `about:blank` + 500ms wait before new domain. Use `page.waitForSelector` instead of `setTimeout`. |
| `innerText` returns category labels not names | Check URL slug or `__NEXT_DATA__` for structured props |
| `page.evaluate` throws `__name is not defined` | tsx/esbuild injects `__name` — use string-based evaluate |
| `browserFetch` POST returns "Unable to parse" | Default `Accept: application/json` rejected — use `page.evaluate` with direct `fetch()` |
| `URLSearchParams` breaks Rest-li syntax | Rest-li uses raw `(key:value)` — build query strings manually |
| Write operations return empty/binary | Site uses RSC — look for `rsc-action` in traffic; fall back to browser automation |
| Public API returns XML | Parse with regex: `/<item>([\s\S]*?)<\/item>/g` for RSS |
| Public API returns `total: 0` with 200 | Soft rate limit — retry after a few seconds |

## Browserless Routes with Background Polling

For rate-limited or slow data sources (`browserRequired: false` routes), use a background poller:

1. **Poller** runs every N seconds, stores results in `Map<key, data[]>`, exports getter
2. **Route handler** reads from in-memory store; cold-start fallback fetches directly with TTL cache
3. **Factory pattern**: `createRoutes(getBridgeFn?, getDataFn?)` — route factory accepts getter as closure

### TTL cache Map

```typescript
const cache = new Map<string, { data: Result; expiresAt: number }>();
const TTL_MS = 5 * 60 * 1000;
async function fetchWithCache(key: string): Promise<Result> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.data;
  const data = await fetchFromSource(key);
  cache.set(key, { data, expiresAt: Date.now() + TTL_MS });
  return data;
}
```

### `broadcastMessage` wiring

Inject `broadcastMessage` via `setBroadcast(fn)` before starting the poller. Domain package exports `setBroadcast`; `apps/api/src/index.ts` calls it with imported `broadcastMessage` from `./state`.

### RSS / XML feed parsing

```typescript
function parseRssXml(xml: string) {
  const items: Array<{ title: string; link: string; description: string; pubDate: string }> = [];
  for (const [, block] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const get = (tag: string) => block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`))?.[1]
      ?? block.match(new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`))?.[1] ?? '';
    items.push({ title: get('title').trim(), link: get('link').trim(),
      description: get('description').trim(), pubDate: get('pubDate').trim() });
  }
  return items;
}
```

### Unix timestamps

Many APIs use unix epoch seconds (10 digits). `Math.floor(Date.now() / 1000)` for current time.
