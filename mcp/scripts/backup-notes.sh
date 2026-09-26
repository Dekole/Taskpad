#!/bin/sh
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NOTES_DIR="$SCRIPT_DIR/../data/notes"

cd "$NOTES_DIR"
if [ ! -d .git ]; then git init -q; fi
git add -A
if ! git diff --cached --quiet; then
  git commit -q -m "auto backup $(date -Iseconds)"
fi
