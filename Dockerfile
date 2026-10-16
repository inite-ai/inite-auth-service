# Build stage
FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS builder

WORKDIR /app

# Copy package files and prisma schema/config
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# Install dependencies (postinstall runs `prisma generate`)
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source
COPY src ./src
COPY scripts ./scripts

# Build
RUN npm run build

# Drop devDependencies but keep the generated Prisma client + its runtime
# deps (@prisma/client, @prisma/client-runtime-utils, @prisma/adapter-pg, pg)
# correctly linked. The prisma CLI is a runtime dependency: the container
# migrates its own database at boot (scripts/migrate.js), with the CLI version
# the lockfile pins rather than whatever `npx prisma` would download.
# --ignore-scripts so the root postinstall (prisma generate) doesn't re-run.
RUN npm prune --omit=dev --ignore-scripts

# Production stage
FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43

WORKDIR /app

# Copy the pruned production node_modules (incl. the generated client) and the
# runtime files straight from the builder — no reinstall, no regeneration, so
# the Prisma 7 driver-adapter client keeps its exact dependency linkage.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Change ownership
RUN chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 3002

# No update checks / telemetry from the prisma CLI at boot.
ENV CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1

# Bring the database to the current schema — empty, tracked or `db push`-built
# alike (see scripts/migrate.js, docs/MIGRATIONS.md) — then start the app.
# Idempotent: on an up-to-date database it applies nothing.
CMD ["sh", "-c", "node scripts/migrate.js && exec node dist/main"]
