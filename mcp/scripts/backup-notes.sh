#!/bin/sh
# OBSOLETE as of Execution 1 (2026-08-10). This script git-versioned the
# flat-file note store at mcp/data/notes/. That store no longer exists:
# Taskpad_MCP was rewired to read and write notes through task-app's
# /api/pad, so Postgres is the only copy. Notes are now backed up by
# backup-postgres.sh (Execution 2), which pg_dumps to the Home Server and
# Google Drive.
#
# Kept for the audit trail. If a cron still calls this, remove that cron -
# it has been failing since the cutover.
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NOTES_DIR="$SCRIPT_DIR/../data/notes"

if [ ! -d "$NOTES_DIR" ]; then
  echo "backup-notes.sh is obsolete: $NOTES_DIR does not exist." >&2
  echo "Notes live in Postgres now; use backup-postgres.sh instead." >&2
  exit 1
fi

cd "$NOTES_DIR"
if [ ! -d .git ]; then git init -q; fi
git add -A
if ! git diff --cached --quiet; then
  git commit -q -m "auto backup $(date -Iseconds)"
fi
