#!/usr/bin/env bash
set -e

# ── Install pnpm if not available ──────────────────────────────────────────────
if ! command -v pnpm &> /dev/null; then
  echo "==> Installing pnpm..."
  npm install -g pnpm
fi

echo "==> pnpm version: $(pnpm --version)"
echo "==> Node version: $(node --version)"

# ── Install all workspace dependencies ─────────────────────────────────────────
echo "==> Installing dependencies..."
pnpm install --frozen-lockfile

# ── Build API server ────────────────────────────────────────────────────────────
echo "==> Building API server..."
pnpm --filter @workspace/api-server run build

echo "==> API server build complete. Output: artifacts/api-server/dist/index.mjs"

# ── Build casino frontend ───────────────────────────────────────────────────────
echo "==> Building casino frontend..."
pnpm --filter @workspace/casino run build

echo "==> All builds complete."
echo "    - API server: artifacts/api-server/dist/index.mjs"
echo "    - Casino frontend: artifacts/casino/dist/public"
