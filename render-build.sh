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

# ── Build casino frontend ───────────────────────────────────────────────────────
echo "==> Building casino frontend..."
pnpm --filter @workspace/casino run build

echo "==> Build complete. Output: artifacts/casino/dist/public"
