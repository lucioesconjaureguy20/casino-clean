#!/usr/bin/env bash
set -euo pipefail

# ── Install pnpm ────────────────────────────────────────────────────────────
echo "==> Installing pnpm..."
npm install -g pnpm@9

# ── Install dependencies ─────────────────────────────────────────────────────
echo "==> Installing workspace dependencies..."
# Use --no-frozen-lockfile because platform-specific overrides differ from Replit
pnpm install --no-frozen-lockfile

# ── Build API server (esbuild bundles TS directly — no tsc needed) ───────────
echo "==> Building API server..."
pnpm --filter @workspace/api-server run build

# ── Build Casino frontend ─────────────────────────────────────────────────────
echo "==> Building Casino frontend..."
pnpm --filter @workspace/casino run build

echo "==> Build complete."
