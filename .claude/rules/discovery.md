> **GATE: Fill the elimination table BEFORE writing route code.**

# Discovery Protocol

This is an API interceptor. Navigate to a page → trigger pagination → capture the request/response → build a proxy route.

## PRE-FLIGHT → GATHER → SCAN → CLASSIFY → BUILD

Five steps. No skipping. No building until classification is complete.

---

### STEP 0: PRE-FLIGHT (0 tool calls — use your training knowledge)

Before connecting the browser, write down everything you already know about the target website. You have been trained on the web — use that knowledge.

```
## Pre-flight: [target URL]
- What is this site? What does it sell/show?
- Framework: [Next.js, SvelteKit, React SPA, server-rendered, etc.]
- Known API endpoints or patterns: [e.g., internal API paths, GraphQL endpoint, REST API]
- Pagination pattern: [cursor, offset/limit, page numbers, infinite scroll, "Show More" button]
- Authentication: [public, API key, CSRF token, cookies, OAuth]
- Bot detection: [Cloudflare, Kasada, Akamai, DataDome, none known]
- Embedded data pattern: [__NEXT_DATA__, data-deferred-state, window.__INITIAL_STATE__, etc.]
- Which specific page will have 100+ items? [use your knowledge to name a specific URL or navigation path]
- Known rate limits or gotchas: [geo-restrictions, consent walls, login walls]
```

**WARNING: Your training data may be stale.** Sites change their APIs, frameworks, and auth mechanisms constantly. Everything above is a hypothesis, not fact. GATHER must confirm or correct every assumption. Do NOT skip GATHER because you think you already know the answers. Do NOT build routes from pre-flight knowledge alone — every endpoint must be verified against the live site.

---

### STEP 1: GATHER

Two jobs: (A) confirm/correct your pre-flight, (B) intercept pagination.

**1a. Connect browser.**

```bash
./scripts/connect-browser.sh --profile <domain> --url <target> --port PORT
sleep 15
```

**1b. Confirm your pre-flight (1-2 tool calls).** Navigate the homepage and verify your pre-flight hypotheses. Correct anything that's wrong. You already know what this site is — don't spend tool calls rediscovering it.

**1c. Find a page with 100+ items.** You already know what kind of pages on this site will have the most items — use that knowledge. Navigate directly to a page you expect to have 100+ items. Check the count with `page.evaluate` (read a "showing X of Y" indicator or count list elements). If < 100 items, navigate to a busier instance — don't attempt interception on small pages. Pagination controls and XHR endpoints only appear when there are enough items to paginate.

**1d. Intercept pagination.** Snapshot → trigger → diff.

```bash
# 1. Snapshot BEFORE
curl -s http://localhost:PORT/browser/traffic > /tmp/traffic-before.json

# 2. Trigger pagination via page.evaluate
curl -s -X POST http://localhost:PORT/browser/mcp/evaluate \
  -H 'Content-Type: application/json' \
  -d '{"script":"document.querySelector(\"[class*=more], [class*=load], [class*=next], [aria-label*=next], [aria-label*=Next]\")?.click()"}'
sleep 5

# 3. Snapshot AFTER and diff
curl -s http://localhost:PORT/browser/traffic > /tmp/traffic-after.json
```

**Success:** New traffic entries appeared → record URL, method, headers, response shape.

**If 0 new entries:** The most likely cause is the page didn't have enough items to trigger pagination. Try:
1. A page with MORE items (check the count — you need 100+)
2. A different control (scroll, "Next" link, page number)
3. Only after trying 3+ pages with 100+ items and getting 0 XHR each time, conclude the site uses embedded data

**1e. Repeat on a second page type.** Intercept at a different level of the content hierarchy.

**1f. Capture final traffic.**

```bash
curl -s http://localhost:PORT/browser/traffic > /tmp/traffic-all.json
```

**GATHER rules:**
- Browser only — no `rateLimitedFetch`, no `curl`, no direct HTML/JS fetching
- `page.evaluate` is for interaction only — do NOT read `__NEXT_DATA__`, Redux state, DOM text, or HTML
- Low traffic (1-4 entries) is normal after one page load — navigate more pages, don't panic

---

### STEP 2: SCAN

Now fetch HTML/JS and analyze everything.

**2a. Traffic scan** (one pass):
```bash
curl -s http://localhost:PORT/browser/traffic | python3 -c "
import sys,json
d = json.load(sys.stdin)
for e in d.get('entries',[]):
    ct = e.get('responseHeaders',{}).get('content-type','')
    print(f'{e[\"method\"]} {e[\"url\"][:80]} [{ct[:40]}]')
"
```

**2b.** Fetch HTML of 2 page types + largest JS bundle via `browserFetch`.

**2c. HTML scan** (both pages):
```bash
grep -oE '<script[^>]*type="application/json"[^>]*>' page.html
grep -oE '__NEXT_DATA__|data-deferred-state|data-sveltekit-fetched|__NUXT_DATA__|__remixContext' page.html
grep -oE 'type="hidden"[^>]*value="[^"]*"|meta name="[^"]*" content="[^"]*"' page.html
```

**2d. JS bundle scan:**
```bash
grep -oE 'wss://[^"'\'' ]+|new WebSocket\(|\.m3u8|MediaSource|protobuf|EventSource|graphql|/gql|grpc|application/grpc' bundle.js
```

**2e. Access Gap table.** For each API endpoint in traffic, try direct HTTP (no cookies):

```
| Endpoint | Browser status | Direct HTTP status | Gap? |
|----------|---------------|-------------------|------|
| [url]    | 200           | 200 / 401 / 403   | Y/N  |
```

Gap=Y → session harvest in BUILD (read `session-harvest.md` first).

---

### STEP 3: CLASSIFY (reasoning only)

Verify your site understanding. Routes must cover every level of the content hierarchy, especially the deepest.

```
## Transport Elimination: [domain]
| Transport      | Present? | Evidence                                    |
|----------------|----------|---------------------------------------------|
| Embedded JSON  | ✓ or ✗   | [evidence]                                  |
| JSON API (XHR) | ✓ or ✗   | [evidence]                                  |
| GraphQL        | ✓ or ✗   | [evidence]                                  |
| WebSocket      | ✓ or ✗   | [evidence]                                  |
| HLS/Media      | ✓ or ✗   | [evidence]                                  |
| gRPC-Web       | ✓ or ✗   | [evidence]                                  |
| SSE            | ✓ or ✗   | [evidence]                                  |
| Encoded/Binary | ✓ or ✗   | [evidence]                                  |
```

Every row needs ✓ or ✗ with evidence. Every Gap=Y endpoint needs a planned route. Do NOT start BUILD until this is filled.

---

### STEP 4: BUILD

**For each ✓ transport, build a route.** See `domains/boardshop/src/routes.ts` for working examples of every pattern.

**Phase A — Prove it works.** For Gap=N: try `rateLimitedFetch` first, then `browserFetch`, then `page.evaluate`. For Gap=Y: go directly to session harvest.

**Phase B — Complete pagination.** After each route, fill:

```
| Items returned | ___ |
| Total indicated | ___ |
| Complete | yes / no |
```

If total > items returned, paginate. Common patterns: URL params (`?page=2`), response cursors, POST body increment, offset+limit, click-intercept.

**Session harvest:** Read `.claude/skills/api-discovery/reference/session-harvest.md` before writing any harvest code. Use traffic replay + elimination to find the minimum required auth set.

**Test each route** through the API server proxy before building the next.
