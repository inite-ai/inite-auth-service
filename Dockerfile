# Build stage
FROM node:26-alpine AS builder

WORKDIR /app

# Copy package files and prisma schema
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY prisma ./prisma

# Install dependencies
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source
COPY src ./src
COPY scripts ./scripts

# Build
RUN npm run build

# Production stage
FROM node:26-alpine

WORKDIR /app

# Copy package files and prisma schema
COPY package*.json ./
COPY prisma ./prisma

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Generate Prisma client in production
RUN npx prisma generate

# Copy built app from builder
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
