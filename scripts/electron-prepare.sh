#!/bin/bash
# Builds the Next.js standalone server, a fresh pre-seeded template DB, and
# rebuilds better-sqlite3's native binary for Electron's Node ABI — then
# restores the root node_modules copy back to the system Node ABI so
# `npm run dev` keeps working immediately afterward.
set -euo pipefail
cd "$(dirname "$0")/.."

ELECTRON_VERSION="$(node -p "require('electron/package.json').version")"
NATIVE_BINARY="node_modules/better-sqlite3/build/Release/better_sqlite3.node"
STANDALONE_BINARY=".next/standalone/node_modules/better-sqlite3/build/Release/better_sqlite3.node"

npm run build
node scripts/build-template-db.mjs

rm -rf .next/standalone/public .next/standalone/.next/static
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/

npx electron-rebuild -v "$ELECTRON_VERSION" --force --only better-sqlite3
rm -f "$STANDALONE_BINARY"
cp "$NATIVE_BINARY" "$STANDALONE_BINARY"

# Restore the root copy to the system Node ABI so local `npm run dev` keeps working.
npm rebuild better-sqlite3

echo "electron:prepare done"
