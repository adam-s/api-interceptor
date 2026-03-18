# Interceptor

Paste a natural-language prompt. Claude Code discovers the target site's API through browser traffic interception, generates a typed domain plugin with proxy routes, and builds a working dashboard — no manual work beyond the initial prompt.

The browser IS the API client. Patchright drives a real browser session, captures network traffic via CDP, and reverse-engineers API endpoints — no documentation required. Proxy routes then serve that data through the browser's authenticated session, so cookies and auth are automatic.

## Architecture

```mermaid
flowchart TB
    subgraph User ["User"]
        Prompt["Natural Language Prompt"]
        Dashboard["Dashboard Browser<br/>localhost:3000"]
    end

    subgraph Skills [".claude/skills/"]
        AD["api-discovery<br/>Observe → Classify → Extract → Verify"]
        DB["dashboard-builder<br/>Build pages from proxy APIs"]
        VD["visual-dev<br/>Screenshot verification"]
    end

    subgraph Framework ["Framework"]
        subgraph NextJS ["Next.js :3000"]
            Rewrite["/api/* → :3001/api/*"]
        end

        subgraph Hono ["Hono API :3001"]
            Proxy["Domain Proxy<br/>createDomainProxy()"]
            WS["WebSocket Handler<br/>/browser/stream"]
            Traffic["Traffic Buffer<br/>CDP Network.enable"]
        end

        subgraph Patchright ["Patchright Browser"]
            Page["Browser Page<br/>Cookies + Auth"]
        end
    end

    subgraph Target ["Target Website"]
        API["JSON API"]
        SSR["SSR Pages"]
    end

    Prompt --> AD
    AD --> WS
    WS --> Page
    Page --> API & SSR
    API & SSR --> Traffic
    Traffic --> AD
    AD -->|routes.ts| Proxy
    Proxy --> Page
    DB --> Dashboard
    Dashboard --> Rewrite --> Proxy
    VD --> Dashboard
```

## How It Works

```mermaid
sequenceDiagram
    actor Dev as Developer
    participant Skill as api-discovery Skill
    participant WS as WebSocket /browser/stream
    participant Browser as Patchright Browser
    participant Site as Target Website
    participant Traffic as Traffic Buffer
    participant Proxy as Domain Proxy /api/*
    participant UI as Dashboard /tickets

    Note over Dev,UI: Phase 1 — Observe
    Dev->>Skill: Paste prompt
    Skill->>WS: Connect (profile=domain, url=target)
    WS->>Browser: Launch with CDP Network.enable
    Browser->>Site: Navigate as real user
    Site-->>Browser: HTML + JS + API calls
    Browser-->>Traffic: Capture all XHR/Fetch
    Skill->>Traffic: GET /browser/traffic
    Traffic-->>Skill: Endpoint patterns + response shapes

    Note over Dev,UI: Phase 2-3 — Classify & Extract
    Skill->>Skill: Type A (JSON API) or Type B (SSR) or Hybrid?
    Skill->>Skill: Write DomainRoute[] (targetUrl or handler)

    Note over Dev,UI: Phase 4 — Verify
    Skill->>Proxy: curl /api/domain/search?q=test
    Proxy->>Browser: browserFetch() or page.evaluate()
    Browser->>Site: Fetch with inherited cookies
    Site-->>Browser: JSON response
    Browser-->>Proxy: {status, data}
    Proxy-->>Skill: Real data ✓

    Note over Dev,UI: Phase 5 — Build Dashboard
    Skill->>UI: Create Next.js page
    UI->>Proxy: fetch('/api/domain/search?q=knicks')
    Proxy->>Browser: browserFetch()
    Browser->>Site: GET https://api.example.com/search
    Site-->>Browser: JSON
    Browser-->>Proxy: Response
    Proxy-->>UI: Render results
```

## Proxy Request Flow

```mermaid
flowchart LR
    A["Dashboard<br/>fetch('/api/boardshop/boards')"] -->|rewrite| B["Next.js :3000<br/>/api/* → :3001/api/*"]
    B --> C{"Route Type?"}
    C -->|"Type A: targetUrl"| D["browserFetch(targetUrl)<br/>Cookies inherited"]
    C -->|"Type B: handler"| E["handler(c, browser)<br/>navigate + evaluate"]
    C -->|"browserRequired: false"| F["Direct fetch()<br/>No browser needed"]
    D --> G["Patchright Page<br/>page.evaluate(fetch)"]
    E --> G
    F --> H["Target API"]
    G --> H
    H --> I["JSON Response"]
    I --> J["Dashboard Component"]
```

## Quick Start

```bash
pnpm install
pnpm dev          # API on :3001, Web on :3000
```

Give Claude Code a prompt like:

> Search both BoardShop and DeckMarket for Element 8.0" decks. Match listings across platforms by brand, size, and colorway. Build a dashboard that shows a side-by-side price comparison — rows are products, columns are platforms, cheapest option highlighted in green.

The skills handle domain scaffolding, API discovery, route creation, dashboard building, and visual verification.

## Structure

```
.claude/skills/       Skills that drive the whole process
  api-discovery/      Discover APIs, create domain plugins
  dashboard-builder/  Build Next.js pages from proxy APIs
  visual-dev/         Screenshot-based UI iteration
  debug-logs/         Runtime debugging with DEBUG()

domains/              Domain plugins (one per website)
packages/browser/     Patchright browser automation
packages/shared/      Types, validation, debug logging
apps/api/             Hono server with WebSocket + proxy routes
apps/web/             Next.js dashboard
```

## Key Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /browser/health` | Browser connection status |
| `GET /browser/traffic` | Captured API traffic (CDP, WS browser only) |
| `GET /api` | List all domains and routes |
| `GET /api/<domain>/<path>` | Proxy through browser session |

## License

MIT
