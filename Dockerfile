# Stage 1: Install dependencies
FROM node:22-bookworm AS deps
WORKDIR /app
RUN corepack enable pnpm
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# Stage 2: Build
FROM node:22-bookworm AS builder
WORKDIR /app
RUN corepack enable pnpm
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm rebuild better-sqlite3 && pnpm build

# Stage 3: Production
FROM node:22-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    tmux \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for agent sessions (--dangerously-skip-permissions requires non-root)
RUN useradd -m -s /bin/bash agent \
    && git config --global safe.directory '*' \
    && su - agent -c "git config --global safe.directory '*'"

RUN corepack enable pnpm

ENV NODE_ENV=production
ENV PORT=3200

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

RUN mkdir -p /app/data

EXPOSE 3200

CMD ["node", "server.js"]
