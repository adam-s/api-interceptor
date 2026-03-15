---
name: api-discovery
description: Reverse-engineer any web API by capturing browser traffic with Patchright route interception. Use when building typed API clients for sites without public documentation.
---

# API Discovery via Traffic Capture

Reverse-engineer undocumented web APIs by intercepting browser traffic with Patchright, reading the real JSON shapes, and writing Zod schemas + typed client methods from captured data — not from guessing.

**The core principle**: Claude is both the operator and the documenter. Navigate the site, trigger API calls, read the captured traffic, write perfectly accurate types from production data. One conversation loop, no manual copying from DevTools.

## Two Modes

This skill operates in two modes. Choose based on your setup:

| Mode | When to use | How it works |
|------|------------|--------------|
| **Live Mode** | The project has a running API server with the remote browser (`@interceptor/browser`) | Claude Code drives the remote browser via the dashboard, polls `GET /browser/traffic` to read intercepted API traffic, iterates until the API model is complete |
| **Batch Mode** | Standalone discovery without the remote browser infrastructure | Write a temporary Patchright capture script, run it, dump buffer, analyze offline |

**Prefer Live Mode** when available — it's a tighter loop (no script writing, instant traffic reads, Claude controls the browser directly).

---

## Live Mode

### Prerequisites

1. **API server running** on port 3001 with the browser route mounted at `/browser`
2. **Dashboard running** on port 3000 with the `/browser` page for visual feedback (optional but recommended)
3. The remote browser supports two interception modes:
   - **Robinhood profile** (`?profile=robinhood-trading`): Traffic capture is automatic — the `RobinhoodInterceptor` feeds all API request/response pairs into the buffer
   - **Any domain** (`?capture=api.example.com,gateway.example.com`): Generic traffic capture for arbitrary domains

### Traffic API Endpoints

All endpoints are relative to the API server (default `http://localhost:3001`):

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/browser/traffic` | Return all captured traffic entries |
| `GET` | `/browser/traffic?since=42` | Return entries with `id > 42` (incremental polling) |
| `GET` | `/browser/traffic/summary` | Return de-duplicated endpoint patterns with counts |
| `DELETE` | `/browser/traffic` | Clear the traffic buffer |
| `GET` | `/browser/health` | Browser status, lifecycle, metrics |

#### Traffic entry shape

```json
{
  "entries": [
    {
      "id": 1,
      "timestamp": 1708000000000,
      "method": "GET",
      "url": "https://api.robinhood.com/accounts/",
      "requestHeaders": { "authorization": "Bearer ...", ... },
      "requestBody": null,
      "status": 200,
      "responseHeaders": { "content-type": "application/json", ... },
      "responseBody": { "results": [...] },
      "durationMs": 145
    }
  ],
  "total": 1,
  "oldestId": 1,
  "newestId": 1
}
```

Large response bodies (>50KB) are automatically truncated to `{ _truncated: true, _size: N, _preview: "..." }`.

#### Summary endpoint shape

```json
{
  "totalEntries": 47,
  "uniqueEndpoints": 12,
  "endpoints": [
    { "pattern": "https://api.robinhood.com/accounts/", "count": 3, "methods": ["GET"], "statuses": [200] },
    { "pattern": "https://api.robinhood.com/marketdata/quotes/", "count": 8, "methods": ["GET"], "statuses": [200] }
  ]
}
```

### Live Mode Workflow

#### Step 1: Connect the browser

The user connects via the dashboard at `http://localhost:3000/browser`, or the WebSocket connection is established programmatically. For Robinhood, the `robinhood-trading` profile is used — traffic capture starts automatically when the interceptor attaches.

For other sites, connect with the `capture` query parameter:
```
ws://localhost:3001/browser/stream?profile=my-profile&capture=api.example.com,gateway.example.com
```

#### Step 2: Clear the buffer

Before each discovery iteration:

```bash
curl -X DELETE http://localhost:3001/browser/traffic
```

This resets the buffer so you only analyze traffic from the next interaction.

#### Step 3: Navigate and interact

Use the dashboard (or tell the user to navigate). For known profiles with persisted sessions, the user may already be logged in. Navigate to a specific feature page — each page triggers its own set of API calls.

After the user navigates or interacts (click, search, paginate, form submit), wait 2-3 seconds for API calls to complete.

#### Step 4: Read the captured traffic

```bash
curl -s http://localhost:3001/browser/traffic | jq .
```

Or for a quick overview:
```bash
curl -s http://localhost:3001/browser/traffic/summary | jq .
```

For incremental reads (only new entries since last check):
```bash
curl -s "http://localhost:3001/browser/traffic?since=42" | jq .
```

#### Step 5: Analyze and write schemas

For each captured entry, follow the same analysis as Batch Mode:

1. **URL pattern** — strip IDs to find the template
2. **HTTP method** — GET/POST/PUT/DELETE
3. **Request body** — shape of what the client sends
4. **Response body** — JSON shape → Zod schema
5. **Auth headers** — which headers are required
6. **Status codes** — success vs error responses

Write Zod schemas from the actual response JSON. See [Rules for Schema Writing](#rules-for-schema-writing) below.

#### Step 6: Iterate

```
Clear buffer → User navigates to next feature → Wait → Read traffic → Analyze → Schema → Repeat
```

Each iteration reveals more endpoints. Use the summary endpoint to track coverage:
```bash
curl -s http://localhost:3001/browser/traffic/summary | jq '.endpoints[] | .pattern'
```

#### Step 7: Write typed client methods

Once you have schemas for all discovered endpoints, write the typed client class. See [Write Typed Client Methods](#step-5-write-typed-client-methods-1) below.

### Live Mode Example: Robinhood API Discovery

```bash
# 1. Clear buffer
curl -X DELETE http://localhost:3001/browser/traffic

# 2. User logs into Robinhood via dashboard — interceptor captures all API traffic
# Wait for login + page load...

# 3. Read what happened
curl -s http://localhost:3001/browser/traffic/summary | jq .
# Shows: /accounts/, /portfolios/, /positions/, /marketdata/quotes/, etc.

# 4. Read full details for a specific endpoint
curl -s http://localhost:3001/browser/traffic | jq '.entries[] | select(.url | contains("accounts"))'

# 5. Clear and navigate to options page for more endpoints
curl -X DELETE http://localhost:3001/browser/traffic
# User clicks Options tab in dashboard...

# 6. Read options-specific traffic
curl -s http://localhost:3001/browser/traffic | jq '.entries[] | .url'
# Shows: /options/chains/, /options/instruments/, /marketdata/options/, etc.
```

---

## Batch Mode

Use when you don't have the remote browser infrastructure running. Write a standalone capture script.

### Prerequisites

#### 1. A running Patchright browser with route interception

The `@interceptor/browser` package provides everything needed. If you're working in a project that has it:

```typescript
import { chromium } from 'patchright';
```

If not, install Patchright directly:

```bash
pnpm add patchright
npx patchright install chromium
```

#### 2. Identify the target domains

Before writing any interception code, discover what API domains the site uses. Open Chrome DevTools Network tab manually (or use a quick capture script), navigate to the site, and note the domains that appear in XHR/Fetch requests.

Common patterns:
- `api.example.com` — dedicated API subdomain
- `example.com/api/` — same-origin API path
- `gateway.example.com` — API gateway
- Third-party domains for auth, analytics, CDN (ignore these)

#### 3. Identify authentication mechanism

The site authenticates via one or more of:
- **Bearer token** in `Authorization` header (most common for SPAs)
- **Cookies** (session-based, sent automatically)
- **Custom headers** (`X-Api-Key`, `X-Session-Token`, etc.)
- **Query parameters** (rare, usually for public APIs)

You'll discover this from the captured traffic — don't guess upfront.

### Step 0: Write the Capture Script

Create a temporary Patchright script that launches a persistent browser, attaches route interception to your target domains, and stores captured request/response pairs in a ring buffer.

```typescript
import { chromium, type Route } from 'patchright';

// --- Configuration ---
const TARGET_DOMAINS = ['api.example.com', 'gateway.example.com'];
const PROFILE_DIR = './data/browser-profiles/discovery';
const MAX_ENTRIES = 200;

// --- Ring buffer ---
interface TrafficEntry {
  timestamp: number;
  method: string;
  url: string;
  requestBody: unknown;
  status: number;
  responseBody: unknown;
}

const buffer: TrafficEntry[] = [];

function addEntry(entry: TrafficEntry) {
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
}

// --- Route handler ---
async function handleRoute(route: Route): Promise<void> {
  const request = route.request();
  const url = request.url();
  const method = request.method();

  // Parse request body
  let requestBody: unknown = null;
  try {
    const postData = request.postData();
    if (postData) requestBody = JSON.parse(postData);
  } catch { /* not JSON */ }

  try {
    // Fetch the real response
    const response = await route.fetch();
    const status = response.status();

    // Parse response body
    let responseBody: unknown = null;
    try {
      responseBody = await response.json();
    } catch {
      try { responseBody = await response.text(); } catch { /* binary */ }
    }

    addEntry({ timestamp: Date.now(), method, url, requestBody, status, responseBody });

    // Fulfill with the real response — the site works normally
    await route.fulfill({ response });
  } catch (error) {
    // Don't block the request on errors
    try { await route.continue(); } catch { /* page closed */ }
  }
}

// --- Main ---
const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false,
  viewport: { width: 1280, height: 720 },
});

const page = context.pages()[0] ?? await context.newPage();

// Attach interception for each target domain
for (const domain of TARGET_DOMAINS) {
  await page.route(`**/${domain}/**`, handleRoute);
}

console.log('Browser launched. Navigate to the target site and interact.');
console.log('The script captures all API traffic to the configured domains.');
console.log('Press Ctrl+C to stop and dump captured traffic.');

// Keep alive until interrupted
process.on('SIGINT', () => {
  console.log(JSON.stringify(buffer, null, 2));
  process.exit(0);
});

// Prevent Node from exiting
await new Promise(() => {});
```

**Key decisions in this script:**

- `route.fetch()` + `route.fulfill({ response })` — the interception is **read-write capable**. We fetch the response ourselves, read it, then pass it through. This is different from `route.continue()` which can't read the response body.
- **Persistent context** — cookies and localStorage survive restarts. The user logs in once; subsequent runs resume the session.
- **Ring buffer** (200 entries) — large enough for a full page load (~30-40 API calls), small enough to stay in memory.

> **Note**: Patchright lowercases all request header names. When extracting headers like `Authorization`, access them as `headers['authorization']`.

### Step 1: Clear and Navigate

Before each discovery session, clear the buffer so you only capture traffic from the target page:

```typescript
buffer.length = 0; // clear
await page.goto('https://example.com/feature-page');
```

Navigate to a specific feature, not the homepage. Each page/feature area triggers its own set of API calls. Work feature-by-feature.

### Step 2: Interact to Trigger API Calls

Web apps make API calls in response to user actions. Common triggers:

| Action | What it triggers |
|--------|-----------------|
| Page load | Initial data fetch, user profile, config |
| Search/filter | Query endpoint with parameters |
| Pagination (scroll, "Load More") | Next page cursor or offset request |
| Form submit | POST/PUT/PATCH with body |
| Dropdown/modal open | Lazy-loaded data fetch |
| Tab switch | Different data view endpoint |

Click through the feature systematically. Open every dropdown, submit every form variation, paginate through results. Each interaction may reveal new endpoints.

### Step 3: Read the Captured Traffic

Dump the buffer and analyze. For each entry, note:

1. **URL pattern** — strip IDs to find the template: `/users/abc-123/orders` → `/users/{id}/orders`
2. **HTTP method** — GET (read), POST (create/action), PUT/PATCH (update), DELETE
3. **Query parameters** — pagination (`cursor`, `page_size`), filters, feature flags
4. **Request body** — for POST/PUT, the shape of what the client sends
5. **Response body** — the JSON shape. This is what you'll turn into a Zod schema
6. **Status codes** — 200 (success), 201 (created), 204 (no content), 400/401/403/404 (errors)
7. **Auth headers** — which headers are required. Note Bearer tokens, API keys, session cookies

Group related endpoints by feature area. A single page often uses 5-15 endpoints.

---

## Shared: Schema Writing and Client Methods

These steps are the same for both Live and Batch modes.

### Step 4: Write Zod Schemas from Real Data

For each unique response shape, write a Zod schema. Work from the actual JSON — don't invent fields.

#### Rules for Schema Writing

**Use `.nullable()` not `.optional()` for fields present in the response with null values.** If the field exists in every response but is sometimes `null`, it's nullable. If the field is missing entirely from some responses, it's optional.

```typescript
// Field always present, sometimes null
name: z.string().nullable(),

// Field missing from some responses
middle_name: z.string().optional(),
```

**Use `.passthrough()` on objects you haven't fully mapped.** During discovery, you'll see large response objects. Schema the fields you need; passthrough the rest. Tighten later.

```typescript
const AccountSchema = z.object({
  id: z.string().uuid(),
  account_number: z.string(),
  buying_power: z.string(), // numeric string, common in financial APIs
  // ... fields you care about
}).passthrough(); // ignore unknown fields for now
```

**Numeric strings are common.** Financial APIs often return numbers as strings to preserve decimal precision. Schema them as `z.string()` and parse to number in your client code, not in the schema.

**Paginated responses follow a pattern.** Most APIs use cursor-based or offset-based pagination:

```typescript
// Cursor-based (common)
const PaginatedSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    next: z.string().url().nullable(),    // URL for next page, null when done
    previous: z.string().url().nullable(),
    results: z.array(itemSchema),
  });

// Offset-based
const PagedSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    page: z.number(),
    total_pages: z.number(),
    items: z.array(itemSchema),
  });
```

**Validate immediately.** After writing a schema, parse one of the captured responses against it:

```typescript
const result = MySchema.safeParse(capturedResponse);
if (!result.success) {
  console.error(result.error.issues);
  // Fix the schema to match reality
}
```

### Step 5: Write Typed Client Methods

For each endpoint, write a typed method that:
1. Accepts typed parameters
2. Makes the HTTP request with captured auth headers
3. Parses the response with the Zod schema
4. Returns the typed result

```typescript
class ApiClient {
  constructor(private headers: Record<string, string>) {}

  async getAccount(accountId: string): Promise<Account> {
    const res = await fetch(`https://api.example.com/accounts/${accountId}/`, {
      headers: this.headers,
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const json = await res.json();
    return AccountSchema.parse(json);
  }
}
```

#### Patterns to Handle

**Pagination helper** — many endpoints return paginated results. Write a generic auto-paginator:

```typescript
private async paginate<T>(url: string, schema: z.ZodType<T[]>, key: string): Promise<T[]> {
  const all: T[] = [];
  let nextUrl: string | null = url;

  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: this.headers });
    const json = await res.json();
    all.push(...json[key]);
    nextUrl = json.next;
  }

  return all;
}
```

**Batch requests** — some APIs accept comma-separated IDs with a max batch size:

```typescript
async getQuotes(symbols: string[]): Promise<Quote[]> {
  const results: Quote[] = [];
  // API accepts max 50 symbols per request
  for (let i = 0; i < symbols.length; i += 50) {
    const batch = symbols.slice(i, i + 50);
    const url = `https://api.example.com/quotes/?symbols=${batch.join(',')}`;
    const res = await fetch(url, { headers: this.headers });
    const json = await res.json();
    results.push(...QuotesSchema.parse(json.results));
  }
  return results;
}
```

**Rate limiting** — if the API returns 429, add a delay between requests:

```typescript
if (res.status === 429) {
  const retryAfter = parseInt(res.headers.get('retry-after') ?? '5', 10);
  await new Promise(r => setTimeout(r, retryAfter * 1000));
  // retry...
}
```

### Step 6: Document the Endpoint Catalog

As you discover endpoints, maintain a catalog. For each endpoint:

```markdown
### GET /accounts/{account_id}/

**Purpose**: Fetch account details (buying power, account type, etc.)
**Auth**: Bearer token required
**Query params**: None
**Response**: `AccountSchema`
**Pagination**: No
**Notes**: `buying_power` is a numeric string. `account_type` is one of: 'cash', 'margin'.
```

Group by feature area (Account, Orders, Market Data, etc.). Note which endpoints require which auth headers — some APIs use different auth for different endpoint groups.

### Step 7: Repeat for Next Feature

```
Clear buffer → Navigate to next page → Interact → Capture → Schema → Client method → Document
```

Each iteration adds more endpoints. After 5-10 iterations you typically have full coverage of the API surface for the features you care about.

## Common Patterns

### Auth header capture

The interceptor sees every request to the target domain, including auth headers. Extract and store them:

```typescript
const AUTH_HEADERS = ['authorization', 'x-api-key', 'x-session-token'];
const captured: Record<string, string> = {};

// Inside route handler:
const reqHeaders = request.headers(); // Patchright lowercases these
for (const name of AUTH_HEADERS) {
  if (reqHeaders[name]) captured[name] = reqHeaders[name];
}
```

Use a Zod schema to validate you have all required headers before making API calls:

```typescript
const HeadersSchema = z.object({
  authorization: z.string().startsWith('Bearer '),
  'x-api-key': z.string().min(1),
});
```

### Persistent browser profiles

`launchPersistentContext` saves cookies/localStorage to disk. The user logs in once through the normal UI; subsequent script runs resume the session. Cookie sessions typically last 30 days; Bearer tokens refresh automatically via the app's JavaScript.

```typescript
const context = await chromium.launchPersistentContext(
  './data/browser-profiles/my-target',
  { headless: false }
);
```

Profile directories contain auth state — add them to `.gitignore`.

### Response body too large

Some endpoints return huge payloads (market data, historical prices). The traffic buffer auto-truncates bodies larger than 50KB. For batch mode, truncate manually:

```typescript
const MAX_BODY_SIZE = 50_000; // characters
let bodyStr = JSON.stringify(responseBody);
if (bodyStr.length > MAX_BODY_SIZE) {
  // Keep enough to see the shape
  responseBody = JSON.parse(bodyStr.slice(0, MAX_BODY_SIZE) + '..."truncated"');
}
```

For schema purposes, you only need to see the shape — not every element in a 10,000-item array. One page of results is enough.

## Getting Unstuck

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Traffic buffer empty after navigation | Interception patterns don't match the API domain | Check the actual request URLs; update `capture` domains or `INTERCEPT_PATTERNS` |
| `route.fetch()` throws | Request was to a different origin or CORS issue | Use `route.continue()` as fallback (lose response body but don't block) |
| Response body is null | Response isn't JSON (binary, protobuf, streaming) | Check `content-type` header; some APIs use non-JSON formats |
| Auth headers not appearing | The app uses cookies, not headers | Cookies are sent automatically — you may not need to capture them explicitly |
| Schema parse fails on second page | Different response shape for edge cases | Use `.passthrough()` initially; tighten schemas after seeing multiple responses |
| Token expired (401 responses) | Bearer token rotated | Refresh the browser page — the app's JS will get a new token, interceptor captures it |
| Site detects automation | Missing stealth measures | Use `@volat/browser` stealth primitives or Patchright's built-in anti-detection |
| Too many irrelevant requests | Interception patterns too broad | Narrow to specific API paths: `**/api/v2/accounts/**` instead of `**/api.example.com/**` |
| Live mode: GET /traffic returns 404 | Browser route not mounted | Check that `apps/api/src/index.ts` mounts the browser app at `/browser` |
| Live mode: entries empty but browser works | Profile doesn't have interceptor | Use `?capture=domain.com` for non-Robinhood profiles |

## Complementary Skills

- **visual-dev** — take screenshots to see what UI elements trigger which API calls
- **systematic-testing** — after writing the client, test each method layer-by-layer
- **debug-logs** — add DEBUG() calls to trace request/response flow when something doesn't match
