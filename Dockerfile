# Build stage
FROM node:22-alpine AS builder

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
# correctly linked. --ignore-scripts so the root postinstall (prisma generate,
# now devDep-only) doesn't re-run without the CLI.
RUN npm prune --omit=dev --ignore-scripts

# Production stage
FROM node:22-alpine

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

# Run array migration (idempotent) and start the application
CMD ["sh", "-c", "node scripts/migrate-arrays.js && node dist/main"]
