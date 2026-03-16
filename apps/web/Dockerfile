# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
RUN npm install -g turbo
WORKDIR /app

# 1. Prune — isolate only what @interceptor/web needs
FROM base AS pruner
COPY . .
RUN turbo prune @interceptor/web --docker

# 2. Install dependencies from pruned lockfile
FROM base AS deps
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# 3. Build
FROM base AS builder
COPY --from=deps /app/ ./
COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json
COPY turbo.json turbo.json
RUN pnpm build --filter=@interceptor/web

# 4. Run — keep full workspace structure (pnpm symlinks need it)
FROM node:22-alpine AS runner
RUN apk add --no-cache python3
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/ ./
# services/ is outside pnpm workspace — turbo prune won't include it
COPY services/python/ ./services/python/

USER nextjs
EXPOSE 3000
WORKDIR /app/apps/web
CMD ["pnpm", "start"]
