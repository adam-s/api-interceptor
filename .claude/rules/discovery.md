> **GATE: Fill the elimination table BEFORE writing route code.**

# Discovery Protocol

This is an API interceptor. Navigate to a page → trigger pagination → capture the request/response → build a proxy route.

## GATHER → SCAN → CLASSIFY → BUILD

Four steps. No skipping. No building until classification is complete.

---

### STEP 1: GATHER

Two jobs: (A) understand the site, (B) intercept pagination.

**1a. Connect browser.**

```bash
./scripts/connect-browser.sh --profile <domain> --url <target> --port PORT
sleep 15
```

**1b. Understand the site (2-3 tool calls).** Navigate the homepage and one other page. Answer using ONLY what you see (titles, navigation, headings):

```
## Site understanding
- What is the purpose of this website?
- What are the most important content types?
- Content hierarchy: [top-level → mid-level → detail-level]
- What is the deepest, most valuable paginated content?
- Where will I find a page with MANY items and a pagination control?
```

**1c. Navigate to the deepest paginated content.** Go to the page with the most items at the lowest level of the hierarchy. If < 20 items or no pagination control, find a busier page.

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

**If 0 new entries:** Try a busier page, a different control, or scroll (`window.scrollTo(0, document.body.scrollHeight)`). If no page produces XHR pagination, the site uses embedded data — note this.

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
