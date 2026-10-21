#!/bin/sh
set -e

echo "▸ Running database migrations…"
cd /app/api
npx drizzle-kit migrate 2>&1
cd /app

echo "▸ Starting API server…"
exec node api/dist/server.js
