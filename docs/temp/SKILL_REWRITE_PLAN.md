# Plan: Rewrite Skills Using Anthropic Best Practices, Then Iterate

## Context

The product is skills + framework. We validate by attempting developer prompts on a test branch, returning to base to fix gaps. Before starting iteration, we need to rewrite our skills following Anthropic's official best practices.

## Anthropic Skill Best Practices (from official docs + engineering blog)

Key principles to apply to all our skills:

1. **Progressive disclosure**: SKILL.md is the overview (under 500 lines). Move detailed reference material to separate files (`reference.md`, `examples/`, `scripts/`). Reference them from SKILL.md so Claude loads only when needed.

2. **Description is critical**: The `description` field determines when Claude triggers the skill. Be "pushy" — explicitly list trigger terms. Bad: "API discovery tool." Good: "Discover any website's API, create domain plugins, and expose proxy routes. Use when the user wants to create an API for a website, reverse-engineer a web service, or build typed clients."

3. **Imperative form**: Write verb-first instructions ("Create the directory", "Run the command"), not second person ("You should create").

4. **Supporting files**: Templates for Claude to fill in, example outputs, scripts Claude can execute. Our skills should include:
   - `templates/` — skeleton files Claude copies and fills in (domain package.json, config.ts, etc.)
   - `examples/` — real outputs from previous runs (the Ticketmaster domain as reference)
   - `scripts/` — helper scripts for deterministic operations

5. **Code as documentation AND execution**: Bundle scripts that Claude runs directly for deterministic steps (scaffolding, codegen, traffic analysis) rather than generating code from scratch each time.

6. **Test and iterate**: Run the skill on representative tasks, observe where it struggles, ask Claude to capture successful approaches into the skill.

7. **`$ARGUMENTS` and `${CLAUDE_SKILL_DIR}`**: Use string substitutions. `$ARGUMENTS` for what the user passes, `${CLAUDE_SKILL_DIR}` for referencing bundled files.

## Step 1: Prepare Base Branch

1. Create `base` branch from current `main`
2. Keep example domains in `domains/` as reference patterns
3. Verify `pnpm run dev` + CI pass
4. Push `base`

## Step 2: Rewrite Skills on Base

### api-discovery skill (primary)

Restructure to:
```
.claude/skills/api-discovery/
├── SKILL.md                    # Overview + when to trigger (under 500 lines)
├── templates/
│   ├── domain-package.json     # Template: package.json for new domain
│   ├── domain-config.ts        # Template: InterceptorConfig
│   ├── domain-interceptor.ts   # Template: GenericInterceptor subclass
│   ├── domain-routes.ts        # Template: DomainRoute[]
│   └── domain-index.ts         # Template: DomainPlugin export
├── reference/
│   └── architecture.md         # Detailed architecture docs (loaded on demand)
└── scripts/
    └── scaffold-domain.sh      # Script: create domain package from template
```

SKILL.md should cover:
- When to trigger (description field — be pushy)
- Quick decision: does a domain plugin exist? If yes, use it. If no, create it.
- Step-by-step: connect browser → capture traffic → extract routes → scaffold domain → register → test
- How to read traffic and decide which endpoints are API vs noise
- How to register in apps/api/src/register-domains.ts

### visual-dev skill

Update for current architecture. Add:
- How to build new dashboard pages (not just test existing ones)
- Templates for Next.js page components that consume proxy APIs
- shadcn/ui component patterns already in the project

### systematic-testing skill

Update for current architecture. Add:
- How to test domain plugins
- How to test proxy routes
- Layer-by-layer: domain → handler → proxy → API server → dashboard

### debug-logs skill

Update for current architecture. Minor changes — mostly path updates.

### NEW: dashboard-builder skill (maybe)

Could be part of visual-dev or a separate skill. Handles:
- Creating new Next.js pages in apps/web/
- Building search → results → detail views
- Consuming proxy API endpoints
- Composing data from multiple domains

## Step 3: Branch and Test

1. Branch `test/ticket-comparison` from `base`
2. Give Claude the Prompt 1 (ticket comparison)
3. Let skills guide the work
4. Document every gap → return to base → fix → try again

## Files to Create/Modify

| File | Action |
|------|--------|
| `.claude/skills/api-discovery/SKILL.md` | Rewrite following best practices |
| `.claude/skills/api-discovery/templates/*` | NEW — domain scaffolding templates |
| `.claude/skills/api-discovery/scripts/*` | NEW — scaffold-domain.sh |
| `.claude/skills/api-discovery/reference/*` | NEW — architecture docs |
| `.claude/skills/visual-dev/SKILL.md` | Update for current architecture |
| `.claude/skills/systematic-testing/SKILL.md` | Update for current architecture |
| `.claude/skills/debug-logs/SKILL.md` | Update paths |

## Verification

1. All skills follow Anthropic best practices (progressive disclosure, supporting files, imperative form)
2. `pnpm run dev` + CI pass on base
3. Test branch gets further through Prompt 1 with each iteration
