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

## Visual Quality Standard

Every dashboard page should look clean, simple, and polished. These rules apply regardless of domain:

- **Consistent spacing**: `gap-4` or `gap-6` between sections; `p-4` inside cards — never mix arbitrary pixel values
- **Typographic hierarchy**: Page title large + bold → section labels `text-sm text-muted-foreground uppercase tracking-wide` → data values `text-2xl font-semibold`
- **Color meaning**: Green = positive/bull, Red = negative/bear, `text-muted-foreground` = neutral/secondary — be consistent throughout the page
- **Empty and loading states are first-class**: Every data container needs a `<Skeleton>` (loading) and a deliberate empty state message — never a blank panel
- **Badges over raw text for categorical values**: Source names, sentiment labels, status values → `<Badge>` with a variant color, not plain text
- **Cards with subtle borders**: `border border-border/50 rounded-lg` gives depth without heaviness; avoid heavy drop shadows

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

Create `apps/web/src/app/(dashboard)/<page-name>/<page-name>-content.tsx`.

Use shadcn/ui components — not raw divs. The template below is a starting point; replace the Card body with real data fields from your API response.

```typescript
'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function PageContent() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
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
    <div className="flex flex-1 flex-col gap-4 p-6 max-w-4xl mx-auto w-full">
      <div>
        <h1 className="text-2xl font-bold">Page Title</h1>
        <p className="text-muted-foreground text-sm mt-1">Short description of what this page does.</p>
      </div>

      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search..."
          className="flex-1"
        />
        <Button onClick={handleSearch} disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </Button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="py-4 px-5"><Skeleton className="h-4 w-3/4" /></CardContent></Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && searched && results.length === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No results found for "{query}"</CardContent></Card>
      )}

      {/* Idle state */}
      {!loading && !searched && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <p>Search above to get started.</p>
        </div>
      )}

      {/* Results */}
      {!loading && results.length > 0 && (
        <div className="flex flex-col gap-3">
          {results.map((item: unknown, i) => (
            <Card key={i} className="cursor-pointer hover:border-primary/60 transition-colors">
              <CardContent className="py-4 px-5">
                {/* Replace with real fields from your API response */}
                <p className="font-medium">{(item as Record<string, unknown>).name as string}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

## Step 5: Multi-Domain Composition

When combining data from multiple domains, **always await each call sequentially**. The server has one shared browser — parallel calls race on the same page (see Single Browser Singleton warning above).

```typescript
// ✓ CORRECT — sequential, catch each source independently
const sourceA = await fetchSourceA(query).catch(() => null);
const sourceB = await fetchSourceB(query).catch(() => null);

// Track which sources are offline
const offline = {
  sourceA: sourceA === null,
  sourceB: sourceB === null,
};
```

If a source returns `null` or `{ error }`, mark it offline and continue — never let one failing source break the whole page.

## Multi-Source Entity Merging

When sources return the **same real-world entity** (same concert, same job posting, same paper), merge by a stable compound key instead of concatenating all results. This avoids showing the same event three times with different source labels.

**The pattern:**

```typescript
// 1. Define a normalize+key function for your entity type
function mergeKey(venue: string, date: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${norm(venue)}|${norm(date)}`;
}

// 2. Build Map<key, Record<sourceName, item>>
const byKey = new Map<string, Record<string, unknown>>();

for (const item of sourceAResults) {
  const k = mergeKey(item.venue, item.date);
  byKey.set(k, { ...byKey.get(k), sourceA: item });
}
for (const item of sourceBResults) {
  const k = mergeKey(item.venue, item.date);
  byKey.set(k, { ...byKey.get(k), sourceB: item });
}

// 3. Render — each Map entry is one display row
//    entry.sourceA or entry.sourceB may be undefined (single-source entity)
const rows = Array.from(byKey.values());
```

**Key selection rules:**

- Use the most stable fields: venue+date for events, company+title+city for jobs, DOI for papers
- Normalize aggressively before comparing: lowercase, strip punctuation, parse dates to ISO
- Normalize categorical labels across sources: "Section 101" = "Sec 101" = "101" -- strip common prefixes and normalize case before comparing
- Never use free-text titles as the sole key -- they differ too much across sources
- Single-source entities still appear -- just with one badge

**Filter before merging:**

- Validate that each result actually belongs to the search query before adding to the merge map
- Use word-boundary regex or `startsWith` -- not `includes` -- to avoid false matches (e.g., "tribute" acts, unrelated recommendations)
- Skip results with disqualifying keywords ("tribute", "experience", "symphony") that indicate unrelated content

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

Common components for dashboards: `table`, `card`, `tabs`, `badge`, `skeleton`, `input`, `select`, `alert`.

**Install commonly needed components upfront** before building any dashboard page:

```bash
cd apps/web && npx shadcn@latest add card badge sheet table skeleton alert input button -y
```

This prevents mid-build interruptions to install missing components.

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

## Visual Design Guidance

The Step 4 template is a starting scaffold. For a professional dashboard, apply these principles before calling the page done.

### Required states

Every page must implement all of these — not just the happy path:

| State | When | What to show |
|-------|------|-------------|
| Idle | No search yet | Centered prompt: "Search above to get started" |
| Loading | Fetch in progress | `Skeleton` components matching real content shape |
| Empty | 0 results returned | `Card` with message: "No results for '...'" |
| Populated | Data present | Real content with proper typography hierarchy |
| Detail loading | Sheet/panel open, fetching | `Skeleton` rows inside the panel |
| Detail populated | Detail data present | Full detail view with clear visual hierarchy |
| Partial offline | One source failed | `Alert` naming the failing source; other sources intact |
| Full offline | All sources failed | `Alert` per source, clear recovery instruction |

### Component choices for common patterns

**List items** → `Card` with `CardContent`. Never raw `<div>`. Adds hover state, border, proper spacing.

**Data source labels** → `Badge`. Color-code sources consistently and carry that color into every view where that source appears (list badges, table column headers, offline alerts).

**Detail view** → `Sheet` sliding from right. The list stays visible behind it — user keeps spatial context. Use `SheetHeader` + `SheetTitle` for the panel header.

**Comparison grids** (multiple sources × multiple entities) → `Table`. Rows = entities, columns = sources. Highlight the "best" value per row in `font-semibold text-green-600`. Missing data → `—` (not blank, not 0).

**Loading placeholders** → `Skeleton` with dimensions matching the real content. Prevents layout shift.

**Per-source errors** → `Alert` with `AlertDescription`. Name the specific source: "StubHub unavailable — browser not connected." Never a generic "Error loading data."

### Install components as needed

```bash
cd apps/web && npx shadcn@latest add card badge sheet table skeleton alert input button
```

### Responsive sidebar layout

When combining a main content area with a sidebar panel (e.g., comparison comps, filters, activity feed):

```tsx
<div className="flex flex-col lg:flex-row gap-4">
  {/* Main content — takes remaining space */}
  <div className="flex-1 min-w-0">
    {/* Listing cards, results, etc. */}
  </div>
  {/* Sidebar — fixed width on desktop, full width stacked on mobile */}
  <div className="w-full lg:w-72 flex-shrink-0">
    <Card>
      {/* Sidebar content */}
    </Card>
  </div>
</div>
```

Key: `lg:flex-row` switches from stacked (mobile) to side-by-side (desktop). `flex-shrink-0` prevents the sidebar from being compressed. `min-w-0` on the main content prevents it from overflowing with long text.

### Dark mode

Use semantic tokens, not hardcoded colors:
- Surfaces: `bg-background`, `bg-muted`, `border-border`
- Text: `text-foreground`, `text-muted-foreground`
- Accent panels: `bg-blue-950/30 border-blue-500/20` (not `bg-blue-50`)
- Hover: `hover:bg-muted` (not `hover:bg-gray-50`)

## In-Process CRUD State

When the prompt asks for user state (favorites, tracking, bookmarks, notes) and there's no database requirement, use a domain plugin with **in-process state** + `browserRequired: false` routes. No external deps, resets on server restart.

Create a dedicated domain (e.g., `domains/jobs/`) with module-level state:

```typescript
// domains/jobs/src/routes.ts

// Module-level store — persists for server lifetime, resets on restart
const favorites = new Set<string>();
const statusMap = new Map<string, string>();

export const routes: DomainRoute[] = [
  {
    method: 'POST',
    path: '/favorites',
    browserRequired: false,
    handler: async (c) => {
      const { id } = await c.req.json() as { id: string };
      const added = !favorites.has(id);
      added ? favorites.add(id) : favorites.delete(id);
      return c.json({ id, favorited: added });
    },
  },
  {
    method: 'GET',
    path: '/favorites',
    browserRequired: false,
    handler: async (c) => c.json({ favorites: Array.from(favorites) }),
  },
  {
    method: 'PUT',
    path: '/status',
    browserRequired: false,
    handler: async (c) => {
      const { id, status } = await c.req.json() as { id: string; status: string };
      statusMap.set(id, status);
      return c.json({ id, status });
    },
  },
];
```

Register the plugin in `apps/api/src/register-domains.ts` alongside browser-based domains.

**Pattern: optimistic UI update** — update local React state immediately, then fire the API call in background. Don't await the server sync before updating the UI.

```typescript
const toggleFavorite = async (id: string) => {
  const newFavs = new Set(favorites);
  newFavs.has(id) ? newFavs.delete(id) : newFavs.add(id);
  setFavorites(newFavs); // optimistic
  await fetch(`${API}/api/jobs/favorites`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  }).catch(() => {}); // don't revert on network error
};
```

## Cross-Source Entity Deduplication

When multiple sources return the same real-world entity (same job, same product, same paper), merge by a stable compound key rather than concatenating arrays. This avoids showing the same entity with 4 source badges as 4 separate cards.

```typescript
function dedupKey(company: string, title: string, location: string): string {
  const norm = (s: string) => s.toLowerCase()
    .replace(/\s+(inc\.?|llc\.?|corp\.?|ltd\.?|co\.?)$/i, '') // strip legal suffixes
    .replace(/[^a-z0-9]/g, '');
  return `${norm(company)}|${norm(title)}|${norm(location)}`;
}

// Merge: Map<key, { sources: Source[], bestPrice?, crossListed }>
const byKey = new Map<string, MergedEntity>();
for (const item of sourceAResults) {
  const k = dedupKey(item.company, item.title, item.location);
  const existing = byKey.get(k);
  if (existing) {
    existing.sources.push({ source: 'sourceA', ...item });
    existing.crossListed = true;
  } else {
    byKey.set(k, { id: k, sources: [{ source: 'sourceA', ...item }], crossListed: false });
  }
}
```

**When to show cross-listed callout**: if the same entity appears on 2+ sources with different prices/salaries, show `"Source B lists $X higher"` next to the cheaper source. Normalize: `format(diff)` → `"$12K"` or `"$15/hr"`.

**Cross-listed card badge**: show `"N sites"` badge on cards with `crossListed: true`. In the detail Sheet, show a "Salary by Source" or "Price by Source" comparison section with source badges and values side by side.

### Status tracking in detail Sheet

When a detail view needs per-item status tracking (application status, watchlist state, review status):

```tsx
{/* Status buttons in Sheet — one row of options */}
<div>
  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Application Status</p>
  <div className="flex flex-wrap gap-2">
    {STATUSES.map(s => (
      <Button
        key={s.value}
        variant={currentStatus === s.value ? 'default' : 'outline'}
        size="sm"
        className="text-xs h-7"
        onClick={() => updateStatus(itemKey, s.value)}
      >
        {s.label}
      </Button>
    ))}
  </div>
</div>
```

Use optimistic updates -- change React state immediately, fire the API call in background. The status buttons should be the last section in the Sheet, below the entity details.

## Cross-Source Timeline View

When combining chronological events from multiple sources, build a unified timeline sorted by date. This is the natural view for activity monitoring, audit trails, and multi-source research.

```typescript
interface TimelineItem {
  date: string;       // ISO date for sorting
  type: string;       // category string -- drives dot color per source type
  title: string;
  subtitle: string;   // source-specific context
  source: string;     // display label
  link: string;       // external URL
}

function buildTimeline(...sources: TimelineItem[][]): TimelineItem[] {
  return sources.flat().sort((a, b) => b.date.localeCompare(a.date));
}
```

**Visual pattern:** Vertical line with colored dots — blue for one source, amber for another. Each dot anchors a card. Tab bar above switches between Timeline (merged), and per-source filtered views.

## Background Job Polling

When a domain route starts a long-running operation (download, processing, generation), track it with job IDs and poll for progress:

```typescript
// Start a job
const startJob = async (params: Record<string, unknown>) => {
  const res = await fetch(`${API}/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const { jobId } = await res.json();
  setJobs(prev => new Map(prev).set(jobId, { jobId, status: 'starting', progress: 0 }));
};

// Poll active jobs — auto-stops when all complete
useEffect(() => {
  const active = Array.from(jobs.values()).filter(
    j => j.status !== 'complete' && j.status !== 'error'
  );
  if (!active.length) return;
  const interval = setInterval(async () => {
    for (const job of active) {
      const res = await fetch(`${API}/download/${job.jobId}`);
      const data = await res.json();
      setJobs(prev => new Map(prev).set(job.jobId, data));
    }
  }, 1000);
  return () => clearInterval(interval);
}, [jobs]);
```

Show progress with `<Progress value={job.progress} />` and a status `<Badge>`. Include the job list in a Downloads or Activity tab.

## Mini Sparkline Pattern (SVG)

For simple sparklines (price charts, trend indicators), use an inline SVG polyline. No dependencies needed:

```tsx
function Sparkline({ data }: { data: (number | null)[] }) {
  const valid = data.filter((d): d is number => d != null);
  if (valid.length < 2) return null;
  const min = Math.min(...valid), max = Math.max(...valid), range = max - min || 1;
  const w = 120, h = 32;
  const points = valid.map((v, i) =>
    `${(i / (valid.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`
  ).join(' ');
  const isUp = valid[valid.length - 1] >= valid[0];
  return (
    <svg width={w} height={h}>
      <polyline points={points} fill="none" stroke={isUp ? '#22c55e' : '#ef4444'}
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
```

For complex charts (axes, tooltips, interactions), install `@visx/shape` + `@visx/scale`.

## Video / Iframe Embed Pattern

For embedded video or media content, wrap in an aspect-ratio container:

```tsx
<div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
  <iframe
    src={embedUrl}
    className="w-full h-full"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowFullScreen
    title={title}
  />
</div>
```

For privacy-conscious embeds, prefer `-nocookie` variants of embed domains when available. For locally-served video files, use `<video>` with `controls` attribute and ensure the server supports `Content-Range` headers for seeking.

## API Call Pattern

All proxy endpoints are at `http://localhost:3001/api/<domain>/<path>`.

- The browser must be connected to the domain for proxy to work
- If browser is not connected, proxy returns `503 { error: "Browser not connected" }`
- GET endpoints: `fetch('http://localhost:3001/api/<domain>/<path>')`
- POST endpoints: include `Content-Type: application/json` and body

## Gotchas

| Problem | Fix |
|---------|-----|
| CORS error in browser | The API server has CORS enabled (`app.use('/*', cors())`) — should work. If not, check the port. |
| 503 from proxy | Browser not connected. Open dashboard at `/browser?profile=<domain>&capture=<root-domain>` first. |
| Empty results | Check the proxy endpoint directly with curl first: `curl http://localhost:3001/api/<domain>/<path>` |
| Hydration error | Ensure the component is marked `'use client'` at the top |
| Page not found | Check directory name matches the URL path — Next.js uses directory-based routing |
