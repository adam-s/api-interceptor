# Catch It Before You Push

I used to push a branch and wait.

The loop looked like this: write code, push, open GitHub, wait for the Actions run to finish, scroll past 200 lines of pnpm install output to find the one TypeScript error, fix it, push again, wait again. Each cycle took three to five minutes. Most of that time was navigation, not thinking.

The fix was embarrassingly obvious. My CI pipeline runs four commands: `pnpm install --frozen-lockfile`, `pnpm turbo build`, `pnpm turbo typecheck`, and `docker build`. There's nothing remote about any of them. They don't need GitHub's servers. They don't need a runner image. They run on my laptop in under a minute.

So I put them in a script.

```bash
#!/usr/bin/env bash
set -euo pipefail

step "Install (frozen-lockfile)"
pnpm install --frozen-lockfile || fail "Install"

step "Build"
pnpm turbo build || fail "Build"

step "Typecheck"
pnpm turbo typecheck || fail "Typecheck"

step "Docker build"
docker build -f apps/api/Dockerfile . || fail "Docker build"
```

That's the core of `scripts/ci-local.sh`. There's some color formatting around it — green checkmarks, red failures — but the logic is just "run the same steps in the same order and stop at the first failure." Thirty lines, total.

```
→ Install (frozen-lockfile)
✓ Install
→ Build
✓ Build
→ Typecheck
✓ Typecheck
→ Docker build
✓ Docker build

✓ All checks passed.
```

If everything passes locally, it almost certainly passes remotely. The "almost" matters — sometimes the lockfile is in sync on my machine but stale in the repo, or a Docker layer cache hides a missing COPY — but those failures are rare and diagnostic. The common case, the TypeScript error I introduced three files ago, gets caught immediately.

---

I added a `--quick` flag that skips the docker build. When I'm iterating on a type error, I don't need to rebuild a container every cycle. I need to know if `tsc` is happy. The docker build runs once at the end, when everything else passes.

The real change happened when I wired this into Claude Code.

Claude Code has a feature called skills — markdown files that describe a workflow in imperative steps. You invoke them with a slash command. I wrote one called `/ci-check` that does five things:

First, it runs `./scripts/ci-local.sh`. If something fails locally, it fixes the error before anything touches GitHub. Most cycles end here.

Second, if the branch has been pushed, it checks remote CI with `gh run list --branch $(git branch --show-current) --limit 1`. This tells me whether a run exists, whether it's in progress, and whether it passed.

Third — and this is the command that changed everything — if the run failed, it reads the failure with `gh run view <id> --log-failed`. Not `--log`, which dumps every step including 200 lines of successful installs. `--log-failed` returns only the output from the steps that broke. That's the command I wish I'd known about six months ago.

Fourth, the skill maps the failure to a fix:

| Failed step | What happened | Fix |
|---|---|---|
| `pnpm install --frozen-lockfile` | Lockfile out of sync | `pnpm install`, commit lockfile |
| `pnpm turbo build` | TypeScript compilation error | Find the file, fix the type, rebuild |
| `pnpm turbo typecheck` | Type error without build | Same — find and fix |
| `docker build` | Dockerfile issue | Missing COPY, changed package name |

Fifth, it pushes and checks again. The loop repeats until CI is green.

---

The whole thing is a skill file — sixty lines of markdown that Claude Code follows like a recipe. I type `/ci-check` and the editor runs local CI, reads the remote status, diagnoses failures, fixes them, and pushes. I watch.

The cycle went from "push, wait, scroll, find the error, fix, push, wait" to "type nine characters." The same four checks run in the same order. The difference is where they run first.

In a larger project — a monorepo with Python workers, E2E tests, and a TimescaleDB database — I watched this pattern grow. The local CI script gained `--e2e-only` and `--no-python` flags. A Makefile wrapped it with `make ci` and `make ci-quick`. Husky pre-commit hooks ran the quick version automatically. The core stayed the same: mirror CI locally, diagnose remotely with `gh --log-failed`, fix before pushing.

I should have written this script on day one of every project I've ever worked on. The pattern is obvious in retrospect. Most good patterns are.

*Last updated: February 2026.*
