# Taskpad Suite — Key Requirements

<!-- LAST_RUN --> **Last run:** never — run `npm run test:live` (needs `MCP_AUTH_TOKEN`).

Brief, testable requirements for the live system. Each has a stable ID referenced by
`scripts/test-taskpad.ts`. Not a design doc — see `taskpad_suite_spec.md` for that.
IDs are **append-only**: never renumber, the test script's output maps to them.

## Who does what (the short answer)

Three machines. The key thing to hold onto: **the VPS is passive.** It holds the data
and gets connected to. It initiates nothing, backs up nothing, and holds no credential
that reaches into the home network.

| | **VPS** (`taskpad.duckdns.org`) | **Home Server** (`192.168.1.132`) | **Laptop** (this machine) |
|---|---|---|---|
| **Role** | Runs everything live | Unattended backup | Working copy + manual backup |
| **Holds** | Postgres `taskpad-db-1` — **source of truth** for all notes/tasks | Dump copies (forever) + Google Drive token | `~/taskpad-vault/` — `context/` is source of truth for itself (§8b) |
| **Runs** | `taskpad-db-1`, `task-app` backend, `taskpad-mcp`, Caddy | Daily 3am cron: pull dump → local + Drive (§9) | Claude Code; manual sync + git commit (§9b) |
| **Initiates** | **Nothing.** No cron, no outbound backup. | SSH → VPS over Tailscale, forced-command key | MCP over HTTPS (Tier A); SSH with personal key (Tier B) |
| **Reaches VPS how** | — | Tailscale (never public internet) | **Tier A**: MCP/HTTPS, no credential prompt, works anywhere. **Tier B**: public SSH, passphrase-gated → **cannot be cron'd** |
| **Reaches Home Server** | ❌ never (by design) | — | ❌ only on home LAN (unreachable off-LAN) |

**Away from home, the laptop still reaches the VPS.** Verified 2026-09-06: port 22 is
open from an outside network and the MCP endpoint responds. Distance is not the
constraint — the passphrase on the SSH key is, and only for Tier B. Tier A needs no
credential at all. What is genuinely unreachable off-LAN is the **Home Server**.

**If you remember the VPS running an `rclone` backup to Drive — that was the original
2026-08-08 §9 design, and it was superseded.** It now lives in a collapsed "Original
version" block in the spec, which is probably where the memory comes from. The VPS
should have no backup cron at all today. See **R12** — worth actually verifying, since
a leftover cron there would be pushing to Drive with credentials the current design
says the VPS must not hold.

## Requirements

**Known gap**: `Taskpad_MCP` has no `delete_note`/`delete_project` tool, so the test
program can't truly clean up after itself. It reuses one fixed, clearly-named project
(`_taskpad_test`) and overwrites the same note in place every run instead of creating
new ones. That project will always appear in `list_projects` — expected, not a bug.

### MCP tool surface — automated by `npm run test:live`

| ID | Requirement | Checked by |
|----|---|---|
| R1 | `list_projects` returns at least one project, no error | live tool call |
| R2 | `save_note` + `get_note` round-trip: content written is exactly what's read back | live tool call, `_taskpad_test` project |
| R3 | `list_notes` works both project-scoped and across all projects | live tool call |
| R4 | `search_notes` finds a note by a substring unique to that run | live tool call |
| R5 | `get_project_all_notes` includes the just-written note as its own `#`-headed section | live tool call |
| R6 | `create_project` is idempotent — calling it twice on the same name doesn't error | live tool call |

### Local files — partly automated

| ID | Requirement | Checked by |
|----|---|---|
| R8 | Sync output (`~/taskpad-vault/notes/*.md`) has one file per current project, no orphans | script: live tool call vs. directory listing; **skipped** if dir absent |
| R9 | A sync run leaves `~/taskpad-vault/context/` **byte-for-byte unchanged** (§8b's core guarantee) | script: hash `context/` before + after a sync |
| R10 | `~/taskpad-vault/` git repo has **no public remote** (holds a DB dump + employer-internal material) | script: `git remote -v` is empty or private-only |

### Backup and recovery — manual, needs machine access

| ID | Requirement | Checked by |
|----|---|---|
| R7 | Postgres backup (Home Server local + Google Drive) is fresh (<26h old) | **manual, on Home Server** — laptop can't reach it off-LAN |
| R11 | **A dump actually restores.** Load latest dump into a scratch DB on the VPS, row counts match live | **manual rehearsal** — `createdb taskapp_restoretest`, load, count, drop. Never against live DB. |
| R12 | VPS runs **no** backup cron (no leftover from the superseded 2026-08-08 design) | **manual, on VPS** — `crontab -l` and `ls /etc/cron.d/` are clean of rclone/pg_dump jobs |
| R15 | **Tier A (MCP-only) vault pull** captures every note in every project as its own file in `export/`, with its id | script: compare `export/` file count + ids against `list_notes` across all projects |
| R16 | The vault contains a **Tier B dump newer than the newest Tier A pull**, or flags that it doesn't | script: compare mtimes; FAIL if `db/` is missing or badly stale, so Tier A can't masquerade as a full backup |

### Security regressions — from plan §10

| ID | Requirement | Checked by |
|----|---|---|
| R13 | `/api/pad/*` is **not** reachable from the public internet (Execution 1 Block 5 hardening) | `curl https://taskpad.duckdns.org/api/pad` → no route / 404 |
| R14 | Postgres has **no published host port** (`docker ps` shows bare `5432/tcp`) | **manual, on VPS** |

**R11 is the most important unmet requirement in this document.** Both backup paths
(§9 and §9b) are unverified for *recovery* — backups exist, restore has never been
tested. Until R11 passes once, "we have backups" is an assumption, not a fact.

**R16 exists to stop a specific failure mode**: Tier A (MCP-only) is easy and needs no
passphrase, so it will get run often, while Tier B gets skipped. The vault then grows a
convincing git history that omits the `tasks` table and all note metadata. R16 makes
that gap loud instead of invisible.

## Running it

```
export MCP_AUTH_TOKEN=<the static bearer token, same one Execution 1's side-port test used>
npm run test:live
```

Optional: `PUBLIC_BASE_URL` (defaults to `https://taskpad.duckdns.org`).

Rerun anytime — R2/R4/R5/R6 are idempotent (fixed test project + note, overwritten each
run), safe to run repeatedly without accumulating junk beyond the one `_taskpad_test`
project. The script rewrites the "Last run" line above and appends a row to the run log
below on every execution.

R7 / R11 / R12 / R14 are **not** covered by the script (they need shell access to the
VPS or Home Server) and must be run by hand. The script reports them as SKIP rather
than silently passing.

## Run log

(newest first, appended automatically by `scripts/test-taskpad.ts`)
