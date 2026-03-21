# Instruction Tuning Handoff

## Current Iteration: 12 (next)

## Iteration 9-11 Results

### Iter 11 (latest — best transport coverage, no proxy testing)

| Agent | Tokens | Tools | Routes | Transports |
|-------|--------|-------|--------|------------|
| Twitch | 62K | 81 | 8 | GraphQL + HLS + WS IRC |
| YouTube | 65K | 80 | 6 | Embedded + InnerTube + JSONP + RSS + Captions |
| Ticketmaster | 67K | 70 | 8 | Embedded JSON (__NEXT_DATA__) |
| StubHub | 67K | 101 | 4 | Embedded JSON |
| Hacker News | 69K | 74 | 11 | SSR HTML + Firebase API + Algolia + RSS |
| Airbnb | 73K | 104 | 4 | Embedded JSON (deferred-state) |

Average: 67K tokens. 100% elimination table completion.

### Progression

| Metric | Iter 8 | Iter 9 | Iter 10 | Iter 11 |
|--------|--------|--------|---------|---------|
| Avg tokens | 111K | 61K | 62K | 67K |
| Avg tools | ~100+ | 63 | 69 | 85 |
| Transport coverage | Good | Good | Better | Best |
| Proxy tested | No | No | No | No |
| Browser capture | Some | Few | Few | Few |

## CRITICAL: Stale Context Problem

Compaction does NOT clear stale `.claude/` file contents from system-reminders. Subagents inherit OLD versions of CLAUDE.md and discovery-agent.md from the parent session's compressed context.

**Evidence:** All 6 iter 11 agents refused to modify `register-domains.ts` or run `pnpm install`, citing rules that were REMOVED two commits ago. Twitch and StubHub explicitly quoted the old rule.

**Fix:** Start a FRESH Claude Code session. The new session reads `.claude/` files from disk, giving subagents the current instructions.

## Changes Made This Session

### Commits (all on main)

1. `1a701d3` — fix: require browser capture in worktree agents
2. `be3e3b9` — fix: require pnpm install, domain registration, and proxy testing in worktrees
3. `e3e5ae3` — fix: add crash/retry/regression policy and update convergence criteria

### Key instruction changes

- **discovery-agent.md**: pnpm install once, register domain in worktree's register-domains.ts, test through proxy, 150 tool budget, mandatory browser capture
- **CLAUDE.md**: removed bans on pnpm install and register-domains.ts for worktree agents
- **SKILL.md**: crash/retry/regression policy, proxy testing in scorecard, 150 tool budget
- **cleanup-agents.sh**: clean tmp files between iterations

## Test Sites and Ports

| Site | Port | Transport focus |
|------|------|----------------|
| ticketmaster.com | 3011 | Next.js __NEXT_DATA__ |
| stubhub.com | 3012 | Embedded JSON + WAF |
| airbnb.com | 3013 | Deferred state |
| twitch.tv | 3015 | GraphQL + HLS + WS IRC |
| youtube.com | 3016 | Embedded + InnerTube + JSONP + RSS + Captions |
| news.ycombinator.com | 3017 | SSR HTML + Firebase + Algolia + RSS |

Yahoo Finance excluded from fast iterations (consistently slowest, 126K+ tokens). Run separately after instructions converge.

## Known Issues

1. **Stale context** — MUST start fresh session. Compaction doesn't fix it.
2. **No proxy testing** — agents write TypeScript route code that is never compiled or executed. Fresh session with updated instructions should fix this.
3. **Browser capture spotty** — some agents skip Steps 1d/1e. Updated instructions are stronger but need fresh session.
4. **file-history cache** — 79 old file versions in `~/.claude/file-history/` contain stale references. Not deletable (managed by Claude Code).

## What's Next

1. **Start fresh Claude Code session** (clears stale system-reminders — THIS IS MANDATORY)
2. `bash .claude/hooks/cleanup-agents.sh`
3. Launch 6 agents (no Yahoo Finance)
4. **KEY CHECK**: Do agents run `pnpm install`, edit `register-domains.ts`, and test through `localhost:PORT/api/domain/route`?
5. If proxy testing works, verify routes actually compile and execute
6. If proxy testing still fails, the instruction wording needs strengthening
