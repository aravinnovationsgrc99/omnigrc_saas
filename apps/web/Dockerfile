# Stage 1: Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package manifests for monorepo resolution
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY apps/web/package*.json ./apps/web/

# Install build dependencies
RUN npm ci

# Copy source trees
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# Set relative same-origin API URL at build time so Web image is immutable across customer domains
ENV NEXT_PUBLIC_API_URL=""

# Build shared package and Next.js standalone web application
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/web

# Stage 2: Production standalone runner stage (No TS/TSX source code / .git)
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy Next.js standalone server and static bundle traces
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

USER node

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
