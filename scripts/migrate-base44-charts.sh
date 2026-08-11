#!/bin/sh
# Turns the base44 chart URLs still held in Trade into local /api/uploads paths.
#
# The 349 URLs live in Trade.chartCluster/chartReverse/chartBox/chartTrading —
# they are trade screenshots, not note images, so NoteExampleImage is untouched.
# The files themselves were fetched separately: downloading from base44 works
# fine, it is the uplink to Railway that stalls (see scripts/backup-prod.sh).
#
# This script does NOT touch production. It writes two things and stops:
#   out/uploads/   the images renamed to the uuid.png the app expects
#   out/rewrite.sql  the UPDATE statements that repoint the rows
# Applying them is a separate, deliberate step: upload the files to the volume
# FIRST, then run the SQL. In that order a half-finished run leaves rows still
# pointing at base44 — which still resolves — instead of at files not yet there.
#
# Usage:  sh scripts/migrate-base44-charts.sh
# Config: SRC_DIR  downloaded base44 images (default ../flux-journal-base44)
#         DUMP     SQL dump to read the URLs from (default the backup repo's)
#         OUT_DIR  where to write the result (default ./out-base44)
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="${SRC_DIR:-$REPO_ROOT/../flux-journal-base44}"
DUMP="${DUMP:-$REPO_ROOT/../flux-journal-backups/db/prod.sql}"
OUT_DIR="${OUT_DIR:-$REPO_ROOT/out-base44}"

[ -d "$SRC_DIR" ] || { echo "migrate: images introuvables dans $SRC_DIR" >&2; exit 1; }
[ -f "$DUMP" ] || { echo "migrate: dump introuvable: $DUMP" >&2; exit 1; }

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR/uploads"
SQL="$OUT_DIR/rewrite.sql"
MAP="$OUT_DIR/mapping.txt"

# One transaction: a partial rewrite would leave some charts pointing at files
# on the volume and others at base44, with no way to tell which from the rows.
echo "BEGIN TRANSACTION;" > "$SQL"
: > "$MAP"

MISSING=0
COUNT=0

# Every distinct base44 URL in the dump. They are one-per-row in practice, but
# matching on the URL rather than the row id keeps this correct either way: if
# two trades ever shared a chart, both get repointed at the same new file.
grep -o "https://[a-zA-Z0-9._/-]*base44[a-zA-Z0-9._/?=&%-]*" "$DUMP" | sort -u | while read -r url; do
  name="$(basename "$url" | sed 's/?.*//')"
  src="$SRC_DIR/$name"

  if [ ! -s "$src" ]; then
    echo "migrate: manquant, non reecrit -> $name" >&2
    MISSING=$((MISSING + 1))
    continue
  fi

  # The app addresses uploads by uuid; the base44 basenames carry a screenshot
  # date that would leak into every URL and collide across apps.
  ext="$(printf '%s' "$name" | sed 's/.*\.//' | tr '[:upper:]' '[:lower:]')"
  uuid="$(uuidgen | tr '[:upper:]' '[:lower:]')"
  new="$uuid.$ext"

  cp "$src" "$OUT_DIR/uploads/$new"
  printf '%s\t%s\n' "$name" "$new" >> "$MAP"

  # Rewrite every chart column. A URL only ever sits in one of them, so three
  # of these four match nothing — that is cheaper than finding out which.
  # Checked on the dump: each of the 317 chart cells holds exactly one bare
  # URL, so matching the whole value is safe.
  for col in chartCluster chartReverse chartBox chartTrading; do
    printf "UPDATE Trade SET %s = '/api/uploads/%s' WHERE %s = '%s';\n" \
      "$col" "$new" "$col" "$url" >> "$SQL"
  done

  # The other 32 URLs are not in a chart column at all: they sit inline in the
  # prose of postTradeNotes, under an "Additional charts:" heading. Whole-value
  # matching would miss them entirely, so these need a substring replace.
  printf "UPDATE Trade SET postTradeNotes = replace(postTradeNotes, '%s', '/api/uploads/%s') WHERE postTradeNotes LIKE '%%%s%%';\n" \
    "$url" "$new" "$url" >> "$SQL"
  COUNT=$((COUNT + 1))
done

echo "COMMIT;" >> "$SQL"

FILES="$(find "$OUT_DIR/uploads" -type f | wc -l | tr -d ' ')"
echo "migrate: $FILES images preparees dans $OUT_DIR/uploads"
echo "migrate: $(grep -c '^UPDATE' "$SQL") UPDATE dans $SQL"
echo "migrate: correspondance des noms dans $MAP"
echo
echo "Pour appliquer (dans cet ordre, depuis une liaison qui tient) :"
echo "  1. deposer $OUT_DIR/uploads/* sur le volume Railway, dans /uploads"
echo "  2. sqlite3 prod.db < $SQL"
