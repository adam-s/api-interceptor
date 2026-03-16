# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
RUN npm install -g turbo
WORKDIR /app

# 1. Prune — isolate only what @interceptor/api needs
FROM base AS pruner
COPY . .
RUN turbo prune @interceptor/api --docker

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
RUN pnpm build --filter=@interceptor/api

# 4. Run — both Node.js and Python in one container for IPC bridge
FROM node:22-alpine AS runner
RUN apk add --no-cache python3
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./
COPY services/python/ ./services/python/
CMD ["node", "dist/index.js"]
