#!/bin/sh
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NOTES_DIR="$SCRIPT_DIR/../data/notes"

cd "$NOTES_DIR"
git add -A
if ! git diff --cached --quiet; then
  git commit -q -m "auto backup $(date -Iseconds)"
fi
