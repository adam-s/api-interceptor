# Framework Roadmap

## The Goal

A developer clones this repo, pastes a prompt like "compare ticket prices across StubHub and Ticketmaster," and Claude Code uses the skills to discover each site's API, create typed domain plugins, build a working dashboard, and wire everything together — without any manual intervention beyond the initial prompt. The skills are the product. The test prompts are the proof.

---

## The Iteration Loop

```text
base branch
  └─ develop/improve generalized skills and utilities (no domain-specific content)

test branch (from base)
  └─ paste a developer prompt
  └─ Claude attempts to execute using only the skills
  └─ observe every point where Claude gets stuck, goes wrong, or commits bad code
  └─ record failures in "Observed Failures Log" below

return to base
  └─ strip all domain artifacts the test created:
       • routes, UI pages, nav registrations, package.json deps
       • browser profiles for removed domains: rm -rf data/browser-profiles/<domain>
       • test scripts and screenshots: rm -rf test-results/dev-screenshots/
  └─ START WITH A PLAN — call EnterPlanMode before touching any skill or utility code
  └─ fix the skills/utilities based on observed failures
  └─ nothing domain-specific — every fix must generalize
  └─ repeat
```

A prompt is "solved" when Claude can execute it end-to-end from a cold start with no corrections.

---

## Checkpoint Branches

Every developer prompt has natural phases — API discovery comes before UI, UI before polish. Once a phase is reliably solved (verified with curl or screenshots), save that state as a **checkpoint branch**. Future iterations on the next phase branch from the checkpoint instead of base, so solved work is never re-done.

### How it works

```text
base
  └─ test/ticket-l1-v1  (Phase 1: API discovery — fails)
     fix api-discovery skill on base, repeat
  └─ test/ticket-l1-v2  (Phase 1: API discovery — verified with curl ✓)
     └─ promote → checkpoint/ticket-l1-apis   ← frozen, never commit to directly

checkpoint/ticket-l1-apis
  └─ test/ticket-l2-v1  (Phase 2: dashboard UI — fails)
     fix dashboard-builder skill on base, repeat
  └─ test/ticket-l2-v2  (Phase 2: dashboard — screenshot confirmed ✓)
     └─ promote → checkpoint/ticket-l2-ui

checkpoint/ticket-l2-ui
  └─ test/ticket-l3-v1  (Phase 3: polish, edge cases, all 4 sites)
```

When a later phase fails: fix the skill on `base`, then re-branch from the **checkpoint** (not base) to retry. The checkpoint preserves the work that doesn't need to be repeated.

### Rules

- Only promote to checkpoint when the phase is **fully verified** — curl returns real data, screenshots confirm the UI renders real content
- Checkpoints are frozen starting points. Never commit directly to a checkpoint branch.
- Skills are always fixed on `base`. Checkpoints hold verified domain-specific state for one phase.
- Checkpoint names: `checkpoint/<prompt-id>-l<n>-<label>` e.g. `checkpoint/ticket-l1-apis`

### Why this matters

API discovery requires live browsers, real navigation, and curl verification — it takes time. Once that phase is saved in a checkpoint, every subsequent UI or polish iteration starts with working APIs already in place. This makes Phase 2 and 3 iterations dramatically faster, and isolates which skill needs fixing when something breaks.

### Phases for Prompt 1 (ticket comparison)

| Phase | Checkpoint name | Done when |
|-------|----------------|-----------|
| 1: API discovery | `checkpoint/ticket-l1-apis` | ≥2 sites return real search + listings JSON from curl |
| 2: Dashboard UI | `checkpoint/ticket-l2-ui` | /tickets screenshot shows real events + comparison grid |
| 3: Full prompt | (solved — no checkpoint needed) | All 4 sites handled, dynamic search, visual polish complete |

### Phases for Prompt 2 (market intelligence)

| Phase | Checkpoint name | Done when |
|-------|----------------|-----------|
| 1: News pipeline | `checkpoint/market-l1-news` | `curl /api/yahoo-finance/news?symbols=TSLA` returns articles with sentiment labels |
| 2: Quote routes | `checkpoint/market-l2-quotes` | `curl /api/yahoo-finance/quote/TSLA` returns live price + key stats |
| 3: Dashboard + live updates | `checkpoint/market-l3-ui` | `/market` shows news cards auto-refreshing every 60s |
| 4: SSE streaming (stretch) | (solved — no checkpoint needed) | Quote card updates every 5s via SSE without client-side polling |

---

## Code: What Needs to Change

### The Problem

The interceptor is tightly coupled to Robinhood. Adding a second domain today requires copying ~1,500 lines of code and modifying hardcoded URLs, header names, profile names, and selectors throughout.

### The Three Coupling Hotspots

| File | Problem |
|------|---------|
| `apps/api/src/browser.ts` | Hardcodes `'robinhood-trading'` profile, `RobinhoodInterceptor`, `RobinhoodApiClient.verify()`, `RobinhoodSessionManager` |
| `packages/browser/src/robinhood/interceptor.ts` | Hardcodes `api.robinhood.com` URL patterns and `REQUIRED_HEADER_NAMES` |
| `packages/browser/src/robinhood/auth.ts` | Hardcodes `https://robinhood.com/login`, profile name, and `[data-testid="account-number"]` selector |

Everything else (`mcp/server.ts`, traffic buffer, session manager pattern) is already generic or close to it.

### Target Architecture

```text
packages/browser/src/shared/          ← NEW: generic base classes
  config.ts                           ← InterceptorConfig interface
  interceptor.ts                      ← GenericInterceptor (abstract)
  auth.ts                             ← GenericAuthService (abstract)
  session-manager.ts                  ← GenericSessionManager (concrete, profile-aware)
  api-client.ts                       ← GenericApiClient (abstract)
  schema-generator.ts                 ← Infer Zod schemas from captured traffic
  codegen.ts                          ← Generate TypeScript types + client skeleton

packages/browser/src/robinhood/       ← Refactored to extend shared/
  config.ts                           ← NEW: Robinhood-specific InterceptorConfig
  interceptor.ts                      ← Extends GenericInterceptor
  auth.ts                             ← Extends GenericAuthService
  (api-client.ts, types.ts unchanged) ← Domain-specific, kept as-is

domains/<name>/                       ← Each domain plugin (200 LOC, config + routes)
  config.ts
  interceptor.ts
  routes.ts
  index.ts
```

Adding a new domain after refactoring: create one `config.ts` (30 lines), run schema generator on captured traffic, review generated types. ~30 minutes instead of 8 hours.

### Phase Roadmap

1. **Extract shared base classes** — `GenericInterceptor`, `GenericAuthService`, `GenericSessionManager`, `InterceptorConfig`
2. **Refactor Robinhood** to extend shared (no behavior change, just inheritance)
3. **Refactor `browser.ts`** — replace hardcoded Robinhood logic with domain registry (`DOMAIN_CONFIGS` map)
4. **Generic traffic capture** — `domains/generic/` with no domain assumptions
5. **Schema generation** — analyze captured traffic → infer Zod schemas → generate `types.ts` + `api-client.ts`
6. **Proof of concept** — add a second real domain (LinkedIn or similar) using the generic system

---

## Skills: What Needs to Change

### Anthropic Best Practices to Apply

- **Progressive disclosure**: SKILL.md is the overview (under 500 lines). Move detailed reference to `reference/`, templates to `templates/`, helper scripts to `scripts/`.
- **Pushy descriptions**: The `description` frontmatter determines when Claude triggers the skill. Be explicit. Bad: "API discovery tool." Good: "Discover any website's API... Use when the user mentions a website name and wants to interact with it programmatically."
- **Imperative form**: "Create the file" not "You should create the file."
- **Supporting files**: Templates Claude fills in, example outputs, scripts Claude runs directly for deterministic steps.
- **`$ARGUMENTS` and `${CLAUDE_SKILL_DIR}`**: Use substitutions so skills are portable.

### Structural Changes

Current skills are flat. Skills should be hierarchical:

```text
api-discovery/
  SKILL.md              ← overview + quick start (≤300 lines)
  reference/
    architecture.md     ← detailed architecture (loaded on demand)
  templates/
    domain-package.json
    domain-config.ts
    domain-routes.ts
    domain-index.ts
  scripts/
    scaffold-domain.sh  ← deterministic scaffolding, Claude runs this

visual-dev/
  SKILL.md              ← overview + screenshot loop
  reference/
    components.md       ← shadcn/ui component reference (moved out of SKILL.md)

plan/
  SKILL.md              ← NEW: planning phase guide (explore → design → plan → approve)
```

### Specific Gaps Observed

See "Observed Failures Log" below — each iteration adds to this list.

---

## Observed Failures Log

### Prompt 3 (Vacation Rental Intelligence): `test/rental-v1`

**Bot detection encountered:**

| Site | Challenge type | Blocks headless? | Fix |
| --- | --- | --- | --- |
| Zillow | Cloudflare Turnstile — "Press & Hold" (~1-2s hold) | Yes — fresh session has no history | Pre-warm: `/browser?profile=zillow&capture=zillow.com`, pass the hold once, profile persists |
| Airbnb | Bot detection on fresh session | Yes | Same — persistent profile needed |
| VRBO | Bot detection on fresh session | Yes | Same |

**"Press & Hold" Turnstile specifics (Zillow):**

- Challenge: `zillow.com` → Cloudflare Turnstile with a "Press & Hold to confirm you are a human" button
- Reference ID format: `32dd5f29-219c-11f1-b9a4-61c50bee7ad3`
- Requires: real `mousedown` held for ~1-2 seconds, then `mouseup` — not a click
- Browser page fix applied: `remote-viewer.tsx` now sends `mousedown`/`mouseup` separately; `RemoteBrowserService` has `mouseDown()`/`mouseUp()` methods; WS handler routes both message types
- **To pass manually**: navigate to `/browser?profile=zillow&capture=zillow.com` → navigate to `https://zillow.com` → press and hold the "Press & Hold" button in the browser canvas → profile cookie is saved for future headless runs

**Framework gap:** No SMS bridge — Airbnb/VRBO require phone verification to create an account. Disposable email (minuteinbox domain) gets through email verification but is blocked at phone step.

---

### Iteration 3 — Prompt 1 (ticket comparison): `test/ticket-comparison`

**What was attempted:** Discovery for StubHub, Ticketmaster, SeatGeek, TicketNetwork. Phase B5 gate + UI not reached.

**What was delivered:**

- StubHub ✓ — 4 routes working: search (SSR/performer cards), performer-events, listings (data-listing-id + innerText), trending
- Ticketmaster ✓ — 2 routes working: search (SSR/event cards), tickets (traffic capture for ISMDS API)
- SeatGeek ✗ — DataDome captcha on all pages; routes return `{ blocked: true }`
- TicketNetwork — API at `tn-apis.com/catalog/v2/events/search?consumerKey=fuTwxN_M6RKMaobcsfJ5qSvcVAUa` discovered in CDP traffic; routes not written (iteration stopped before UI gate)

**Failures observed:**

| # | Failure | Root cause | Fix applied to base |
| --- | --- | --- | --- |
| 1 | `browserFetch(cross-origin-url)` returned empty | browserFetch navigates to target origin first, loses session cookies | Added `⚠️ browserFetch cross-origin warning` to skill |
| 2 | `page.evaluate(fetch(cors-url))` → "TypeError: Failed to fetch" | CORS rejects manual fetch from different origin | Added Type B2 traffic capture pattern to skill |
| 3 | `textContent` gave `"Section 235Row 7"` (no space) | `textContent` concatenates child text nodes without separators | Added `innerText` vs `textContent` guidance to skill |
| 4 | Performer name included `"Concert Tickets • 29 events"` | `.*` doesn't cross newlines; `innerText` adds `\n` between blocks | Added `[\s\S]*` vs `.*` note to Gotchas |
| 5 | Quantity regex returned null for "2 tickets together" | `$` end anchor fails when more text follows | Fixed regex to use `(?:\s\|$)` in Gotchas |
| 6 | TM eventId regex captured `09006463` from `09006463FB941AC4` | Alphanumeric IDs need `[A-Z0-9]+` not `\d+` | Added to Gotchas |
| 7 | Server returned old routes after editing `routes.ts` | Server started before file change; no auto-reload without `--watch` | Added "Route returns 404 after editing" to Gotchas |
| 8 | SeatGeek body empty after navigate | DataDome replaced body with captcha iframe | Added Type D detection via `bodyInnerHTML.includes('captcha-delivery.com')` |

**What the skills still need for Prompt 1 to be fully solved:**

- TicketNetwork routes not written — need to finalize `targetUrl` routes using discovered consumerKey
- UI not built — `dashboard-builder` skill untested on multi-domain offline-graceful comparison grid
- SeatGeek permanently offline — UI should show graceful degraded state, not break

---

### Iteration 7 — Prompt 6 (Government & Public Records Monitor): `test/gov-records-v1`

**What was attempted:** Create domains for SEC EDGAR, state business registry, county property records, and PACER. Search by company name, aggregate filings and court cases. Build a due diligence dashboard with timeline.

**What was delivered:** Fully working end-to-end. SEC EDGAR (public REST API) and CourtListener (free PACER alternative) both use `browserRequired: false`. Dashboard shows company info panel, timeline of all activity, and tabbed views.

**Key discoveries:**
- PACER requires paid account + CAPTCHA. CourtListener (courtlistener.com) is a free, open-source alternative that mirrors PACER data.
- SEC EDGAR requires a descriptive User-Agent with contact email. Requests without it get 403.
- OpenCorporates API timed out on test -- dropped.
- Timeline view pattern: map multiple source events to `{ date, type, title, subtitle, source, link }`, sort descending. Visual: vertical line with colored dots.

**No failures requiring test branch reruns.** Second consecutive prompt solved on v1.

---

### Iteration 6 — Prompt 5 (Academic Research Aggregator): `test/academic-v1`

**What was attempted:** Create domains for PubMed, Semantic Scholar, and ArXiv. Search for a research topic, collect papers with citations and abstracts. Deduplicate papers across databases. Build a literature review dashboard.

**What was delivered:** Fully working end-to-end. All three domains created with public REST APIs (zero browser dependency). Dashboard with cross-database search, DOI dedup, citation network, and "Most Influential Papers" panel.

**Key discovery:** All three domains (ArXiv, Semantic Scholar, PubMed) have documented public REST APIs. The api-discovery skill had NO guidance for this case — it assumed browser interception was always needed. Added "Phase 0: Check for a Public API" to the skill.

**Failures observed:**

| # | Failure | Root cause | Fix applied to base |
|---|---------|-----------|---------------------|
| 1 | api-discovery skill has no "public API" path | Skill always starts with browser + CDP | Added Phase 0 section with public API detection and `browserRequired: false` pattern |
| 2 | Semantic Scholar returns total:0 with 200 status under load | Soft rate limit — not a true empty result | Added gotcha row documenting this behavior |
| 3 | ArXiv and PubMed return XML, not JSON | No XML parsing guidance in skill | Added gotcha row referencing regex-based XML parsing |

**No failures requiring test branch reruns.** First prompt solved on v1 with no re-iterations needed.

---

### Iteration 2 — Prompt 1 (ticket comparison): `test/iteration-2`

**What was attempted:** Full Prompt 1 — discover APIs for StubHub, Ticketmaster, SeatGeek, TicketNetwork; build /tickets dashboard.

**What was delivered:** StubHub listings only (one hardcoded event). No search. No cross-site comparison.

**Failures observed:**

| # | Failure | Root cause | Fix needed |
|---|---------|-----------|------------|
| 1 | Guessed wrong StubHub search URL (`/find/s/?q=`) → 404 | Skill says "navigate to target page" but doesn't say "use the site's own search box to find the correct URL" | Add step to api-discovery: "Navigate from homepage, use the site's native search, observe the resulting URL — do not guess URL formats" |
| 2 | SeatGeek completely blocked — DataDome CAPTCHA on first request | Skill has no guidance for CAPTCHA-protected sites | Add classification: "CAPTCHA-protected (Type D)" — skip headless discovery, note manual intervention required |
| 3 | StubHub + Ticketmaster search results are SSR HTML, not JSON | The skill describes SSR extraction but the DomainRoute proxy just returns raw HTML — no server-side parsing mechanism | Add SSR-to-JSON transformer support to DomainRoute OR add guidance that SSR sites require a custom handler, not a simple proxy route |
| 4 | Ticketmaster event links point to `.es` (Spanish) domain when browser geo-detected Spain | No awareness that TM geolocks to regional subdomains | Note in skill: "check the domain of returned event URLs — if they differ from the site root, the proxy must target the regional domain" |
| 5 | Scaffold script created incomplete domain (only `src/routes.ts`) — missing `package.json`, `config.ts`, `interceptor.ts`, `index.ts` | `scaffold-domain.sh` template is incomplete | Fix scaffold script to create all required files from ticketmaster template |
| 6 | Browser must be connected before proxy works — no skill step for this | visual-dev skill takes screenshots without connecting the proxy browser first | Add "dual-browser pattern" as explicit prerequisite in both api-discovery and visual-dev: connect proxy browser before running any proxy verification or screenshots |
| 7 | TicketNetwork had no domain or browser profile — scaffold + discover would need to start from zero | No guidance on starting from a completely new domain | Add to api-discovery: "create browser profile first with `mkdir -p data/browser-profiles/<domain>`" |

**What the skills need to support to solve this prompt:**
- A way to handle SSR sites that return HTML (server-side HTML→JSON transformer in proxy)
- CAPTCHA detection and fallback strategy
- URL discovery from homepage (not guessing)
- Regional domain detection
- Complete domain scaffold (all 5 files)
- Browser connection prerequisite check before proxy verification

---

### Iteration 1 — Prompt 1 (ticket comparison): `test/ticket-v1`, `test/ticket-v2`, `test/ticket-v3`

**What was attempted:** Build a ticket price comparison dashboard for StubHub and Ticketmaster.

**Failures observed:**

| Failure | Root cause | Fix needed in base |
|---------|-----------|-------------------|
| Claude committed code that didn't work | `CLAUDE.md` said "Always run before committing" + ci-check skill said "Use before committing" — normalized commits as expected | Add explicit "NEVER commit unless asked" to `CLAUDE.md` |
| Claude jumped straight to code, no alignment | No planning mandate | Add `EnterPlanMode` requirement to `CLAUDE.md`; create `plan` skill |
| Screenshots showed blank ticket cards | Proxy browser (port 3001) was not connected when screenshot browser visited `localhost:3000/tickets` | Add "dual-browser pattern" to `visual-dev` skill: proxy browser must be alive before screenshot browser makes API calls |
| Ticketmaster side always empty | `tickets-content.tsx` called `/api/ticketmaster/trending/searches` (wrong endpoint) but skill had no guidance on verifying API returns the right data type before building UI | Add "verify API returns expected data shape before writing UI" step to `dashboard-builder` skill |
| Repeated failed iterations without progress | No honest verification gate — Claude would "fix" something, not verify, then commit | Add verification requirement to skill: "prove it works with curl/screenshot before moving on" |
| StubHub route hardcoded to one event | Routes were scaffolded with example values and never updated to be dynamic | Scaffold templates should use `{paramName}` substitutions and document that example values must be replaced |
