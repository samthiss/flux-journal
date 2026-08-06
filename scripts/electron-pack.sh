#!/bin/bash
# Runs electron-builder, then works around two of its default behaviors that
# don't fit this project:
#  1. extraResources copying silently drops any "node_modules" directory
#     (by design, on the assumption resources are static assets) — so the
#     standalone server's node_modules has to be copied in manually.
#  2. Modifying the bundle after packaging invalidates Electron's ad-hoc
#     code signature ("code has no resources but signature indicates they
#     must be present"), which makes macOS kill the app instantly and
#     silently on launch — so it has to be re-signed (ad-hoc, no paid
#     Apple Developer account needed for local personal use) as the last step.
set -euo pipefail
cd "$(dirname "$0")/.."

APP="dist-electron/mac-arm64/Flux Journal.app"

npx electron-builder --mac

cp -r .next/standalone/node_modules "$APP/Contents/Resources/standalone/node_modules"
codesign --force --deep --sign - "$APP"

echo "Packaged app: $APP"
echo "First launch needs a right-click > Open (unsigned, no Apple Developer account)."
