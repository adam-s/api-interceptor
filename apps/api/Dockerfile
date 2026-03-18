# syntax=docker/dockerfile:1

# ── Build stage (Alpine for speed) ──────────────────────────────────
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

# ── Runtime stage (Debian for xvfb + Chrome/Chromium) ───────────────
# Headed browser + xvfb bypasses Cloudflare Turnstile bot detection.
# On amd64: installs Google Chrome (has window.chrome, plugins, WebGL).
# On arm64: falls back to Chromium (Chrome not available for ARM).
FROM node:22-slim AS runner

# Base dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget gnupg ca-certificates \
    xvfb xauth dbus \
    fonts-liberation fonts-noto-color-emoji \
    libgbm1 libnss3 libatk-bridge2.0-0 libgtk-3-0 libxss1 libasound2 \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Install Google Chrome on amd64, Chromium on arm64
RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "amd64" ]; then \
      wget -q -O /tmp/chrome-key.pub https://dl.google.com/linux/linux_signing_key.pub && \
      gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg /tmp/chrome-key.pub && \
      echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
        > /etc/apt/sources.list.d/google-chrome.list && \
      apt-get update && apt-get install -y --no-install-recommends google-chrome-stable && \
      rm -rf /var/lib/apt/lists/* /tmp/chrome-key.pub; \
    else \
      apt-get update && apt-get install -y --no-install-recommends chromium && \
      rm -rf /var/lib/apt/lists/*; \
    fi

# Patchright checks CHROME_PATH then CHROMIUM_PATH to find the browser.
# Only one will exist depending on arch — the code handles the fallback.
ENV CHROME_PATH=/usr/bin/google-chrome-stable
ENV CHROMIUM_PATH=/usr/bin/chromium
# Default to headed mode (Turnstile bypass). Set BROWSER_HEADLESS=true to override.
ENV BROWSER_HEADLESS=false

WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./
COPY services/python/ ./services/python/

# Browser profile persistence — mount a volume here for cross-restart sessions
RUN mkdir -p /app/data/browser-profiles

# xvfb-run provides a virtual display for headed Chrome without a monitor.
CMD ["xvfb-run", "--auto-servernum", "--server-args=-screen 0 1280x720x24 -ac", "node", "dist/index.js"]
