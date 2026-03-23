# Dockerizing a pnpm + Turborepo Monorepo

Containerizing a monorepo is harder than containerizing a single app. The lockfile lives at the root. Shared packages need to be copied. The build has to compile dependencies in the right order. And if you get the layer order wrong, every code change reinstalls all your packages.

Here's a working multi-stage Dockerfile for a pnpm + Turborepo monorepo, and why each stage exists.

```dockerfile
# Stage 1: base
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
RUN npm install -g turbo
WORKDIR /app

# Stage 2: prune
FROM base AS pruner
COPY . .
RUN turbo prune @interceptor/api --docker

# Stage 3: install
FROM base AS deps
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# Stage 4: build
FROM base AS builder
COPY --from=deps /app/ ./
COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json
COPY turbo.json turbo.json
RUN pnpm build --filter=@interceptor/api

# Stage 5: run
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./
CMD ["node", "dist/index.js"]
```

Let's break down what each stage does and why.

---

## Table of Contents

- [The problem multi-stage solves](#the-problem-multi-stage-solves)
- [Stage 1: base](#stage-1-base)
- [Stage 2: turbo prune](#stage-2-turbo-prune)
- [Stage 3: frozen-lockfile install](#stage-3-frozen-lockfile-install)
- [Stage 4: build](#stage-4-build)
- [Stage 5: minimal runner](#stage-5-minimal-runner)
- [The .dockerignore](#the-dockerignore)
- [docker-compose](#docker-compose)
- [CI: build on every push](#ci-build-on-every-push)
- [War story: the healthcheck that was a fork bomb](#war-story-the-healthcheck-that-was-a-fork-bomb)
- [Alpine vs Debian: when you need glibc](#alpine-vs-debian-when-you-need-glibc)
- [Common patterns](#common-patterns)

---

## The problem multi-stage solves

A naive Dockerfile copies the entire monorepo, installs everything, builds everything, and ships everything. The result is a 900MB image where a one-line code change reinstalls all dependencies because the lockfile layer was invalidated.

Multi-stage builds fix this by separating concerns:

```
COPY package.json + lockfile  →  install deps  →  COPY source  →  build  →  copy only dist
```

Each arrow is a Docker layer. If you only changed source code, Docker reuses the cached dependency layer. Installs take 3 seconds instead of 30.

In a monorepo, this gets harder because you have multiple `package.json` files, a workspace lockfile at the root, and shared packages that need to be built before apps that depend on them. That's where `turbo prune` comes in.

---

## Stage 1: base

```dockerfile
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
RUN npm install -g turbo
WORKDIR /app
```

The base image every other stage inherits from. Three things happen here:

- **`node:22-alpine`** — the smallest official Node image (~160MB). Alpine uses musl libc instead of glibc, which matters later (see [Alpine vs Debian](#alpine-vs-debian-when-you-need-glibc)).
- **corepack** — Node's built-in package manager manager. `corepack prepare pnpm@10.11.0` installs exactly the version specified in `package.json`'s `packageManager` field. No version drift between local and CI.
- **turbo** — installed globally so the pruner stage can use it. This is the one tool we install via npm rather than corepack.

---

## Stage 2: turbo prune

```dockerfile
FROM base AS pruner
COPY . .
RUN turbo prune @interceptor/api --docker
```

This is the key step that makes monorepo Docker builds work. `turbo prune` analyzes the dependency graph and creates a minimal subset of the monorepo containing only what `@interceptor/api` needs.

The `--docker` flag splits the output into two directories:

- **`out/json/`** — only `package.json` files and the workspace config. No source code. This is what the dependency install stage uses, so changing a `.ts` file doesn't invalidate the install cache.
- **`out/full/`** — the actual source code for all packages in the subgraph.
- **`out/pnpm-lock.yaml`** — a pruned lockfile containing only the dependencies of the selected packages.

Without `turbo prune`, you'd copy the entire monorepo into the container and install dependencies for every package, even ones the API doesn't use.

---

## Stage 3: frozen-lockfile install

```dockerfile
FROM base AS deps
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
```

This copies only the `package.json` files and pruned lockfile, then installs. Two things to notice:

**`--frozen-lockfile`** means pnpm will refuse to modify the lockfile. If the lockfile doesn't match the `package.json` files, the build fails. This catches dependency drift between what a developer committed and what CI installs.

**Cross-platform lockfiles work.** The lockfile was generated on macOS ARM64. This container runs on Linux x64. pnpm's lockfile format is platform-independent — the same file works everywhere. This was one of the [problems with Bun](../01_to_bun_or_not_to_bun/README.md): its binary lockfile had cross-platform drift that caused `--frozen-lockfile` to fail in CI.

**Cache mount** (optional but recommended):

```dockerfile
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
```

This mounts pnpm's content-addressable store as a Docker build cache. Packages downloaded in a previous build are reused without re-downloading.

---

## Stage 4: build

```dockerfile
FROM base AS builder
COPY --from=deps /app/ ./
COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json
COPY turbo.json turbo.json
RUN pnpm build --filter=@interceptor/api
```

The installed `node_modules` from the deps stage are copied in, then the full source from the pruner stage is layered on top. Two files need explicit copying because `turbo prune` doesn't include them in `out/full/`:

- **`tsconfig.base.json`** — shared TypeScript config that every package extends. Without it, `tsc` fails because `"extends": "../../tsconfig.base.json"` resolves to nothing.
- **`turbo.json`** — task definitions. Without it, `pnpm build` doesn't know the dependency order.

> **Gotcha:** If you add a new root-level config file that packages depend on (like a shared `.eslintrc` or `biome.json`), you'll need to add another `COPY` line here. The build will fail with a confusing error that works locally but not in Docker — because locally the file exists, but `turbo prune` didn't include it.

`pnpm build --filter=@interceptor/api` runs the `build` script for `@interceptor/api` and all its workspace dependencies. Turbo handles the ordering — `@interceptor/shared` builds first because `@interceptor/api` depends on it.

---

## Stage 5: minimal runner

```dockerfile
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./
CMD ["node", "dist/index.js"]
```

A fresh Alpine image with only the compiled JavaScript. No source code, no `node_modules`, no dev dependencies, no turbo, no pnpm. The final image is ~160MB.

`NODE_ENV=production` is set as a runtime environment variable. Node reads it at process start. This is different from [how Bun handles it](../01_to_bun_or_not_to_bun/README.md) — Bun's bundler inlines `process.env.NODE_ENV` at build time, so the value depends on when you built, not where you run.

> **Note:** This runner has no `node_modules` because the API currently has no runtime npm dependencies (only the workspace dependency on `@interceptor/shared`, which is compiled into `dist/`). When you add dependencies like `hono` or `drizzle-orm`, you'll need to copy `node_modules` from the builder stage as well.

---

## The .dockerignore

```
node_modules
dist
.turbo
.git
exploration
*.md
.github
```

The `.dockerignore` keeps the build context small. Without it, Docker sends your local `node_modules` (hundreds of MB) to the build daemon even though the Dockerfile never uses them. The pruner stage copies the monorepo source — it doesn't need `node_modules`, `dist`, or `.git`.

`exploration` and `*.md` are excluded because they're documentation, not source code.

---

## docker-compose

```yaml
services:
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    ports:
      - '3001:3001'
```

The `context: .` is important — it must be the monorepo root, not the app directory, because `turbo prune` needs the full workspace structure. The `dockerfile` path is relative to the context.

---

## CI: build on every push

```yaml
- run: docker build -f apps/api/Dockerfile .
```

One line in GitHub Actions. This catches Dockerfile breakage — missing `COPY` statements, broken build scripts, dependency resolution failures — before they reach production. The image is built but not pushed (that's a deployment concern for a later exploration).

---

## War story: the healthcheck that was a fork bomb

In this project, the Docker HEALTHCHECK originally looked like this:

```dockerfile
HEALTHCHECK CMD bun -e "import('./run.ts')"
```

The intent was to verify the process was alive. What actually happened: every 30 seconds, Docker executed `bun -e "import('./run.ts')"`, which imported the application's entry point, which initialized BullMQ workers, which connected to Redis and Postgres, which spawned browser processes. On a 2GB instance, this created zombie workers every 30 seconds until the container ran out of memory.

The fix:

```dockerfile
HEALTHCHECK CMD node -e "process.exit(0)"
```

Or better, a dedicated health endpoint:

```dockerfile
HEALTHCHECK CMD curl -f http://localhost:3001/health || exit 1
```

The lesson: in JavaScript, importing a module executes it. A healthcheck that imports your application *is* your application. Docker doesn't know this — it just runs a command. Use a healthcheck that proves the process is running without starting a second copy of it.

> **Note:** This wasn't a Bun bug — Node would do the same thing. The mistake was treating a JavaScript import like a static file read.

---

## Alpine vs Debian: when you need glibc

This Dockerfile uses `node:22-alpine` everywhere. Alpine works here because the API is pure JavaScript — no native modules, no browsers, no system dependencies beyond Node itself.

You need Debian (`node:22-slim`) when:

- **Your runtime is Bun** — Bun requires glibc, which Alpine doesn't have
- **You run headless browsers** — Chromium needs system libraries (`libnss3`, `libatk1.0-0`, etc.)
- **You have native Node modules** — packages with C++ addons compiled against glibc won't work on musl

The size difference matters:

| Base image | Size |
|---|---|
| `node:22-alpine` | ~160MB |
| `node:22-slim` (Debian) | ~260MB |
| `oven/bun:1.3.5-debian` | ~450MB |

If you need Debian for one service (like a browser automation worker) but not another (like a pure API), use different base images for each Dockerfile. This is one of the benefits of one-Dockerfile-per-service in a monorepo.

---

## Common patterns

### Adding runtime dependencies

When the API has npm dependencies (not just workspace packages), copy `node_modules` into the runner:

```dockerfile
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./
COPY --from=builder /app/node_modules ./node_modules
CMD ["node", "dist/index.js"]
```

### Build-time environment variables

If a build step needs environment variables (like `NEXT_PUBLIC_API_URL` for Next.js), set them in the builder stage:

```dockerfile
FROM base AS builder
ARG NEXT_PUBLIC_API_URL=https://example.com/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# ... build steps
```

`ARG` makes it configurable at build time: `docker build --build-arg NEXT_PUBLIC_API_URL=https://staging.example.com .`

### Non-root user

For production, don't run as root:

```dockerfile
FROM node:22-alpine AS runner
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 appuser
USER appuser
```

---

*Last updated: February 2026. Covers pnpm 10.11.0, Turborepo 2.8.x, Node 22, Docker BuildKit.*
