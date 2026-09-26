#!/bin/sh
set -e
BACKUP_DIR="$HOME/taskpad-pg-backups"
VPS_TAILSCALE_IP="100.89.0.105"
SSH_KEY="$HOME/.ssh/taskpad_pgbackup"
RCLONE="$HOME/.local/bin/rclone"
DRIVE_REMOTE="gdrive:taskpad-backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUT_FILE="$BACKUP_DIR/taskpad-$TIMESTAMP.sql"
TMP_FILE="$OUT_FILE.tmp"

mkdir -p "$BACKUP_DIR"

ssh -i "$SSH_KEY" -o ConnectTimeout=10 "root@$VPS_TAILSCALE_IP" > "$TMP_FILE"

if [ ! -s "$TMP_FILE" ]; then
  echo "Backup failed: dump was empty" >&2
  rm -f "$TMP_FILE"
  exit 1
fi

mv "$TMP_FILE" "$OUT_FILE"

"$RCLONE" copy "$OUT_FILE" "$DRIVE_REMOTE/"
