#!/bin/sh

export NODE_ENV=dev
export PORT=5502
# Ensure file watchers use polling mode inside the container (helps with Windows bind mounts)
export CHOKIDAR_USEPOLLING=true
export CHOKIDAR_INTERVAL=1000
export WATCHPACK_POLLING=true
export TSC_WATCHFILE=DynamicPriorityPolling

echo "Generating Prisma client..."
pnpm exec prisma generate

echo "Running database migrations..."
pnpm exec prisma migrate deploy

echo "Starting NestJS in watch mode..."
pnpm run start:dev
