---
name: dashboard-builder
description: Build Next.js dashboard pages that consume domain proxy APIs. Use when the user wants to create a dashboard, build a UI page, add a search interface, display data from captured APIs, create comparison views, or build any frontend that calls /api/<domain>/ endpoints.
---

# Dashboard Builder

Create Next.js dashboard pages that consume domain proxy API endpoints. Each page lives in `apps/web/src/app/(dashboard)/` and uses shadcn/ui components.

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

Use `Promise.allSettled` (not `Promise.all`) so one domain failing doesn't block others.

## Step 6: Verify with Visual Dev

After building the page, use the visual-dev skill to take screenshots and verify the layout:

1. Navigate to `http://localhost:3000/<page-name>`
2. Take screenshots at different states (empty, loading, populated, error)
3. Iterate on visual issues

## Available UI Components

The project uses shadcn/ui. Installed components are in `apps/web/src/components/ui/`. Check what's available:

```bash
ls apps/web/src/components/ui/
```

To add new components:

```bash
cd apps/web && npx shadcn@latest add <component-name>
```

Common components for dashboards: `table`, `card`, `tabs`, `badge`, `skeleton`, `input`, `select`.

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
