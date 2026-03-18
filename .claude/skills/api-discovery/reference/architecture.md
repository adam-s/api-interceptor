# API Interceptor Architecture Reference

Load this file when you need detailed understanding of how the framework works internally.

## Project Structure

```
api-interceptor/
  domains/                    ← Domain plugins (one per website, created on test branches)
    <domain-a>/               ← Example: proxy routes, SSR extraction
    <domain-b>/               ← Example: full API client with auth + sessions
  packages/
    browser/                  ← Framework
      src/handler/            ← WebSocket handler + domain-loader + api-proxy
      src/shared/             ← GenericInterceptor, types, config interface
      src/codegen/            ← Traffic analyzer → schema inferencer → client generator
      src/remote/             ← RemoteBrowserService, profiles, lifecycle
    shared/                   ← Utilities (logging, validation, rate limiting)
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
  routes?: DomainRoute[];          // Proxy routes — two dispatch modes below
  createInterceptor: () => GenericInterceptor;
  verifyCredentials?: (headers) => Promise<VerificationResult>;
  detectLoginPage?: (url: string) => boolean;
  onVerified?: (result) => Record<string, unknown>;
  onVerificationFailed?: (error: string) => Record<string, unknown>;
  onLoginDetected?: () => Record<string, unknown>;
}

// Discriminated union — exactly one of targetUrl or handler
type DomainRoute =
  | {
      method: 'GET' | 'POST' | 'PUT' | 'DELETE';
      path: string;
      targetUrl: string;       // Type A: simple proxy via browserFetch()
      handler?: never;
      description?: string;
      browserRequired?: boolean; // false = skip browser check, use direct fetch()
    }
  | {
      method: 'GET' | 'POST' | 'PUT' | 'DELETE';
      path: string;
      targetUrl?: never;
      handler: (c: Context, browser: RemoteBrowserService) => Promise<Response>;
      description?: string;     // Type B/B2/C: custom logic (SSR, traffic capture, etc.)
      browserRequired?: boolean;
    };
```

## How browserFetch Works

`RemoteBrowserService.browserFetch()` (in `packages/browser/src/remote/service.ts`):

1. Checks if browser is on the same origin as targetUrl
2. If not, navigates to that origin first (so cookies are included)
3. Runs `page.evaluate(async () => fetch(url, { credentials: 'include' }))` inside the browser
4. Returns `{ status, data, headers }`

Cookies, CSRF tokens, and session state are automatic — no manual header management.

## Traffic Capture Flow

⚠️ **Traffic capture requires a WebSocket-connected browser.** The auto-started headless browser does NOT capture traffic.

1. Connect via WebSocket: `ws://localhost:3001/browser/stream?profile=name&capture=example.com`
2. `handleBrowserWebSocket()` launches Patchright via `RemoteBrowserService`
3. CDP `Network.enable` intercepts ALL requests matching the capture domain
4. Each intercepted req/res is stored in the traffic buffer
5. `GET /browser/traffic` returns captured entries
6. `GET /browser/traffic/summary` returns deduplicated endpoint patterns

## Proxy Flow

1. Domain plugin registers routes via `DomainPlugin.routes`
2. `createDomainProxy()` creates Hono sub-app at `/api/<domainName>/`
3. When called:
   - `targetUrl` routes: `browser.browserFetch(targetUrl)` (Type A)
   - `handler` routes: `route.handler(context, browser)` (Type B/B2/C)
4. Response is returned directly to the caller as JSON

## Registration Flow

1. Domain package exports `plugin: DomainPlugin`
2. `apps/api/src/register-domains.ts` imports and calls `registerDomain(plugin)`
3. `apps/api/package.json` lists the domain as a workspace dependency
4. `pnpm install` links the workspace package

**Both steps 2 and 3 are required.** Missing either causes TS2307 or silent route failure.

## Key Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /browser/health` | Browser connection status |
| `GET /browser/traffic` | All captured API traffic (WS browser only) |
| `GET /browser/traffic/summary` | Deduplicated endpoint patterns |
| `DELETE /browser/traffic` | Clear traffic buffer |
| `GET /api` | List all domains and their routes |
| `GET /api/<domain>/` | List routes for a domain |
| `GET /api/<domain>/<path>` | Proxy request through browser |

## Glob Pattern for Traffic Capture

The `capture` query parameter uses `**/*<domain>/**` glob matching.
Use the root domain (e.g., `example-marketplace.com`) to catch all subdomains
(`www.`, `api.`, `identity.`, etc.).

## Bot Protection Patterns Discovered

### WAF Challenge (e-commerce sites)

Some marketplace sites use WAF challenges (AWS WAF, Akamai) that:
- Render page headers and navigation normally
- Withhold product listing cards until the challenge passes
- Run a `challenge.compact.js` POST as verification
- Pass silently in real browsers; fail in headless Patchright

**Result:** Page shows "70 listings" in header but cards don't render.

### Implications for the Framework

- Some sites require passing bot protection BEFORE data becomes accessible
- Patchright stealth bypasses basic detection but not advanced WAF challenges
- A persistent profile with real cookies (from a manual login) may solve this
- Workflow: navigate manually once in a non-headless browser (`BROWSER_HEADLESS=false`) to establish cookies, then use the same profile in headless mode

## SSR + Pagination Pattern

Many sites load initial data via SSR (embedded in HTML) and use JSON APIs for pagination:

1. **Page 1**: Data embedded in SSR HTML response (no separate API call)
2. **Page 2+**: POST to the page URL with pagination params → JSON response

### Discovery Approach

1. Navigate to the page, wait for full render
2. Use `page.click('button:has-text("Show more")')` to trigger pagination
3. CDP captures the POST request with the pagination params
4. The request body reveals the API contract (what params to send)
5. The response body reveals the data shape (what fields are returned)

### Example Domain Plugin Route

```typescript
{
  method: 'POST',
  path: '/listings',
  handler: async (c, browser) => {
    const body = await c.req.json();
    const page = browser.getPage();
    // Navigate, extract SSR page 1, then POST for page 2+
    // ...
  },
  description: 'Get product listings with pagination',
}
```
