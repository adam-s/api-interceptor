# Interceptor

Paste a natural-language prompt. Claude Code discovers the target site's API through browser traffic interception, generates a typed domain plugin with proxy routes, and builds a working dashboard — no manual work beyond the initial prompt.

The browser IS the API client. Patchright drives a real browser session, captures network traffic via CDP, and reverse-engineers API endpoints — no documentation required. Proxy routes then serve that data through the browser's authenticated session, so cookies and auth are automatic.

## How It Works

```mermaid
flowchart LR
    subgraph Base ["base branch — skills accumulate"]
        Skills["Skills + Framework"]
    end

    Skills -->|"branch"| Build

    subgraph Iteration ["test branch — disposable"]
        Build["Observe → Build → Verify"]
        Build -->|"fix"| Build
    end

    Build -->|"learnings"| Skills
```

The outer loop improves the skills. The inner loop builds each app. Every test branch is disposable — only the skills grow.

## Architecture

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

## Autonomous Mode Setup

If using Claude Code autonomously (no human reviewing each step), add the prompt compliance gate to your project memory so it loads into every conversation:

1. Create `feedback_prompt_compliance.md` in your Claude Code memory directory:

```markdown
---
name: prompt_compliance_gate
description: Before committing, list every prompt requirement with evidence. Any without evidence = not done.
type: feedback
---

Before committing: list every prompt requirement, state evidence for each (curl output, screenshot,
Patchright click). Any requirement without evidence = not done. Loop until all have evidence.

**Why:** An agent can build something that looks correct in screenshots but silently misses half the
prompt's requirements. Visual QA verifies quality; the compliance matrix verifies completeness.

**How to apply:** At the start of work, extract requirements from the prompt into a numbered list.
Before committing, produce a Prompt Compliance Matrix with PASS/FAIL and evidence for each row.
```

2. Add a pointer in your `MEMORY.md`:

```
- [Prompt compliance gate](feedback_prompt_compliance.md) — BEFORE COMMITTING: list every prompt requirement, state evidence for each. Any without evidence = not done.
```

This is a third layer of enforcement (alongside CLAUDE.md and skill files) ensuring the agent verifies completeness before committing.

## License

MIT
