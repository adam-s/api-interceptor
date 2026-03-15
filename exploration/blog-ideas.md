# Blog Ideas

Ideas that haven't been assigned to an exploration yet. Blog posts are written about real problems discovered during implementation — not tutorials. See `docs/blog/ideas/` for the full catalog of 69 ideas extracted from Volatio.

## Ready Now

### The Healthcheck Fork Bomb

A Docker HEALTHCHECK that imports your application's entry point doesn't check health — it starts a second copy of your application. Every 30 seconds. Until the container runs out of memory. Standalone expansion of the war story sidebar in 02_docker.

## Blocked — Waiting for Future Explorations

These ideas come from real Volatio problems. They become blog posts when their prerequisites exist in this monorepo.

| Idea | Title | Blocked On |
|------|-------|------------|
| #12 | Lazy Init / Import Broke CI | Database + shared packages with side effects |
| #21 | ~~SSE + networkidle tests never finish~~ | ~~Next.js + SSE~~ + Playwright |
| #4 | E2E Tests 2.6min to 20s | Playwright + auth |
| #22 | Synthetic Dev Environment | DataProvider + seeded PRNG |
| #25 | E2E Tests as Architecture Docs | Multiple refactors with E2E suite |
| #8 | Seventeen Commits to Log In | ~~Next.js~~ + NextAuth + reverse proxy |
| #2 | Zod 3 to Zod 4 Migration | ~~Next.js~~ + react-hook-form |
| #11 | Your Healthcheck Is a Fork Bomb | Already unblocked (see above) |

## Completed

- ~~**Teaching an AI Where to Look**~~ — Exploration 09: DEBUG() logging, Claude Code skills, a planted bug diagnosed in 30 seconds via structured domain context. Overreacted style.
- ~~**The Connection That Never Closes**~~ — Exploration 08: SSE bugs from production (networkidle, flashing, ECONNRESET, race conditions, CORS). Overreacted style.
- ~~**Claude Code as a Development Partner**~~ — Split into explorations 03, 04, and 05:
  - **03 — Catch It Before You Push** (Overreacted)
  - **04 — A Complete Guide to the .claude Directory** (CSS-Tricks)
  - **05 — What Your Editor Should Remember** (A List Apart)
