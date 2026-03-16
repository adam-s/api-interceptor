# API Interceptor

Stop downloading entire web pages to get a few KB of data. Discover the lean JSON APIs that websites use internally, then call them directly.

## What It Does

1. **Discover**: Navigate a website in a headless browser. CDP captures every API call — including ones you'd never find in DevTools because they go to unexpected domains.

2. **Extract**: The skill classifies how the site delivers data:
   - **JSON APIs** → create proxy routes
   - **SSR HTML** → parse embedded JSON from the page response
   - **Hybrid** → SSR for page 1, pagination API for the rest

3. **Proxy**: Expose discovered APIs as clean REST endpoints that route through the browser's authenticated session. Cookies and auth are automatic.

## Real Example

We pointed this at StubHub and extracted 36 ticket listings with sections, rows, seats, and prices — without writing a single line of API documentation:

```
Section 235, Row 7, Seats 18-20, Price: $886.54
Section 223, Row 10, Seats 29-33, Price: $1,090.43
Section Golden Circle, Price: $3,150.99
```

The proxy endpoint: `POST /api/stubhub/event/158171526/listings`

## For Claude Code Users

This repo ships with skills that guide Claude Code through the entire process. Give it a prompt like:

> Create domains for StubHub and Ticketmaster. Search for Bad Bunny events, get ticket prices, and build a dashboard comparing prices by section.

The skills handle: domain scaffolding, API discovery, SSR extraction, route creation, dashboard building, and visual verification.

See [docs/temp/DEVELOPER_PROMPTS.md](docs/temp/DEVELOPER_PROMPTS.md) for more test prompts.

## Quick Start

```bash
git clone https://github.com/adam-s/api-interceptor
cd api-interceptor
pnpm install
pnpm run dev
```

API server: `http://localhost:3001`
Dashboard: `http://localhost:3000`
Browser: `http://localhost:3000/browser?profile=default&url=https://example.com`

## Project Structure

```
domains/            Domain plugins (one per website)
  ticketmaster/     Reference: JSON API routes
  robinhood/        Reference: full auth + API client
  investing/        Reference: auth verification
  minuteinbox/      Reference: no auth

packages/
  browser/          Framework: interceptor, handler, codegen, remote browser
  shared/           Utilities: logging, validation

apps/
  api/              Hono server: browser WebSocket + proxy routes
  web/              Next.js dashboard

.claude/skills/     Skills for Claude Code
  api-discovery/    Discover APIs, create domain plugins
  dashboard-builder/ Build Next.js pages consuming proxy APIs
  visual-dev/       Screenshot-based UI development
  debug-logs/       Iterative debugging
  systematic-testing/ Layer-by-layer validation
```

## How Domain Plugins Work

Each domain is a standalone package in `domains/`:

```typescript
// domains/mysite/src/index.ts
export const plugin: DomainPlugin = {
  domainName: 'mysite',
  config: { interceptPatterns: ['https://api.mysite.com/**'], ... },
  routes: [
    { method: 'GET', path: '/search', targetUrl: 'https://api.mysite.com/search' },
  ],
  createInterceptor: () => new MySiteInterceptor(),
};
```

Register in `apps/api/src/register-domains.ts`, run `pnpm install`, and your routes are live at `/api/mysite/search`.

## Key Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /browser/health` | Browser connection status |
| `GET /browser/traffic` | Captured API traffic (CDP) |
| `GET /api` | List all domains and routes |
| `GET /api/<domain>/<path>` | Proxy through browser session |

## Development

```bash
pnpm turbo typecheck    # Type checking
pnpm turbo test         # Unit tests
pnpm biome ci .         # Linting
./scripts/ci-local.sh   # Full CI locally
```

## License

MIT
