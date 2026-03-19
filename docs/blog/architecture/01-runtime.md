# We Chose Bun for Everything. Here's What Happened

I started a full-stack monorepo late last year. Hono API, Next.js dashboard, Python services, BullMQ jobs, TimescaleDB, Redis, Playwright browsers—all wired together with workspaces and Turborepo.

For the runtime and package manager, I picked Bun. It was fast. It ran TypeScript natively. It had workspaces. Cold installs in under four seconds versus 12 for pnpm. Why wouldn't you pick Bun?

---

The scaffold went fine. Bun installed dependencies, ran the dev server, executed scripts. Everything worked on my MacBook.

Then I tried to put it in a container.

---

`bun install` failed inside Docker. Workspace resolution couldn't find packages that existed three directories up. I adjusted the workspace config. Tried a different install order. Copied files into the build context differently. Restructured the multi-stage Dockerfile. Nothing worked. I spent about 40 minutes on it, each attempt a different theory for why Bun couldn't resolve its own workspaces inside a container. Eventually I found myself reading GitHub discussions titled ["Using workspaces in docker builds"](https://github.com/oven-sh/bun/discussions/12763) with replies from a year earlier and no resolution. I gave up and installed pnpm.

pnpm worked immediately.

Not "worked after some fiddling." Just worked. `pnpm install --frozen-lockfile` in a Docker build stage, on Linux x64, from a lockfile generated on macOS ARM64. Deterministic. Reproducible. Done.

I kept Bun as the runtime—`CMD ["bun", "run", "dist/index.js"]` in the final stage—because the API was already written against it and it was running fine. The plan was to come back later and evaluate whether to finish the migration. I never came back. Bun-for-runtime, pnpm-for-everything-else became the permanent architecture by default.

---

I moved on. More problems followed.

My `.env` file lives at the project root. Bun doesn't look there—it resolves `.env` from whatever directory you run the command from, which in a monorepo is usually a sub-package two or three levels deep. Your environment variables silently vanish. The workaround is passing `--env-file ../../.env` to every command. [Issue #11190](https://github.com/oven-sh/bun/issues/11190), open since May 2024.

Then the production API started rejecting every authenticated request with 401. It took a while to find because I couldn't SSH into the container—I had to add a diagnostic endpoint and redeploy just to see what was going on.

In Node, `process.env.NODE_ENV` is a runtime lookup—the value comes from whatever environment the process is running in. [Bun's bundler works differently.](https://github.com/oven-sh/bun/issues/11191) When you run `bun build`, it finds every reference to `process.env` in your code and replaces it with the literal value from the build environment. If `NODE_ENV` isn't set during the Docker build, Bun writes the string `'development'` directly into the compiled JavaScript. Not as a variable—as a hardcoded string.

Auth libraries like NextAuth use `NODE_ENV` to decide cookie names. Production cookies get a `__Secure-` prefix; development cookies don't. My app was deployed to production but the compiled code said `'development'`, so it was looking for a cookie name that didn't match what the browser had. Every login failed.

One line in the Dockerfile fixed it: `ENV NODE_ENV=production` in the build stage. But in Node you'd never think to do this—`process.env` is always a runtime lookup. Bun borrowed the inlining behavior from frontend bundlers like Vite and webpack, where it makes sense because browsers can't read environment variables. For server-side code, where your process has full access to its own environment, it's a trap.

If you've used `--hot` with Node, you know it watches your files and reloads when something changes. Bun's version of this would intermittently stop noticing changes, especially in shared packages outside the entry point's directory. Sometimes it would reload once and then go silent. Sometimes it would try to restart and crash with `EADDRINUSE` because the previous server was still holding the port. [Still open](https://github.com/oven-sh/bun/issues/26036). My project notes just say: "Bun --hot not picking up changes: Restart API."

When you bundle a Node app, the bundler is supposed to analyze your imports and drop anything unused—this is called tree-shaking. Bun's bundler couldn't do this with Playwright. The API server doesn't use Playwright directly, but it depends on a job queue package that does. Bun pulled the entire Playwright dependency into the API bundle, inflating it from 2.5 MB to 12.4 MB. The fix required restructuring how the packages export their code and manually telling Bun's bundler to [treat certain packages as external](https://github.com/oven-sh/bun/issues/16980). With Node you don't typically bundle server code at all, so this entire category of problem doesn't exist.

Separately, Bun 1.3.3 had a bug where [WebSocket connections would peg the CPU at 100%](https://github.com/oven-sh/bun/issues/23536), which meant pinning to an older version until a patch landed.

---

That's 13 distinct problems. Not theoretical concerns. Real debugging sessions, real time burned.

I could list them in a table:

| Problem | Bun's fault? | Fixed as of Feb 2026? |
|---|---|---|
| Workspace resolution in Docker | Yes | No |
| Root `.env` not loading in sub-packages | Yes | [No](https://github.com/oven-sh/bun/issues/11190) |
| `--frozen-lockfile` cross-platform drift | Yes | [No](https://github.com/oven-sh/bun/issues/6966) |
| `process.env` inlined at build time | Yes | [Yes](https://github.com/oven-sh/bun/issues/11191) |
| Bundle bloat from browser deps | Partly | No |
| 100% CPU on WebSocket | Yes | Workaround (pin version) |
| `--hot` reload stops working | Yes | [No](https://github.com/oven-sh/bun/issues/26036) |
| Healthcheck executes full module graph | Partly | N/A (user error, but Bun's eager evaluation made it worse) |
| Needed Debian images, not Alpine | Yes | No (Bun requires glibc) |
| pnpm for builds, Bun for runtime split | Yes | No |
| Isolated installs broken for monorepos | Yes | [No](https://github.com/oven-sh/bun/issues/23615) |
| `turbo prune` produces broken lockfile | Partly | [No](https://github.com/vercel/turborepo/issues/11007) |
| Chrome to Chromium on ARM64 | Partly | N/A |

One of the core issues is fixed. The rest are open or worked around.

---

If this project were a single API with a Dockerfile and no monorepo, Bun would have been the right choice. It's fast, the TypeScript support is great, and for a straightforward setup the rough edges don't come into play. The problems I hit were all at the seams — workspaces, Docker multi-stage builds, cross-platform CI, bundler behavior with transitive dependencies. The more surface area your project covers, the more likely you are to find them.

When I went looking for Bun monorepo setups at this complexity level — multi-stage Docker, frozen lockfiles in CI, shared packages across services — what I found were mostly starter templates and small projects. [Bun + Elysia + React on Railway](https://railway.com/deploy/bun-elysia-react-monorepo). GitHub templates with two packages and no Docker. Blog posts about fixing `--filter` by switching to `--cwd`. These are real projects and Bun works well for them. They just don't hit the same edges.

The workarounds for Bun's monorepo problems tend to converge on the same answer: use pnpm for that part. The frozen lockfile doesn't work cross-platform? Use pnpm's lockfile. `turbo prune` breaks the Bun lockfile? [Use pnpm or yarn instead](https://github.com/vercel/turborepo/discussions/7456). Workspace resolution fails in Docker? Use pnpm install.

A [fintech company](https://vibepanda.io/resources/guide/javascript-package-managers) tested Bun for their dev tools pipeline but kept production APIs on Node. The [broader consensus](https://devtechinsights.com/bun-vs-nodejs-production-2025/) reflects the same pattern: Bun works well for smaller, contained projects, but teams with complex infrastructure tend to keep pnpm or Node for the parts that need to be predictable.

---

This past week I audited how much Bun runtime surface area the project actually uses. Five files.

`Bun.file()` in a fixture loader. `Bun.serve()` for a health endpoint. `Bun.stdin.stream()` in a data import script. A `ServerWebSocket` type import. `Bun.spawn()` in a multiprocess worker.

Every one of these has a direct Node.js equivalent. `fs.readFile()`. `http.createServer()`. `process.stdin`. The `ws` package. `child_process.spawn()`. The core API framework is Hono, which is runtime-agnostic—it runs identically on Node, Bun, Deno, and Cloudflare Workers.

The entire reason Bun is still in the stack is inertia. It was the original choice. It worked as a runtime after it failed as a package manager. Nobody went back to question it because it wasn't actively breaking anything in that role.

But "not breaking anything" is a low bar for a dependency that forces you into Debian-based Docker images (450 MB versus 180 MB for Node Alpine), requires a different base image than your dashboard, and introduces a second runtime whose quirks you need to understand.

---

If I started this project today, I'd use pnpm and Node.js. Nothing else.

Not because Bun is bad software. The runtime is fast, the TypeScript support is real, and the team is well-funded—[Anthropic acquired Oven](https://bun.com/blog/bun-joins-anthropic) in late 2025. The trajectory is positive.

But I have a Next.js dashboard that must run on Node. Playwright tests that must run on Node. A Turbo build system that runs on Node. CI runners on Linux. Docker containers that benefit from Alpine. A pnpm lockfile that works the same on every platform.

The only thing Bun gives me is a slightly faster cold start on an API server that starts once and runs for days. The database query takes 50 milliseconds. The Python subprocess takes 200 milliseconds. The runtime overhead difference between Bun and Node is invisible behind those numbers.

One runtime for everything. One set of Docker base images. One set of quirks to understand. One lockfile format that CI trusts. That's the trade.

---

I still think Bun will get there. But "will get there" and "is there" are different things, and the gap matters when you're shipping production software. Thirteen problems, twelve months of workarounds, and a hybrid architecture that exists not because anyone designed it, but because one tool kept failing and another kept catching it.

`pnpm install --frozen-lockfile` has never once surprised me.
