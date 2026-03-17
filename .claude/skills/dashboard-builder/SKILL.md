---
name: dashboard-builder
description: Build Next.js dashboard pages that consume domain proxy APIs. Use when the user wants to create a dashboard, build a UI page, add a search interface, display data from captured APIs, create comparison views, or build any frontend that calls /api/<domain>/ endpoints.
---

# Dashboard Builder

Create Next.js dashboard pages that consume domain proxy API endpoints. Each page lives in `apps/web/src/app/(dashboard)/` and uses shadcn/ui components.

## Critical: Single Browser Singleton

One shared browser instance. **Never call domain APIs in parallel** — always sequential with `.catch()` per source. `Promise.allSettled` will break: both handlers navigate the same page simultaneously.

```typescript
const sourceA = await fetchA(q).catch(() => null);  // sequential
const sourceB = await fetchB(q).catch(() => null);  // waits for A
```

## Visual Quality Standard

- **Spacing**: `gap-4`/`gap-6` between sections; `p-4` inside cards — no arbitrary pixels
- **Typography**: title `text-2xl font-bold` → labels `text-sm text-muted-foreground uppercase tracking-wide` → values `text-2xl font-semibold`
- **Color**: green = positive, red = negative, `text-muted-foreground` = secondary
- **States**: every container needs `<Skeleton>` (loading) + empty state message — never blank
- **Badges** for categorical values (sources, status, sentiment) — never raw text
- **Cards**: `border border-border/50 rounded-lg` — no heavy shadows

## Prerequisites

Domain plugins registered, `pnpm run dev` (ports 3000/3001), verify: `curl http://localhost:3001/api | jq .`

## Steps 1-3: Plan + Create Route

1. Plan: data endpoints, interactions, layout, multi-domain composition
2. `mkdir -p apps/web/src/app/\(dashboard\)/<page-name>`
3. Create `page.tsx` importing a `<PageContent />` client component

## Step 4: Client Component Template

Create `apps/web/src/app/(dashboard)/<page-name>/<page-name>-content.tsx` with `'use client'`. Use shadcn/ui components — not raw divs. Standard search page pattern:

- State: `query`, `results`, `loading`, `searched`
- Fetch: `http://localhost:3001/api/<domain>/<endpoint>?q=${encodeURIComponent(query)}`
- Layout: `flex flex-1 flex-col gap-4 p-6 max-w-4xl mx-auto w-full`
- Search bar: `Input` + `Button` with `onKeyDown Enter` handler
- Four render states: loading (`Skeleton` cards), empty ("No results for..."), idle ("Search above to get started"), populated (result `Card` list with hover)

## Step 5: Multi-Domain Composition

Always sequential, catch per source. If a source returns null, mark offline — never let one failure break the page.

## Multi-Source Entity Merging

Merge by a **stable compound key** (not free-text titles) to avoid duplicate cards:

```typescript
function mergeKey(venue: string, date: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${norm(venue)}|${norm(date)}`;
}
const byKey = new Map<string, Record<string, unknown>>();
for (const item of sourceAResults) byKey.set(mergeKey(item.venue, item.date), { ...byKey.get(mergeKey(item.venue, item.date)), sourceA: item });
// repeat for sourceB...  each Map entry = one display row
```

**Rules:** Use stable fields (venue+date for events, company+title+city for jobs, DOI for papers). Normalize aggressively: lowercase, strip punctuation, parse dates to ISO. Normalize labels ("Section 101" = "Sec 101" = "101"). Single-source entities still appear with one badge.

**Filter before merging:** Validate results belong to the query. Use `startsWith` or word-boundary regex — not `includes`. Skip disqualifying keywords.

## Step 6: Verify with Visual Dev

Use visual-dev skill: screenshot at each state (empty, loading, populated, error), iterate on visual issues.

## Available UI Components

shadcn/ui — catalog: **https://ui.shadcn.com/docs/components**. Install upfront:

```bash
cd apps/web && npx shadcn@latest add card badge sheet table skeleton alert input button -y
```

### List view vs detail view

| Pattern | When | Implementation |
|---------|------|----------------|
| **Inline expand** | Detail fits 2-4 lines | Collapsible row or Tooltip |
| **Side sheet** (default) | Detail needs its own layout | `Sheet` from right, list stays visible |
| **Full page** | Detail has sub-nav/tabs/charts | `router.push('/item/[id]')` |

### Pagination

State: `page` (0-indexed), `PAGE_SIZE = 25`, `totalPages = Math.ceil(total / PAGE_SIZE)`. Fetch with `?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`. Reset page to 0 on filter change. Optional reusable pager: `apps/web/src/components/ui/grid-pagination.tsx` with `ChevronsLeft/Right` + `ChevronLeft/Right` buttons from lucide-react.

## Visual Design Guidance

### Required states (every page must implement all 8)

| State | What to show |
|-------|-------------|
| Idle | "Search above to get started" |
| Loading | `Skeleton` matching real content shape |
| Empty | "No results for '...'" in a Card |
| Populated | Real content with typography hierarchy |
| Detail loading | `Skeleton` rows inside Sheet |
| Detail populated | Full detail with visual hierarchy |
| Partial offline | `Alert` naming the failing source |
| Full offline | `Alert` per source with recovery instruction |

### Component choices

| Pattern | Component | Notes |
|---------|-----------|-------|
| List items | `Card` + `CardContent` | Never raw `<div>`. Hover state + border. |
| Source labels | `Badge` | Consistent color across all views |
| Detail view | `Sheet` from right | List stays visible behind |
| Comparison grid | `Table` | Rows = entities, cols = sources. Best value in green. Missing = `—` |
| Loading | `Skeleton` | Match real content dimensions |
| Errors | `Alert` + `AlertDescription` | Name the specific source, never generic |

### Responsive sidebar

```tsx
<div className="flex flex-col lg:flex-row gap-4">
  <div className="flex-1 min-w-0">{/* main content */}</div>
  <div className="w-full lg:w-72 flex-shrink-0"><Card>{/* sidebar */}</Card></div>
</div>
```

### Dark mode

Semantic tokens only: `bg-background`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `hover:bg-muted`. Accent: `bg-blue-950/30 border-blue-500/20` (not `bg-blue-50`).

## In-Process CRUD State

For user state (favorites, tracking, bookmarks) with no database requirement: dedicated domain plugin with module-level `Set`/`Map` + `browserRequired: false` routes. Resets on server restart. Register in `apps/api/src/register-domains.ts`.

**Optimistic UI:** Update React state immediately, fire API call in background. Don't await server sync before updating UI. `.catch(() => {})` — don't revert on network error.

## Cross-Source Entity Deduplication

Same pattern as Multi-Source Entity Merging above, but with `crossListed` tracking. Build `Map<key, { sources[], crossListed }>`. Normalize: lowercase, strip legal suffixes (Inc, LLC, Corp), strip punctuation.

**Cross-listed UI:** Show "N sites" badge on `crossListed: true` cards. In detail Sheet, show per-source price/salary comparison side by side. If prices differ: `"Source B lists $X higher"`.

### Status tracking in detail Sheet

Row of `Button` variants (`default` for active, `outline` for inactive), `size="sm"`, optimistic updates. Place below entity details in Sheet.

## Cross-Source Timeline View

Flatten + sort by date descending: `sources.flat().sort((a, b) => b.date.localeCompare(a.date))`. Each item: `{ date, type, title, subtitle, source, link }`. Visual: vertical line with colored dots per source. Tab bar for merged vs per-source views.

## Background Job Polling

For long-running operations: POST to start (returns `jobId`), store in `Map<jobId, Job>`, `useEffect` with `setInterval(1000)` polling active jobs. Auto-stop when all complete/error. Show `<Progress value={job.progress} />` + status `<Badge>`.

## Mini Sparkline (SVG, no deps)

Inline SVG `<polyline>`, map data points to coords, green (`#22c55e`) if up, red (`#ef4444`) if down. Filter nulls, compute min/max/range, scale to `120x32` viewbox. For complex charts: `@visx/shape` + `@visx/scale`.

## Mobile-First with Brand Colors

For brand-specific palettes, use a `COLORS` constants object with inline `style` (not Tailwind). Use `className` for layout (flex, gap, padding) and `style` for colors. Touch targets: `min-w-[44px] min-h-[44px]`. Bottom nav bar for mobile app feel.

## Nested Comment / Thread Tree

Recursive component with `depth` prop. Colored left-border per depth: `borderColor: hsl(${depth * 60 % 360}, 50%, 40%)`. Indent: `marginLeft: Math.min(depth, 6) * 16`. Click header to collapse/expand. Cap at maxDepth 6.

```tsx
function CommentTree({ comment, depth = 0 }: { comment: Comment; depth?: number }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div style={{ marginLeft: Math.min(depth, 6) * 16 }}>
      <div className="py-2 border-l-2 pl-3" style={{ borderColor: `hsl(${depth * 60 % 360}, 50%, 40%)` }}>
        <button onClick={() => setCollapsed(!collapsed)}>{/* author, score, timeAgo */}</button>
        {!collapsed && <>
          <p>{comment.body}</p>
          {comment.replies.map(r => <CommentTree key={r.id} comment={r} depth={depth + 1} />)}
        </>}
      </div>
    </div>
  );
}
```

## Video / Iframe Embed

Wrap `<iframe>` in `aspect-video` container. Prefer `-nocookie` embed domains. For local video: `<video controls>` with server-side `Content-Range` support.

### Static file serving with range requests

Return raw `new Response()` (not `c.json()`) with `Content-Range` headers. Prevent path traversal (`..` and `/` in filename). Import `createReadStream` from `node:fs`, `Readable` from `node:stream`. Status 206 for partial content.

```typescript
const range = c.req.header('range');
if (range) {
  const [startStr, endStr] = range.replace('bytes=', '').split('-');
  const start = parseInt(startStr), end = endStr ? parseInt(endStr) : stat.size - 1;
  return new Response(Readable.toWeb(createReadStream(filepath, { start, end })) as ReadableStream, {
    status: 206, headers: { 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Type': 'video/mp4' },
  });
}
```

## API Call Pattern

All endpoints: `http://localhost:3001/api/<domain>/<path>`. Browser must be connected or proxy returns 503. POST endpoints need `Content-Type: application/json`.

## Gotchas

| Problem | Fix |
|---------|-----|
| CORS error | Server has CORS enabled — check port |
| 503 from proxy | Connect browser at `/browser?profile=<domain>` |
| Empty results | `curl` the endpoint directly first |
| Hydration error | Add `'use client'` at top |
| Page not found | Directory name must match URL path |

## Guiding Principles

These override everything above. If a principle conflicts with a pattern, the principle wins.

1. **An untested button is a broken button.** Walk the full user journey to reach it — don't test in isolation. `search → click result → scroll → click download → verify`
2. **Every view of the same entity is the same product.** If the watch page has rich metadata, the downloads page playing the same video must too.
3. **The first visit with zero setup IS the product.** No browser connected, no data seeded. If it shows an error, it's not done.
4. **Silent failure is the worst failure.** Empty `catch {}` = user stares at a spinner forever. Every catch must surface a message.
5. **Clickable things must look clickable. Non-clickable things must not.** No hover-only affordance — mobile has no hover. `cursor-pointer`, color, underline, or icon must be visible by default.
6. **Pass values, not state.** Never `setState(x)` then call a function that reads state — it sees the old value. Pass `x` as a parameter. `fetchResults(suggestion)` not `setQuery(s); handleSearch()`
7. **Error messages answer three questions: what, why, what now.** "Unavailable" fails. "Dice unavailable — connect browser at /browser to enable" passes.
8. **Text never touches its container edge.** `p-4` minimum for cards, `p-6` for sheets. If text touches the border, spacing is broken.
9. **Every list item earns its click.** Title alone is never enough. Show title + subtitle + one metric. `"Kendrick Lamar"` fails. `"Kendrick Lamar · Jun 15 · Allegiant Stadium · from $89"` passes.
10. **Every input responds to Enter.** If you can type in it and there's a submit action, Enter triggers it.
11. **Sequential fetches need progress narration.** Show which source is being queried. `"Searching Airbnb... (2 of 3)"` not a generic spinner for 30 seconds.
12. **Normalize before merging.** Different formats of the same entity must produce the same key. `"Austin, TX"` and `"Austin TX"` must match. Trim, lowercase, strip punctuation.
13. **Mobile is a different product.** Test at 375px for: overlapping text, truncated inputs, hidden hover-only elements, 44px minimum touch targets, single-column layout.

## Definition of Done

**Use visual-dev skill + debug-logs skill. Every page must pass before committing.**

- [ ] Screenshot every state (empty, loading, populated, error, detail, mobile 375px) — judge against the 7 criteria
- [ ] Walk every user journey end-to-end via Patchright (search → results → detail → interact → back)
- [ ] Zero console errors on load and after each interaction
- [ ] Zero-setup first visit shows useful content or clear actionable guidance
- [ ] Padding, affordance, Enter key, error messages all pass the 13 principles above
