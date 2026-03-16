# API Interceptor Architecture Reference

Load this file when you need detailed understanding of how the framework works internally.

## Project Structure

```
api-interceptor/
  domains/                    ← Domain plugins (one per website)
    ticketmaster/             ← Reference: proxy routes, no auth
    robinhood/                ← Reference: full API client, auth, sessions
    investing/                ← Reference: auth verification
    minuteinbox/              ← Reference: no auth, utility
  packages/
    browser/                  ← Framework
      src/handler/            ← WebSocket handler + domain-loader + api-proxy
      src/shared/             ← GenericInterceptor, types, config interface
      src/codegen/            ← Traffic analyzer → schema inferencer → client generator
      src/remote/             ← RemoteBrowserService, profiles, lifecycle
    shared/                   ← Utilities (logging, validation)
  apps/
    api/                      ← Hono server
      src/index.ts            ← HTTP + WebSocket server, mounts all routes
      src/register-domains.ts ← Imports and registers domain plugins
    web/                      ← Next.js dashboard
  data/
    browser-profiles/         ← Persistent Chrome profiles (gitignored)
```

## DomainPlugin Interface

```typescript
interface DomainPlugin {
  domainName: string;
  config: InterceptorConfig;
  routes?: DomainRoute[];          // Proxy routes for browserFetch()
  createInterceptor: () => GenericInterceptor;
  verifyCredentials?: (headers) => Promise<VerificationResult>;
  detectLoginPage?: (url: string) => boolean;
  onVerified?: (result) => Record<string, unknown>;
  onVerificationFailed?: (error: string) => Record<string, unknown>;
  onLoginDetected?: () => Record<string, unknown>;
}

interface DomainRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;        // Hono route: '/trending/searches'
  targetUrl: string;    // Full URL: 'https://www.ticketmaster.com/api/trending/searches/attraction'
  description?: string;
}
```

## How browserFetch Works

`RemoteBrowserService.browserFetch()` (packages/browser/src/remote/service.ts line 945):

1. Checks if browser is on the same origin as targetUrl
2. If not, navigates to that origin first (so cookies are included)
3. Runs `page.evaluate(async () => fetch(url, { credentials: 'include' }))` inside the browser
4. Returns `{ status, data, headers }`

Cookies, CSRF tokens, and session state are automatic — no manual header management.

## Traffic Capture Flow

1. WebSocket connects to `/browser/stream?profile=name&capture=domain.com`
2. `handleBrowserWebSocket()` launches Patchright via `RemoteBrowserService`
3. `page.route(**/*domain/**)` intercepts matching requests
4. Each intercepted req/res is stored in the traffic buffer
5. `GET /browser/traffic` returns captured entries
6. `GET /browser/traffic/summary` returns deduplicated endpoint patterns

## Proxy Flow

1. Domain plugin registers routes via `DomainPlugin.routes`
2. `createDomainProxy()` creates Hono sub-app at `/api/<domainName>/`
3. When called, each route runs `browser.browserFetch(targetUrl)`
4. Response is returned directly to the caller as JSON

## Registration Flow

1. Domain package exports `plugin: DomainPlugin`
2. `apps/api/src/register-domains.ts` imports and calls `registerDomain(plugin)`
3. `apps/api/package.json` lists the domain as a workspace dependency
4. `pnpm install` links the workspace package

## Key Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /browser/health` | Browser connection status |
| `GET /browser/traffic` | All captured API traffic |
| `GET /browser/traffic/summary` | Deduplicated endpoint patterns |
| `DELETE /browser/traffic` | Clear traffic buffer |
| `GET /api` | List all domains and their routes |
| `GET /api/<domain>/` | List routes for a domain |
| `GET /api/<domain>/<path>` | Proxy request through browser |

## Glob Pattern for Traffic Capture

The `capture` query parameter uses `**/*<domain>/**` glob matching.
Use the root domain (e.g., `ticketmaster.com`) to catch all subdomains
(`www.`, `api.`, `identity.`, `promoted.`, etc.).

## Bot Protection Patterns Discovered

### AWS WAF Challenge (StubHub, 2026-03-16)
- Page renders seat map and header normally
- Ticket listing cards are withheld until WAF challenge passes
- `challenge.compact.js` makes a POST to the event URL as a verification step
- In real browsers this passes silently; in headless Patchright the challenge fails
- Ticket data IS in the initial SSR HTML response but the React components that render individual ticket cards require the WAF challenge to complete
- Result: page shows "70 listings" but cards don't render

### Implications for the Framework
- Some sites require passing bot protection BEFORE data becomes accessible
- The headless browser stealth (Patchright) bypasses basic detection but not advanced WAF challenges
- A persistent profile with real cookies (from a manual login) may solve this
- The skill should instruct users to: navigate manually once in a non-headless browser to establish cookies, then use the same profile in headless mode

## SSR + Pagination Pattern (StubHub, 2026-03-16)

Many sites load initial data via SSR (embedded in HTML) and use JSON APIs for pagination:

1. **Page 1**: Data embedded in SSR HTML response (no separate API call)
2. **Page 2+**: POST to the page URL with pagination params → JSON response

### StubHub Example
- Initial load: GET returns HTML with first 16 tickets embedded
- Click "Show more": POST to same URL with JSON body:
  ```json
  {"ShowAllTickets":true,"Quantity":2,"CurrentPage":2,"PageSize":16,"SortBy":"RECOMMENDED"}
  ```
- Response: JSON with `items[]` containing `section`, `row`, `seat`, `availableTickets`, price data

### Discovery Approach
1. Navigate to the page, wait for full render
2. Use `page.click('button:has-text("Show more")')` or similar to trigger pagination
3. CDP captures the POST request with the pagination params
4. The request body reveals the API contract (what params to send)
5. The response body reveals the data shape (what fields are returned)

### For the Domain Plugin
Create a route that proxies the pagination POST:
```typescript
{
  method: 'POST',
  path: '/event/:eventId/listings',
  targetUrl: 'https://www.stubhub.com/path/event/{eventId}/',
  description: 'Get ticket listings for an event (pagination)',
}
```
