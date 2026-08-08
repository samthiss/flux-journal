#!/bin/sh
# Copies the images shipped in the repo into the persistent uploads volume.
# Railway's volume starts empty, and the image bundled with each deploy is
# ephemeral, so without this the note screenshots 404 after every deploy.
# Existing files are never overwritten, so anything uploaded through the app
# survives.
set -e

SRC="$(pwd)/public/uploads"
DEST="${UPLOADS_DIR:-$SRC}"

# No volume configured: the app already reads straight from public/uploads.
[ "$DEST" = "$SRC" ] && exit 0
[ -d "$SRC" ] || exit 0

mkdir -p "$DEST"
cp -Rn "$SRC/." "$DEST/" 2>/dev/null || true
echo "seed-uploads: $(ls -1 "$DEST" | wc -l) files in $DEST"
