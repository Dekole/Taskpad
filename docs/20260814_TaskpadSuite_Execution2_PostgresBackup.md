# Taskpad Suite Execution 2: Postgres backup (Home Server + Google Drive)

**Status: planned, not started.**

**Scope**: implement spec §9 (updated 2026-08-14) — back up the live `pad`/`tasks` data
in `taskpad-db-1` (VPS) to two places: a local timestamped copy on the Home Server, and
Google Drive via `rclone`. Kept forever on both sides (see "Key specs" below), no
encryption (per existing explicit decision).

**Why now**: surfaced as a real gap while wrapping up Execution 1 — the notes/tasks data
that used to live as flat files (backed up in Block 0 of Execution 1) now lives
exclusively in Postgres on the VPS, with zero backup coverage. A VPS disk failure today
would lose the only copy.

## Key specs at a glance

| | |
|---|---|
| **What's backed up** | The live `pad` (notes/folders) and `tasks` tables from `taskpad-db-1` on the VPS. (The original flat files have their own separate, already-working backup from Execution 1 Block 0 — unaffected by this.) |
| **Where it's stored** | Two independent copies: local disk on the Home Server, and Google Drive. |
| **Retention** | **Forever, on both sides.** Decided 2026-08-14 — at current usage (~50 KB/backup, ~3.9 KB/day of new content), a full year of daily snapshots is roughly **250–300 MB total**. Negligible against either a home server's storage or Drive's free 15 GB tier; revisit only if that changes. |
| **Frequency** | Daily. |
| **Encryption** | None, by explicit decision (matches the earlier flat-file backup decision) — revisit only if asked. |
| **Security model** | The VPS never holds a credential that can reach into the home network — only the reverse. A dedicated SSH key (used for nothing else) is restricted so it can *only* ever run the one `pg_dump` command, even if someone tries to make it run anything else. That connection travels over Tailscale, never the public internet. Google Drive's access token lives only on the Home Server — the VPS never touches it. |
| **What happens if the VPS dies** | Restore from the most recent snapshot on either the Home Server or Google Drive — two independent copies, neither depends on the VPS or each other. |

## Design decision: pull, not push

A cron job on the **Home Server** SSHes into the VPS over Tailscale to run the dump and
pulls it down, rather than the VPS pushing to Drive directly (the original §9 draft's
approach). The VPS never holds a credential that reaches into the home network — it only
ever gets connected to. Home Server is the more-trusted machine (not public-facing);
VPS was already flagged as the higher security priority (spec §10), so it shouldn't be
the one holding new outbound credentials either. Google Drive's OAuth token lives only
on the Home Server, never touches the VPS.

## Plan

### Phase 1 — Establish connection between VPS and Home Server

The credential that lets the Home Server reach into the VPS to trigger a dump. Nothing
here touches Google Drive yet.

1. **Generate a dedicated SSH keypair on the Home Server**, used for nothing else:
   ```
   ssh-keygen -t ed25519 -f ~/.ssh/taskpad_pgbackup -N "" -C "homeserver-pgbackup"
   ```
   No passphrase — this needs to run unattended via cron. Key secrecy isn't the security
   boundary here; the forced command in step 2 is.
2. **Add the public key to the VPS's `/root/.ssh/authorized_keys` with a forced
   command**, so it can never be used for anything except the one dump command,
   regardless of what command is actually requested over that connection:
   ```
   command="docker exec taskpad-db-1 pg_dump -U taskapp taskapp",no-port-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA...homeserver-pgbackup-key-here homeserver-pgbackup
   ```
   (the real public key from step 1 goes in place of the placeholder above)
3. **Find the VPS's Tailscale address** — connect over Tailscale, not the public IP/port,
   so this new automated credential never touches the public internet-facing SSH port.
   Check via `tailscale status` on the VPS, or pull from what's already known from the
   original Phase 4/5 Tailscale bridge setup (Home Server's own Tailscale IP is already
   known: `100.125.184.106`).
4. **Verify the restriction actually works**, from the Home Server:
   - `ssh -i ~/.ssh/taskpad_pgbackup root@<vps-tailscale-ip>` with no command → should
     run the forced `pg_dump` command and print SQL to stdout, not an interactive shell.
   - `ssh -i ~/.ssh/taskpad_pgbackup root@<vps-tailscale-ip> 'whoami'` → should **still**
     just run the forced dump command (proving the restriction can't be overridden by
     requesting a different command), not actually run `whoami`.

### Phase 2 — Home Server does periodic download of the data

Local backup only at this point — no Google Drive involved yet. This alone already
solves "one copy of the live data off the VPS."

5. **Write `scripts/backup-postgres.sh`** on the Home Server, mirroring
   `scripts/backup-notes.sh`'s style (same repo, same pattern):
   - Runs the dump over the Phase 1 connection:
     `ssh -i ~/.ssh/taskpad_pgbackup root@<vps-tailscale-ip> > ~/taskpad-pg-backups/taskpad-$(date +%Y%m%d-%H%M%S).sql`
   - Creates `~/taskpad-pg-backups/` if it doesn't exist.
   - No pruning — kept forever (see "Key specs" above).
6. **Cron it daily** on the Home Server (notes backup is every 15 min because notes
   change throughout the day; a Postgres dump only needs a daily cadence per spec §9):
   ```
   0 3 * * * /home/pchen/projects/taskpad_mcp/scripts/backup-postgres.sh
   ```
7. **Verify**: run the script once manually, confirm a non-empty, valid-looking SQL dump
   file appears locally (e.g. starts with `-- PostgreSQL database dump`).

### Phase 3 — Home Server crons the backup to Google Drive

Building on Phase 2's local file — uploads the same dump onward, doesn't change how
it's produced.

8. **Install `rclone`** on the Home Server.
9. **Configure a Google Drive remote**: `rclone config` — walks through picking "Google
   Drive" as the remote type, then opens a browser for a one-time OAuth consent. **This
   step needs you interactively** — same category of manual step as the SSH
   `ControlMaster` unlock in Execution 1, I can't complete it unattended. I'll give exact
   commands when we get here.
10. **Extend `backup-postgres.sh`** to also upload the fresh dump to the configured
    Drive folder right after saving it locally:
    ```
    rclone copy ~/taskpad-pg-backups/taskpad-<timestamp>.sql gdrive:taskpad-backups/
    ```
    No pruning here either — kept forever, same as the local copy.
11. **End-to-end verification**: run the full script once, confirm the file appears in
    the actual Google Drive folder (not just locally), confirm content matches the local
    copy.
