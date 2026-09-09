FROM node:20-alpine AS base
WORKDIR /app

# Copy root package files and monorepo workspaces
COPY package*.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# Install dependencies and build shared + web
RUN npm install
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/web

EXPOSE 3000
CMD ["npm", "run", "start", "--workspace=apps/web"]
