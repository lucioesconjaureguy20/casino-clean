#!/usr/bin/env bash
set -euo pipefail

# ── Install pnpm ────────────────────────────────────────────────────────────
echo "==> Installing pnpm..."
npm install -g pnpm@9

# ── Install dependencies ────────────────────────────────────────────────────
echo "==> Installing workspace dependencies..."
pnpm install --frozen-lockfile

# ── Build shared libs ───────────────────────────────────────────────────────
echo "==> Building shared libraries..."
pnpm run typecheck:libs

# ── Build API server ────────────────────────────────────────────────────────
echo "==> Building API server..."
pnpm --filter @workspace/api-server run build

# ── Build Casino frontend ───────────────────────────────────────────────────
echo "==> Building Casino frontend..."
pnpm --filter @workspace/casino run build

echo "==> Build complete."
