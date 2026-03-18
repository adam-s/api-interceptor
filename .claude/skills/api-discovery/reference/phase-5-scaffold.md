# Phase 5: Create Domain Plugin

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/scaffold-domain.sh <name> <root-domain>
```

1. Populate `domains/<name>/src/routes.ts` with discovered routes
2. Register in `apps/api/src/register-domains.ts` and `apps/api/package.json`
3. `pnpm install` then **test every route end-to-end with curl + debug logs before building any UI.** The API layer must be rock-solid before the dashboard layer begins.

## Domain Registration Checklist

After scaffolding, verify BOTH steps are complete:
- [ ] `apps/api/src/register-domains.ts` — `import { plugin } from '@interceptor/domain-<name>';` and `registerDomain(plugin);`
- [ ] `apps/api/package.json` — `"@interceptor/domain-<name>": "workspace:*"` added to dependencies

Missing either step causes silent failure: TypeScript error TS2307 (can't find module) even though `pnpm-workspace.yaml` resolves the package. Both are required.

## SSR Extraction Patterns

### `extractFromPage(url, fn, { waitMs })` — navigate, wait, evaluate

The canonical SSR method. `waitMs` (default 3000ms) is the hydration delay.

```typescript
const listings = await browser.extractFromPage<Array<{id: string; name: string}>>(
  `https://www.example.com/search`,
  () => Array.from(document.querySelectorAll('a[href*="/item/"]')).map(a => ({
    id: (a as HTMLAnchorElement).href.match(/\/item\/(\w+)/)?.[1] ?? '',
    name: a.querySelector('[data-testid="title"]')?.textContent?.trim() ?? '',
  })),
  { waitMs: 4000 },
);
```

### `__NEXT_DATA__` — Next.js SSR JSON blob

Next.js apps embed SSR data in `window.__NEXT_DATA__`. Access via `extractFromPage()` and navigate the `props.pageProps` hierarchy. Other globals: `__REDUX_STATE__`, `__INITIAL_STATE__`, `__APP_STATE__`.

### `evaluate()` — extract from current page (no navigation)

Runs function on the already-navigated page. Use when navigation happened elsewhere.

### When each applies

| Signal | Strategy |
|--------|----------|
| Traffic empty; cards as `<a>` links | `extractFromPage()` + DOM query |
| `<script id="__NEXT_DATA__">` in HTML | `extractFromPage()` + `__NEXT_DATA__` |
| Already navigated | `evaluate()` |
| Traffic shows 200 JSON responses | `browserFetch()` (not SSR) |

## Use Existing Domain

If `domains/<name>/` exists: ensure registered in `apps/api/src/register-domains.ts`, run `pnpm run dev`, connect browser via `ws://localhost:3001/browser/stream?profile=<name>&url=https://www.<domain>.com`, call routes via `curl http://localhost:3001/api/<name>/<path>`.

**Reference files:** [templates/](templates/) for scaffolding, [scripts/scaffold-domain.sh](scripts/scaffold-domain.sh) for the scaffold command.
