---
name: api-discovery
description: Discover any website's API and create domain plugins with proxy routes. Use when the user wants to create an API for a website, discover a web service's data transport, add a new domain, capture browser traffic, build typed API clients, or integrate with a third-party site. Also use when the user mentions a website name and wants to interact with it programmatically.
---

# API Discovery

Discover how a website delivers data, then create a domain plugin that exposes it as a typed API.

**Before writing ANY code:** follow `.claude/rules/discovery.md` and produce the Transport Classification table.

**Reference implementation:** `domains/boardshop/src/routes.ts` has working examples of every transport type against the test server.

## Phases

1. **Observe** — Connect browser via WebSocket, capture traffic, screenshot the page
2. **Classify** — Run the discovery protocol per data type. Produce Transport Classification table (MANDATORY GATE)
3. **Extract** — Write routes using the lightest approach (rateLimitedFetch → browserFetch → page.evaluate)
4. **Verify** — Curl every route, confirm real data (MANDATORY GATE — no dashboard until this passes)
5. **Scaffold** — Create domain plugin, register, test end-to-end. Command: `bash ${CLAUDE_SKILL_DIR}/scripts/scaffold-domain.sh <name> <root-domain>`

## References

- [reference/decoding.md](reference/decoding.md) — When API values don't match rendered DOM
- [reference/anti-bot.md](reference/anti-bot.md) — 429/403 troubleshooting checklist
- [reference/gotchas.md](reference/gotchas.md) — Singleton browser, background polling, multi-domain pages
