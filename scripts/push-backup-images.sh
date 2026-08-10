#!/bin/sh
# Pushes the backup repository's images in small batches.
#
# backup-prod.sh downloads the images and commits them, but leaves the push to
# this script, because that push is the step that fails. What follows was
# measured on 2026-08-10, not guessed:
#
#   43 MiB in one pack        -> HTTP 408
#   40 files, about 6 MB      -> HTTP 408
#   5 files, about 1.1 MB     -> goes through
#
# That matches the note in backup-prod.sh: this uplink stalls past 1-2MB. The
# batch size below sits under the threshold that was observed to work rather
# than at the largest one that might. Do not go hunting for a better size — the
# limit moves with the network, and a batch that passed an hour ago can stop
# passing, which is exactly how the run of 2026-08-10 ended.
#
# Two things make a failure cheap. Every pushed batch is a pushed commit, so a
# run that dies halfway keeps everything before it. And the loop reads what is
# still untracked rather than counting, so re-running resumes where it stopped
# with no bookkeeping.
#
# One misreading worth avoiding: the throughput git prints while pushing
# ("Writing objects ... 49 MiB/s") measures writes into its local buffer, not
# bytes the far end acknowledged. On a stalling link git shows a flattering
# rate and then times out at the very end. Watch the exit status, not the bar.
#
# Usage:  sh scripts/push-backup-images.sh
# Config: BACKUP_REPO  path to the backup git repo (default ../flux-journal-backups)
#         BATCH        files per commit (default 5)
#         TRIES        attempts per batch before giving up (default 3)
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_REPO="${BACKUP_REPO:-$REPO_ROOT/../flux-journal-backups}"
BATCH="${BATCH:-5}"
TRIES="${TRIES:-3}"

if [ ! -d "$BACKUP_REPO/.git" ]; then
  echo "push-images: $BACKUP_REPO n'est pas un depot git." >&2
  exit 1
fi

cd "$BACKUP_REPO"

remaining() {
  git ls-files --others --exclude-standard uploads | wc -l | tr -d ' '
}

pending_commits() {
  git log '@{u}..HEAD' --oneline 2>/dev/null | wc -l | tr -d ' '
}

# Returns 0 as soon as a push lands, 1 once the attempts are exhausted.
push_with_retries() {
  I=1
  while [ "$I" -le "$TRIES" ]; do
    if git push -q origin HEAD 2>/dev/null; then
      return 0
    fi
    echo "  tentative $I echouee, nouvel essai."
    I=$((I + 1))
    sleep 5
  done
  return 1
}

# A run that died after committing leaves work that is on disk and in history
# but not on the remote. Clear it first: otherwise the count below would report
# only the untracked files and understate what is actually missing.
if [ "$(pending_commits)" -gt 0 ]; then
  echo "push-images: $(pending_commits) commit(s) en attente, envoi..."
  if ! push_with_retries; then
    echo "push-images: les commits en attente ne passent pas; rien de nouveau tente." >&2
    exit 1
  fi
  echo "push-images: commits en attente pousses."
fi

TOTAL="$(remaining)"
if [ "$TOTAL" -eq 0 ]; then
  echo "push-images: rien a pousser."
  exit 0
fi

echo "push-images: $TOTAL fichiers a pousser, par lots de $BATCH."

N=0
while [ "$(remaining)" -gt 0 ]; do
  N=$((N + 1))
  git ls-files --others --exclude-standard uploads | head -"$BATCH" | tr '\n' '\0' | xargs -0 git add --
  COUNT="$(git diff --cached --name-only | wc -l | tr -d ' ')"
  git commit -q -m "Backup images — lot $N ($COUNT fichiers)"

  if ! push_with_retries; then
    # Undo the commit that could not be sent, putting its files back to
    # untracked. Without this the count of what is still missing would fall on
    # every failed run while nothing had actually been backed up — after enough
    # attempts the script would report nothing left to do and be wrong. The
    # files themselves are untouched on disk either way.
    git reset -q --soft HEAD~1
    git reset -q uploads
    echo "push-images: echec au lot $N apres $TRIES tentatives." >&2
    echo "             $(remaining) fichiers restants." >&2
    if [ "$N" -gt 1 ]; then
      echo "             Les $((N - 1)) lots precedents sont acquis sur le distant." >&2
    fi
    echo "             Relancer ce script reprendra ici, de preference depuis un autre reseau." >&2
    exit 1
  fi
  echo "  lot $N pousse ($COUNT fichiers) — reste $(remaining)."
done

echo "push-images: termine, $TOTAL fichiers pousses en $N lots."
