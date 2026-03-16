---
name: dashboard-builder
description: Build Next.js dashboard pages that consume domain proxy APIs. Use when the user wants to create a dashboard, build a UI page, add a search interface, display data from captured APIs, create comparison views, or build any frontend that calls /api/<domain>/ endpoints.
---

# Dashboard Builder

Create Next.js dashboard pages that consume domain proxy API endpoints. Each page lives in `apps/web/src/app/(dashboard)/` and uses shadcn/ui components.

## ⚠️ Critical: Single Browser Singleton

The API server has **one shared browser instance** across all domain routes. This means:

- Domain route handlers share the same page. If two handlers navigate simultaneously, they race — one navigates away before the other extracts.
- **Never call multiple domain APIs in parallel from the UI.** `Promise.allSettled([tmSearch(q), shSearch(q)])` will break: both handlers try to navigate the same browser to different URLs simultaneously.
- **Always call domain APIs sequentially** when your dashboard page hits multiple domains:
  ```typescript
  // ✗ BROKEN — race condition on shared browser
  const [tm, sh] = await Promise.allSettled([tmSearch(q), shSearch(q)]);

  // ✓ CORRECT — sequential, one browser navigation at a time
  const tm = await tmSearch(q).catch(() => []);
  const sh = await shSearch(q).catch(() => []);
  ```
- This applies to any sequence of API calls that ultimately navigate the proxy browser: search → detail → listings must all be awaited sequentially.

## Prerequisites

- Domain plugins must exist with proxy routes registered (use api-discovery skill first)
- Server running: `pnpm run dev` (ports 3000/3001)
- Verify available APIs: `curl http://localhost:3001/api | jq .`

## Step 1: Plan the Page

Before writing code, identify:

1. **What data is needed** — which domain proxy endpoints provide it
2. **User interactions** — search input, filters, sorting, pagination
3. **Visual layout** — cards, tables, grids, comparison views
4. **Data composition** — if combining multiple domains, how to normalize/merge

## Step 2: Create the Route Directory

Next.js App Router uses directory-based routing:

```bash
mkdir -p apps/web/src/app/\(dashboard\)/<page-name>
```

## Step 3: Create the Page Component

Create `apps/web/src/app/(dashboard)/<page-name>/page.tsx`:

```typescript
import PageContent from './<page-name>-content';

export default function Page() {
  return <PageContent />;
}
```

## Step 4: Create the Client Component

Create `apps/web/src/app/(dashboard)/<page-name>/<page-name>-content.tsx`:

```typescript
'use client';

import { useState } from 'react';

export default function PageContent() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:3001/api/<domain>/<endpoint>?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(Array.isArray(data) ? data : data.results || [data]);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search..."
          className="flex-1 rounded border border-border bg-background px-3 py-2"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="rounded bg-primary px-4 py-2 text-primary-foreground"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      <div className="grid gap-4">
        {results.map((item, i) => (
          <div key={i} className="rounded border border-border p-4">
            <pre className="text-xs">{JSON.stringify(item, null, 2)}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Step 5: Multi-Domain Composition

When combining data from multiple domains (e.g., ticket prices from StubHub + Ticketmaster):

```typescript
const fetchAll = async (query: string) => {
  const [stubhubRes, ticketmasterRes] = await Promise.allSettled([
    fetch(`http://localhost:3001/api/stubhub/events/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    }),
    fetch(`http://localhost:3001/api/ticketmaster/trending/searches`),
  ]);

  return {
    stubhub: stubhubRes.status === 'fulfilled' ? await stubhubRes.value.json() : null,
    ticketmaster: ticketmasterRes.status === 'fulfilled' ? await ticketmasterRes.value.json() : null,
  };
};
```

**Sequential, not parallel** — see the Single Browser Singleton warning above. Always `await` each domain call in sequence.

## Step 6: Verify with Visual Dev

After building the page, use the visual-dev skill to take screenshots and verify the layout:

1. Navigate to `http://localhost:3000/<page-name>`
2. Take screenshots at different states (empty, loading, populated, error)
3. Iterate on visual issues

## Available UI Components

The project uses shadcn/ui. Full component catalog: **https://ui.shadcn.com/docs/components**

Installed components are in `apps/web/src/components/ui/`. Add new ones with:

```bash
cd apps/web && npx shadcn@latest add <component-name>
```

Common components for dashboards: `table`, `card`, `tabs`, `badge`, `skeleton`, `input`, `select`.

### List view vs detail view

Every data-heavy dashboard follows one of two patterns. Pick based on how much detail the user needs without losing their place:

| Pattern | When to use | Implementation |
|---------|-------------|----------------|
| **Inline expand** | Detail fits in 2–4 lines; user browses many rows | Collapsible row or Tooltip |
| **Side sheet** | Detail needs its own layout; user compares against list | `Sheet` slides in from right, list stays visible behind it |
| **Full page** | Detail has sub-navigation (tabs, charts, history) | `router.push('/item/[id]')` — only when sheet is too small |

Default: start with Sheet. Upgrade to full page only when the detail view needs its own URL or has too many components to fit in a panel.

### Pagination

When a list can grow beyond ~25 items, paginate server-side. State pattern:

```typescript
const PAGE_SIZE = 25;
const [page, setPage] = useState(0);
const totalPages = Math.ceil(total / PAGE_SIZE);
// In fetch: append `?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`
// Reset to page 0 whenever filters change
```

Optional copy-paste pager component (generic, drop into `apps/web/src/components/ui/grid-pagination.tsx`):

```typescript
import { Button } from '@/components/ui/button';
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';

interface GridPaginationProps {
  page: number;          // 0-indexed
  totalPages: number;
  totalItems: number;
  itemLabel?: string;    // e.g. "results", "events"
  onPageChange: (page: number) => void;
}

export function GridPagination({ page, totalPages, totalItems, itemLabel = 'items', onPageChange }: GridPaginationProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/20 text-xs shrink-0">
      <div className="text-muted-foreground font-mono">
        Page {page + 1} of {totalPages} ({totalItems} {itemLabel})
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onPageChange(0)} disabled={page === 0}><ChevronsLeft className="h-3 w-3" /></Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onPageChange(page - 1)} disabled={page === 0}><ChevronLeft className="h-3 w-3" /></Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages - 1}><ChevronRight className="h-3 w-3" /></Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onPageChange(totalPages - 1)} disabled={page >= totalPages - 1}><ChevronsRight className="h-3 w-3" /></Button>
      </div>
    </div>
  );
}
```

## API Call Pattern

All proxy endpoints are at `http://localhost:3001/api/<domain>/<path>`.

- The browser must be connected to the domain for proxy to work
- If browser is not connected, proxy returns `503 { error: "Browser not connected" }`
- GET endpoints: `fetch('http://localhost:3001/api/stubhub/events/search')`
- POST endpoints: include `Content-Type: application/json` and body

## Gotchas

| Problem | Fix |
|---------|-----|
| CORS error in browser | The API server has CORS enabled (`app.use('/*', cors())`) — should work. If not, check the port. |
| 503 from proxy | Browser not connected. Open dashboard at `/browser?profile=<domain>&capture=<root-domain>` first. |
| Empty results | Check the proxy endpoint directly with curl first: `curl http://localhost:3001/api/<domain>/<path>` |
| Hydration error | Ensure the component is marked `'use client'` at the top |
| Page not found | Check directory name matches the URL path — Next.js uses directory-based routing |
