#!/usr/bin/env bash
set -e

echo "==> Instalando dependencias..."
pnpm install --frozen-lockfile

echo "==> Compilando casino (frontend)..."
pnpm --filter @workspace/casino run build

echo "==> Compilando api-server (backend)..."
pnpm --filter @workspace/api-server run build

echo "==> Build completado."
