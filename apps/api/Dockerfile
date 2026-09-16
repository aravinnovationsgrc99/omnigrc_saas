# Stage 1: Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package manifests for layer caching
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY apps/api/package*.json ./apps/api/

# Install build dependencies
RUN npm ci

# Copy source trees
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Build shared package, Prisma client, and NestJS API dist
RUN npm run build --workspace=packages/shared
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN npm run build --workspace=apps/api

# Prune devDependencies for production runtime
RUN npm prune --production

# Stage 2: Production runner stage (No source code / tests / .git)
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY package*.json ./

# Copy compiled shared package
COPY --from=builder /app/packages/shared/package*.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# Copy compiled NestJS dist, Prisma schema/migrations, and docker-entrypoint.sh
COPY --from=builder /app/apps/api/package*.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh

# Copy production node_modules
COPY --from=builder /app/node_modules ./node_modules

RUN chmod +x /app/apps/api/docker-entrypoint.sh

USER node

EXPOSE 4000
ENTRYPOINT ["/app/apps/api/docker-entrypoint.sh"]
CMD ["node", "apps/api/dist/src/main.js"]
