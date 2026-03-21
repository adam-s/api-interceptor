---
name: app
description: Build a complete application from a short description. Asks the developer clarifying questions, generates data requirements, launches discovery agents, and builds a dashboard. Use when the developer describes what they want to build in plain language — "compare tickets", "track prices", "search jobs across sites".
---

# App Builder

Turn a plain-language description into a working application with domain plugins and dashboard UI.

The developer says WHAT. This skill figures out HOW.

## Phase 1: Understand

Read the developer's request. Then ask **exactly these questions** (skip any the request already answers):

### Sites
> Which websites should I pull data from?

### Data
> What specific data do you need from each site?
> Examples: "all ticket listings with section, row, price" / "job postings with salary" / "product prices"

### Completeness
> Do you need ALL results (full pagination) or just the first page?
> This matters because most sites show 20-50 results initially and load more via XHR. Getting everything takes more work but gives you complete data.

### Matching
> How should I match the same entity across sites?
> Examples: "by venue + date" / "by job title + company" / "by product name"

### View
> What should the dashboard show?
> Examples: "side-by-side price comparison" / "merged list sorted by price" / "timeline of changes"

### Route
> What URL path for the dashboard? (default: based on the domain name)

**Do not proceed until the developer answers.** Their answers become the data requirements spec.

## Phase 2: Spec

Write a data requirements file at `prompts/.app-spec.md` (gitignored, temporary). Format:

```markdown
# App Spec: [name]

## Sites
- site1.com
- site2.com

## Data Requirements
For each site, what data flows are needed:

### site1.com
- Search: GET /search?q= → results[] with [fields]
- Detail: GET /detail/:id → full listing with [fields]
- Pagination: first page is SSR embedded JSON, pages 2+ are XHR to /api/search?page=N
- Complete: YES — must follow pagination to get all results

### site2.com
- [same structure]

## Matching
Match across sites by: [compound key]
Normalize: [what to normalize]

## Dashboard
Path: /[route]
Layout: [description]
Key interaction: [what the user does]
```

## Phase 3: Discovery

Create a branch: `app/[name]`

Launch one discovery agent per site with worktree isolation. **Include the data requirements in the agent prompt.** The standard discovery prompt plus:

```
DATA REQUIREMENTS:
After discovering transports, build routes that satisfy these requirements:
[paste the site-specific section from the spec]

COMPLETENESS:
If the data is paginated (first page in SSR, more pages via XHR), build a route
that returns ALL pages, not just the first. Follow the pagination XHR pattern
found in browser traffic or JS bundles. The route should accept ?page=N or
return all results in one call.

Build routes for ALL discovered transports (standard discovery protocol),
AND ensure the data requirements above are fully covered.
```

Wait for agents to complete. Copy their domain plugins from worktrees into the branch. Register domains, install deps, verify routes with curl.

## Phase 4: Dashboard

Use the `dashboard-builder` skill patterns to build the page. Key requirements from the spec:

- Multi-source entity merging using the matching key from Phase 2
- Sequential fetches with progress narration (singleton browser)
- Per-platform loading/error states
- The specific view the developer requested

Use `debug-logs` skill when data isn't flowing correctly — add targeted DEBUG logs at each layer (route handler → API fetch → response parse → component render), read the output, narrow the problem, fix, clean up.

Use `visual-dev` skill for every UI iteration — screenshot after each change, read the screenshot, fix what's wrong, re-screenshot until correct. Don't build multiple components blind then debug them all at once.

## Phase 5: Verify

Use `systematic-testing` skill to validate bottom-up: route handlers → proxy endpoints → dashboard fetches → rendered UI. Each layer must pass before testing the next.

1. Start `pnpm dev`
2. Curl every API route — confirm real data with `debug-logs` if anything returns empty or errors
3. Use `visual-dev` to screenshot the dashboard in every state: empty, loading, populated, error, mobile (375px)
4. Walk the full user journey via Patchright: search → results → detail → compare
5. Test with 3 different inputs that exercise different data shapes
6. Show the developer screenshots and route outputs

**Only hand off when verified working on localhost:3000.**

## Rules

- Never add use-case bias to the discovery prompt beyond the data requirements section. The agent should still discover ALL transports — the data requirements are additive, not restrictive.
- If a site requires browser session for pricing/listings, say so explicitly in the handoff. Don't hide limitations.
- The spec file is temporary. The domain plugins and dashboard are the product.
