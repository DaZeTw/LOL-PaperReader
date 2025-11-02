#!/bin/sh
set -e

cd /app || exit 1

# Remove yarn completely to prevent Next.js from detecting it
echo "[dev-wrapper] Removing yarn files..."
rm -f yarn.lock .yarnrc.yml .yarnrc 2>/dev/null || true
rm -rf .yarn 2>/dev/null || true

# Disable yarn via corepack
corepack disable yarn 2>/dev/null || true

# Verify we're in the right directory and package.json exists
if [ ! -f "package.json" ]; then
  echo "Error: package.json not found in /app"
  exit 1
fi

# If node_modules/typescript doesn't exist, dependencies weren't installed yet
# In dev mode with volume mount, node_modules should already be there from build
# Just verify TypeScript exists
if [ ! -d "node_modules/typescript" ]; then
  echo "[dev-wrapper] TypeScript not found in node_modules. Dependencies may need installation."
  echo "[dev-wrapper] This is expected in dev mode with volume mounts."
  echo "[dev-wrapper] Node modules should come from the container build."
fi

echo "[dev-wrapper] Starting Next.js dev server..."
exec npm run dev

