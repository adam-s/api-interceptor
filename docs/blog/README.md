# Interceptor Documentation

Technical explorations and guides for the Interceptor framework.

## Architecture

Design decisions and infrastructure foundations.

- [01: Runtime Choice (Bun vs Node)](architecture/01-runtime.md)
- [02: Docker & Monorepo](architecture/02-docker.md)
- [03: Local CI Pipeline](architecture/03-local-ci.md)

## Features

Core capabilities and system design.

### API Interception & Browser Automation

- [19: Stealth Browser & Anti-Detection](features/19-stealth-browser.md)
  - Implementation: `packages/browser/src/stealth.ts`, `stealth-browser.ts`, `blocker.ts`
- [20: CDP Screencast & Remote Browser](features/20-cdp-screencast.md)
  - Implementation: `packages/browser/src/remote/service.ts`, `browser-manager.ts`, `profiles.ts`
- [21: Auth Interception & Session Capture](features/21-auth-interception.md)
  - Implementation: `packages/browser/src/remote/service.ts` (request/response capture)
- [23: WebSocket for Real-time Streaming](features/23-websocket-migration.md)
  - Implementation: `apps/api/src/ws.ts`, `apps/api/src/browser.ts`

### Core Features

- [08: Real-time Streaming (SSE/WebSocket)](features/08-streaming.md)
- [09: Skills & Automation](features/09-skills.md)
- [10: Python Bridge (IPC)](features/10-python-bridge.md)
- [15: Authentication (NextAuth v5)](features/15-authentication.md)

## Development

Setup, tooling, and workflow.

- [04: Claude Code Setup](development/04-claude-setup.md)
- [05: Project Memory](development/05-memory.md)
- [17: Visual Development](development/17-visual-dev.md)
- [18: GitHub CLI](development/18-gh-cli.md)

## Testing

Test infrastructure and approaches.

- [06: Vitest Setup](testing/06-vitest.md)
- [16: E2E Testing with Playwright](testing/16-e2e.md)

## Instruction Tuning

What 46 iterations of launching AI agents on real websites taught us about writing instructions they actually follow.

- [01: Forty-Six Iterations](instruction-tuning/01-the-loop.md) — Decision trees fail. Linear pipelines work.
- [02: The Word "Should"](instruction-tuning/02-soft-language.md) — Obligation language controls agent behavior.
- [03: The Model Already Knew](instruction-tuning/03-preflight.md) — PRE-FLIGHT saved 25 calls per run.
- [04: One Soft Word](instruction-tuning/04-consistency.md) — Multi-file consistency is non-negotiable.
- [05: 299 Lines to 153](instruction-tuning/05-shorter-is-louder.md) — Shorter instructions, better compliance.
- [06: Five Commits to Build a Wall](instruction-tuning/06-worktree-walls.md) — Agent isolation is harder than sandboxing.
- [07: The Most Common Pattern](instruction-tuning/07-anchoring.md) — Framing effects in instruction design.
- [08: When Do You Stop](instruction-tuning/08-convergence.md) — Convergence is not a green scorecard.

## Guides

Deep dives into specific areas.

- [07: Next.js & Frontend Architecture](guides/07-nextjs.md)
- [11: Unified Debug Logging](guides/11-debug-logging.md)

---

**Note**: These are technical explorations documenting decisions made during development. They're preserved for reference on architecture, tooling, and approach decisions.
