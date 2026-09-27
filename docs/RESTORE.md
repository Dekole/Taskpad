# Restoring Taskpad data

> Every command below was executed against the live VPS on 2026-09-27, restoring a real dump
> into a scratch database. This is a verified procedure, not a sketch.

## What the backup does and does not cover

The nightly backup is a plain `pg_dump` of the `taskapp` database. That is everything you
have *written*, and nothing else.

| Covered by the dump | Not covered — and where it lives |
|---|---|
| `tasks` | `.env` (all secrets) — **only on the VPS** |
| `pad` (notes, folders, journal, people) | `secrets/client_secret.json` — **only on the VPS** |
| `users` | `mcp/data/oauth/clients.json` (Claude client registrations) — only on the VPS |
| | `data/tokens/` (Google tokens) — only on the VPS, but regenerable by re-authenticating |

**This is the real gap in disaster recovery.** If the droplet is lost, the code comes back from
GitHub and the data from Drive, but the secrets do not exist anywhere else. Recovering would
mean minting a new `MCP_JWT_SECRET` and `MCP_AUTH_TOKEN`, re-downloading the Google client
secret, and re-registering the Claude connector. Worth fixing separately; it is not a
restore problem.

## Step 0 — get a dump

From Google Drive (`taskpad-backups`, one file per night, `taskpad-YYYYMMDD-HHMMSS.sql`):
https://drive.google.com/drive/folders/1jk7hVFhJ848Ys2DPpsx7Xv-ZFWGgmJ5P

Or from the Home Server, which holds the same files: `~/taskpad-pg-backups/`.

Then put it on the VPS:
```
scp taskpad-20260927-030001.sql vps:/root/restore.sql
```

## Step 1 — always verify into a scratch database first

Never restore over live data you have not first proven the dump can replace. This is
read-only with respect to `taskapp` and takes about ten seconds.

```
ssh vps
D=/root/restore.sql
PSQL="docker exec taskpad-db-1 psql -U taskapp -d postgres"

$PSQL -c "DROP DATABASE IF EXISTS restoretest;"
$PSQL -c "CREATE DATABASE restoretest;"
docker exec -i taskpad-db-1 psql -U taskapp -d restoretest -v ON_ERROR_STOP=1 < $D

for t in pad tasks users; do
  echo "$t: $(docker exec taskpad-db-1 psql -U taskapp -d restoretest -tAc "SELECT count(*) FROM $t;")"
done
```

`ON_ERROR_STOP=1` matters: without it `psql` reports errors and carries on, and you get a
half-restored database that looks like a success.

Compare those counts against what you expect. If they are wrong, **stop** — try an older
dump rather than destroying live data with a bad one.

Clean up when satisfied:
```
$PSQL -c "DROP DATABASE restoretest;"
```

## Step 2 — restore over live

Only after Step 1 passed.

The dump contains **no `DROP` statements** (`CREATE TABLE` only), so it cannot be layered
over existing tables — it would fail with "relation already exists". The database has to be
dropped and recreated, and Postgres will not drop a database that has open connections.

```
cd /root/Taskpad

# 1. Stop the writers. NOT db - it has to stay up to do the work.
docker compose stop backend mcp

# 2. Keep the current state, even if you believe it is corrupt. It is evidence.
docker exec taskpad-db-1 pg_dump -U taskapp taskapp > /root/pre-restore-$(date +%F-%H%M).sql

# 3. Close any stragglers, then swap the database.
PSQL="docker exec taskpad-db-1 psql -U taskapp -d postgres"
$PSQL -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='taskapp' AND pid <> pg_backend_pid();"
$PSQL -c "DROP DATABASE taskapp;"
$PSQL -c "CREATE DATABASE taskapp OWNER taskapp;"

# 4. Restore.
docker exec -i taskpad-db-1 psql -U taskapp -d taskapp -v ON_ERROR_STOP=1 < /root/restore.sql

# 5. Bring the writers back.
docker compose start backend mcp
```

## Step 3 — verify

```
scripts/verify-taskpad.sh > /root/after-restore.txt
diff /root/taskpad-baseline.txt /root/after-restore.txt
```

Row counts will differ by whatever happened between the dump and now — that is expected and
is exactly the data the restore has discarded. Everything else should match. Then confirm by
hand: load the web app, and call `list_projects` from Claude.

## Notes

- **Nothing here touches the Docker volume.** `taskpad_postgres_data` stays mounted
  throughout; only the database inside it is replaced. Do not delete the volume as part of a
  restore — that is a different, much worse operation.
- **The dumps are unencrypted**, by explicit choice, so that recovery never depends on
  finding a passphrase.
- **Restoring loses everything written since the dump.** The nightly runs at 03:00, so
  worst case is just under 24 hours of notes and tasks.
