#!/bin/sh
echo "Running database migrations..."
pnpm exec prisma migrate deploy
echo "Database migration completed."
