# What Your Editor Should Remember

A hospital's institutional knowledge doesn't live in its medical textbooks. It lives in the attending who knows that the elevator to radiology jams on Tuesdays, that Dr. Park reads MRIs faster if you include the clinical question in the order notes, that the fourth-floor supply closet has backup O2 sensors when the main stock runs out. None of this is published. None of it is searchable online. All of it makes the difference between a smooth shift and a slow one.

Software projects accumulate the same kind of knowledge. Not the documented kind — the kind that lives in one person's head until they leave, at which point the next person spends two weeks rediscovering it.

AI-assisted editors now have memory systems. The question isn't whether they should use them. The question is what belongs there. My thesis is simple: **AI memory should store truths that are expensive to rediscover and stable enough to be true next week.** Everything else is noise that degrades over time.

---

## How auto-memory works

Claude Code writes what it learns between sessions to a file called `MEMORY.md`, stored in `~/.claude/projects/<project-hash>/memory/`. The file persists across conversations. The next time you open a session, the editor reads it and starts with context from previous work.

Three constraints shape how this works.

First, the file lives outside the repo. It's in Claude Code's own project-specific storage, personal to each user. Your teammate has a different memory file, shaped by their own sessions. This isn't shared state — it's individual experience.

Second, there's a 200-line soft limit. After 200 lines, the system loads only the beginning. This isn't a bug. It's a forcing function.

Third, you can create topic files — `memory/auth-system.md`, `memory/debugging.md` — and link to them from MEMORY.md. The main file becomes an index. The topic files hold the depth.

---

## The case for saving

Not everything a developer knows deserves to be saved. But certain categories of knowledge pay for themselves every time the editor encounters them.

**Architecture decisions that eliminate wrong suggestions.** Say your monorepo API ships in a multi-stage Docker build where `turbo prune` creates a minimal workspace subset and the runner image contains only compiled JavaScript—no source code, no `node_modules`. One line in MEMORY.md — "Docker runner: Node Alpine, no node_modules. Shared packages compile into dist." — prevents the editor from adding install steps to the final image or suggesting packages that need glibc. One line, 200 lines of budget, and it earns its space a dozen times over.

**Operational traps that cost 30 minutes to rediscover.** Every project has at least one trap that's invisible until you hit it. A Docker HEALTHCHECK that imports the application entry point, starting a second copy of the app — workers, database connections, browser processes — every 30 seconds until the container runs out of memory. A Docker build that works locally but fails in CI because `turbo prune` doesn't include root-level config files. One memory entry:

> Docker build missing root configs. Add explicit COPY for `tsconfig.base.json` and `turbo.json` — `turbo prune` doesn't include them.

Two sentences. One trap defused permanently.

**Bug patterns with specific fixes.** The highest-value section of any MEMORY.md is a table like this:

| Issue | Solution |
|-------|----------|
| Hot reload stops picking up changes | Restart dev server; changes in shared packages don't trigger reload |
| HEALTHCHECK starts a second app instance | Never import the entry point; use `curl http://localhost/health` |
| Docker build fails but works locally | Root config missing from COPY (`tsconfig.base.json`, `turbo.json`) |
| Auth cookies rejected after deploy | `NODE_ENV` must be set at build time if the bundler inlines it |

**Test environment credentials.** The admin login for staging, the database password for dev. Stable enough to save, invisible in the source code, and expensive to hunt down every session. A line like "Dashboard login: `username` / `password`" means the editor can authenticate without asking. MEMORY.md lives outside the repo, so credentials never touch version control — but they are sent to the API as part of your session context. Use test credentials, not production secrets.

**Key file paths that prevent searching.** "Dockerfile at `apps/api/Dockerfile`, CI script at `scripts/ci-local.sh`" means the editor opens the right file immediately instead of grepping the project. In a monorepo, even a small one, this matters.

---

## The case against saving

Wrong memory is worse than no memory. An editor that "knows" something false will confidently apply it, and the resulting bug will be harder to find because you'll trust the tool's prior experience.

**Session context and speculative conclusions go stale immediately.** What you're debugging right now, the current branch, the failing test — all of this changes by next session. Worse, "I think the issue might be X" becomes "the issue is X" when written to memory — a hypothesis promoted to a fact by the simple act of persistence. If you wouldn't state it flatly after sleeping on it, don't save it.

**Frequently changing values mislead.** Package versions, current session IDs, deployment URLs. A memory entry that says "current session: abc123" will be wrong by next week. The editor will use that ID, hit an error, and spend time debugging a non-problem.

**Duplicates of CLAUDE.md waste the budget.** If the information is in the project instructions, it doesn't also need to be in memory. CLAUDE.md is loaded every session automatically. Duplicating it in MEMORY.md uses budget and risks the two copies drifting out of sync.

---

## The 200-line constraint

Two hundred lines sounds restrictive. For most projects, it's generous.

One of my project's MEMORY.md files, after five months of development, uses all 200 lines. It covers architecture overview, key file paths, authentication patterns, common issues, database access, and links to seven topic files. The topic files hold the depth — full architecture documents, deployment runbooks, detailed debugging guides. The index stays concise because the topic files carry the weight.

AI memory doesn't fade. That's both its advantage and its hazard. Every entry persists with equal weight until someone removes it. The 200-line limit is an artificial substitute for forgetting. It forces the question that natural memory answers automatically: is this worth remembering?

**If it took 20 minutes to figure out and won't change next week, save it. If it took 20 seconds or changes daily, don't.** The threshold isn't about importance. It's about the cost of rediscovery relative to the cost of storage. And storage, in a 200-line file, is finite.

The attending doesn't remember which elevator was broken last Tuesday. They remember that it breaks on Tuesdays. The pattern, not the instance. That's what your editor should remember too.

*Last updated: February 2026.*
