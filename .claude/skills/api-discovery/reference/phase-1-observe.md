# Phase 1: Observe

1. Start server: `pnpm run dev`
2. Connect browser: `ws://localhost:3001/browser/stream?profile=default&url=<target-url>` (or dashboard at `http://localhost:3000/browser?profile=default&url=<target-url>`)
3. **Screenshot (visual-dev skill):** Take a screenshot to see what data is visible — prices, names, dates, listings. This is your ground truth. Every extraction step must produce data that matches what you see here.
4. Check traffic: `curl -s http://localhost:3001/browser/traffic | jq '[.entries[] | {method, url: .url[:120], status}]'`
5. **If traffic is empty or confusing, add DEBUG() calls** to `packages/browser/src/handler/index.ts` or `service.ts` to trace what CDP is capturing. Don't guess why traffic is missing — observe it.

**Use CDP for discovery, not `page.route()`.** CDP `Network.enable` catches ALL network requests; `page.route()` only intercepts requests matching its glob patterns and misses requests to unexpected domains (tracking pixels, subdomain APIs, third-party analytics). Narrow to `page.route()` later for proxy interception once you know the endpoints. (Note: `page.route()` is appropriate for test mocking in visual-dev scripts — just not for API discovery.)

**If traffic is empty (0 entries):** You are likely using the auto-start browser which has no CDP capture callback wired. Connect via WebSocket instead. See "Why the auto-start browser returns empty traffic" in the main SKILL.md for the full technical explanation.
