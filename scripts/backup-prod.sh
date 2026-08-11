#!/bin/sh
# Backs up the Railway production volume (/data) to a separate git repository.
#
# The database is stored as a SQL text dump rather than the .db binary on
# purpose: git diffs text, so a daily backup where three rows changed costs a
# few hundred bytes instead of a fresh 280KB blob every time. Images are
# binary and unavoidable, but they are append-only, so each file is stored once.
#
# Images are NOT committed by default. Sustained uploads from the usual network
# stall at 1-2MB over both SSH and HTTPS, so a 58MB image push hangs forever and
# would take the database backup down with it. The database dump is small, it is
# the part that cannot be re-created, and it goes through reliably on its own.
# Run with WITH_IMAGES=1 from a connection that can carry the bulk transfer.
#
# Usage:  sh scripts/backup-prod.sh
# Config: BACKUP_REPO   path to the backup git repo (default ../flux-journal-backups)
#         WITH_IMAGES=1 also commit and push the images (needs a fast uplink)
#         SKIP_PUSH=1   commit locally without pushing
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_REPO="${BACKUP_REPO:-$REPO_ROOT/../flux-journal-backups}"
VOLUME="${RAILWAY_VOLUME:-flux-journal-volume}"
STAMP="$(date +%Y-%m-%dT%H:%M:%S%z)"

command -v railway >/dev/null 2>&1 || { echo "backup: railway CLI introuvable" >&2; exit 1; }
command -v sqlite3 >/dev/null 2>&1 || { echo "backup: sqlite3 introuvable" >&2; exit 1; }

if [ ! -d "$BACKUP_REPO/.git" ]; then
  echo "backup: $BACKUP_REPO n'est pas un depot git." >&2
  echo "        Cree-le d'abord, ou pointe BACKUP_REPO ailleurs." >&2
  exit 1
fi

# Railway resolves the linked project from the working directory.
cd "$REPO_ROOT"

TMP="$(mktemp -d)"
# Keep the raw .db around only until the dump succeeds.
trap 'rm -rf "$TMP"' EXIT INT TERM

echo "backup: telechargement de prod.db..."
railway volume files --volume "$VOLUME" download /prod.db "$TMP/prod.db" >/dev/null

# A truncated download or a torn copy would otherwise be committed as a
# perfectly valid-looking backup, so verify before trusting it.
INTEGRITY="$(sqlite3 "$TMP/prod.db" "PRAGMA integrity_check;")"
if [ "$INTEGRITY" != "ok" ]; then
  echo "backup: base corrompue, abandon -> $INTEGRITY" >&2
  exit 1
fi

mkdir -p "$BACKUP_REPO/db" "$BACKUP_REPO/uploads"
sqlite3 "$TMP/prod.db" .dump > "$BACKUP_REPO/db/prod.sql"

# Only fetch the images when they are actually going to be committed: pulling
# 58MB on every routine run wastes time and is the step most likely to time out.
if [ "$WITH_IMAGES" = "1" ]; then
  echo "backup: telechargement des images..."
  railway volume files --volume "$VOLUME" download /uploads "$TMP/uploads" >/dev/null

  # Flatten rather than copy the tree: the Railway CLI writes the remote folder
  # *inside* the target, so the download lands in $TMP/uploads/uploads, and a
  # recursive copy reproduced that nesting in the backup. Walking the files
  # instead handles either layout. AppleDouble sidecars are macOS noise.
  #
  # -n keeps it non-clobbering: a backup must not lose an image just because it
  # was deleted in the app, and re-copying 54MB every run would be wasteful.
  find "$TMP/uploads" -type f ! -name '._*' \
    -exec cp -n {} "$BACKUP_REPO/uploads/" \; 2>/dev/null || true
fi

TRADES="$(sqlite3 "$TMP/prod.db" "select count(*) from Trade;")"
NOTES="$(sqlite3 "$TMP/prod.db" "select count(*) from Note;")"
IMAGES="$(sqlite3 "$TMP/prod.db" "select count(*) from NoteExampleImage;")"
# Count only the images themselves. A plain -type f sweep also picks up macOS
# AppleDouble sidecars (._name), .gitkeep, and anything left in a subdirectory
# by an interrupted download, which inflated this number to 270 for 228 images.
FILES="$(find "$BACKUP_REPO/uploads" -maxdepth 1 -type f \
  ! -name '._*' ! -name '.gitkeep' | wc -l | tr -d ' ')"

if [ "$WITH_IMAGES" = "1" ]; then
  IMAGES_LINE="Fichiers uploads   $FILES (sauvegardes)"
else
  IMAGES_LINE="Fichiers uploads   non sauvegardes — relancer avec WITH_IMAGES=1"
fi

cat > "$BACKUP_REPO/BACKUP_INFO.txt" <<EOF
Derniere sauvegarde : $STAMP
Source              : Railway volume $VOLUME (/data)

Trade              $TRADES
Note               $NOTES
NoteExampleImage   $IMAGES
$IMAGES_LINE

Restauration : voir README.md
EOF

cd "$BACKUP_REPO"
git add db BACKUP_INFO.txt
if [ "$WITH_IMAGES" = "1" ]; then
  git add uploads
  LABEL="$TRADES trades, $NOTES notes, $FILES fichiers"
else
  LABEL="$TRADES trades, $NOTES notes (base seule)"
fi

if git diff --cached --quiet; then
  echo "backup: aucun changement depuis la derniere sauvegarde."
  exit 0
fi

git commit -q -m "Backup $STAMP — $LABEL"
if [ "$SKIP_PUSH" = "1" ]; then
  echo "backup: commit local effectue (push ignore)."
else
  git push -q
  echo "backup: sauvegarde poussee — $LABEL."
fi
