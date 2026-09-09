FROM node:20-alpine AS base
WORKDIR /app

# Copy root package files and monorepo workspaces
COPY package*.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Install dependencies and build shared + api
RUN npm install
RUN npm run build --workspace=packages/shared
RUN npm run prisma:generate --workspace=apps/api
RUN npm run build --workspace=apps/api

EXPOSE 4000
CMD ["npm", "run", "start", "--workspace=apps/api"]
