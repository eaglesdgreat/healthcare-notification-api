# Stage 1: Base & Dependencies
FROM node:22-slim AS base

# Install netcat (nc) for the wait-for.sh script, procps for cleanup,
# and build tools for native addons
RUN apt-get update && apt-get install -y \
    netcat-openbsd \
    procps \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Enable pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# Tell pnpm it's running in CI so it never prompts interactively
ENV CI=true
RUN corepack enable

WORKDIR /app

# Copy configuration files first to leverage Docker cache
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install ALL dependencies (including devDeps for building/testing)
RUN pnpm install --frozen-lockfile

# Copy the rest of the source code
COPY . .

# Placeholder DB URL so `prisma generate` (which loads prisma.config.ts) can run.
# The real connection string is injected at runtime via docker-compose / CI.
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/healthcare_notification_db

# Ensure shell scripts have correct permissions
RUN chmod +x ./shell/*.sh

# Stage 2: Build (Generate Prisma client + compile TS to JS)
FROM base AS build
RUN pnpm exec prisma generate && pnpm build

# Stage 3: Install production-only dependencies
FROM base AS prod-deps
RUN pnpm install --prod --frozen-lockfile

# Stage 4: Production Release
FROM node:22-slim AS release

# Install netcat in release too (for wait-for.sh in ops environments)
RUN apt-get update && apt-get install -y netcat-openbsd && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only the compiled code and production node_modules from previous stages
COPY --from=build /app/dist ./dist
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/shell ./shell

# Set environment defaults
ENV NODE_ENV=production
ENV PORT=5502

# Run as non-root user for security (Healthcare API Best Practice)
USER node

EXPOSE 5502

# The command is usually overridden by docker-compose for dev,
# but this is the default for production
CMD ["node", "dist/main.js"]
