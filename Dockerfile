# --- install stage: resolve the pnpm workspace with the exact pnpm pinned
# in package.json's "packageManager" field, via corepack. -----------------
FROM node:22-slim AS install

RUN corepack enable && corepack prepare pnpm@10.18.1 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/server/package.json packages/server/package.json
COPY packages/tools/package.json packages/tools/package.json

RUN pnpm install --frozen-lockfile

COPY . .

# --- release stage: run with bun, no build step needed (bun executes the
# TypeScript sources directly). ------------------------------------------
FROM oven/bun:1.2.22-slim AS release

WORKDIR /app

COPY --from=install /app ./

ENV NODE_ENV=production
EXPOSE 8080

CMD ["bun", "run", "packages/server/src/index.ts"]
