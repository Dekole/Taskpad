# Taskpad Suite Execution 2: Postgres backup (Home Server + Google Drive)

**Status: planned, not started.**

**Scope**: implement spec §9 (updated 2026-08-14) — back up the live `pad`/`tasks` data
in `taskpad-db-1` (VPS) to two places: a local timestamped copy on the Home Server, and
Google Drive via `rclone`. Both with 14-day retention, no encryption (per existing
explicit decision).

**Why now**: surfaced as a real gap while wrapping up Execution 1 — the notes/tasks data
that used to live as flat files (backed up in Block 0 of Execution 1) now lives
exclusively in Postgres on the VPS, with zero backup coverage. A VPS disk failure today
would lose the only copy.

## Design decision: pull, not push

A cron job on the **Home Server** SSHes into the VPS over Tailscale to run the dump and
pulls it down, rather than the VPS pushing to Drive directly (the original §9 draft's
approach). The VPS never holds a credential that reaches into the home network — it only
ever gets connected to. Home Server is the more-trusted machine (not public-facing);
VPS was already flagged as the higher security priority (spec §10), so it shouldn't be
the one holding new outbound credentials either. Google Drive's OAuth token lives only
on the Home Server, never touches the VPS.

## Plan

1. **Generate a dedicated SSH keypair on the Home Server** (ed25519, no passphrase —
   needs to run unattended via cron; the forced-command restriction below is the actual
   security boundary, not key secrecy).
2. **Add the public key to the VPS's `/root/.ssh/authorized_keys` with a forced
   command**, so it can never be used for anything except the one dump command:
   ```
   command="docker exec taskpad-db-1 pg_dump -U taskapp taskapp",no-port-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA... homeserver-pgbackup
   ```
3. **Verify the restriction actually works**: confirm the key can run the dump command,
   and confirm it *cannot* run anything else (e.g. `ssh -i key vps 'whoami'` should be
   rejected or forced back to the dump command regardless of what's requested).
4. **Connect over Tailscale, not the public IP** — need the VPS's Tailscale address
   (`tailscale status` on the VPS, or check what's already known from the original
   Phase 4/5 Tailscale bridge setup).
5. **Write `scripts/backup-postgres.sh`** on the Home Server (mirrors
   `scripts/backup-notes.sh`'s style): pulls the dump via the restricted key, saves it
   locally as `~/taskpad-pg-backups/taskpad-YYYYMMDD-HHMMSS.sql`, prunes local copies
   older than 14 days.
6. **Install and configure `rclone`** on the Home Server with a Google Drive remote —
   this needs one-time interactive OAuth consent (browser-based), which only the user
   can complete, same category of step as the earlier SSH `ControlMaster` unlock.
7. **Extend the script** to upload the fresh dump to the configured Drive folder via
   `rclone copy`, and prune Drive-side copies older than 14 days (`rclone` supports this
   directly, e.g. via `rclone delete --min-age 14d` on the target folder).
8. **Cron it** — daily, per spec §9 (notes backup is every 15 min because notes change
   throughout the day; Postgres dump content only needs a daily cadence).
9. **End-to-end verification**: run once manually, confirm both the local file and the
   Drive file exist and are non-empty/valid SQL dumps, confirm the restricted key
   genuinely can't do anything beyond the dump command.

## Open question before executing

Step 6 (rclone + Google Drive OAuth) requires you to complete a browser-based consent
flow interactively on the Home Server (or wherever `rclone config` is run) — same
category of manual step as the SSH unlock in Execution 1. I'll walk through the exact
commands when we get there, but flagging now that it's not something I can do
unattended.
