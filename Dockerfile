# Build stage: better-sqlite3 is a native module. Its prebuilt binary is used when it downloads;
# python3, make and g++ are here so it can still compile if the download fails.
FROM node:24-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Run stage: the committed inputs, results and replay cache are baked in (read only);
# runtime state (SQLite DB, checkpoints, spend ledger) lives in the /state volume.
FROM node:24-slim
RUN corepack enable
WORKDIR /app
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /state && chown node:node /state
ENV RP_DATA_DIR=/app RP_STATE_DIR=/state NODE_ENV=production
USER node
EXPOSE 3030
CMD ["pnpm", "start"]
