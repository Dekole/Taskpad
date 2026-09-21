# Taskpad Suite — Step-by-Step Record

> ## ▶ YOU ARE HERE: **Step 12** — build the local vault (`~/taskpad-vault/`) and back it up
> Nothing in Step 12 is started yet. Tier A of the backup needs no SSH and can run today.

Chronological record of every step actually executed, newest work at the bottom. One
line per step, with a link to the detailed doc that covers it.

**How the docs fit together** — three files, three jobs, no overlap:

| Doc | Answers | Shape |
|---|---|---|
| **this file** | *What did we do, in what order? Where are we?* | numbered steps, chronological |
| `taskpad_suite_spec.md` | *What is the system? Why is it built this way?* | architecture reference, §1-§12 |
| `taskpad_suite_requirements.md` | *Does it still work?* | testable requirements R1-R16 |

⚠️ **Step numbers here are independent of `§` section numbers in the spec.** Step 12 is
not spec §12. When they're both in play, say "Step 12" or "spec §9b" — never bare "7".

---

## Stage 1 — Postgres cutover (Execution 1, 2026-08-08 → 08-10)

Full detail: [`20260808_TaskpadSuite_Execution1_PadAndMCP.md`](20260808_TaskpadSuite_Execution1_PadAndMCP.md) · spec §4, §5, §6

| # | Step | Status |
|---|---|---|
| 1 | **Back up the flat-file notes** before touching anything — tar snapshot + git-based `backup-notes.sh`, cron'd every 15 min on the Home Server | ✅ done 08-09 |
| 2 | **Add the `pad` table** to `task-app`'s Postgres schema (`JSONB` metadata, self-referencing `parent_id`, depth capped at 5) | ✅ done |
| 3 | **Add the `pad` API + service-token auth** — full route surface scaffolded, 4 routes wired (`GET /pad`, `GET /pad/search`, `POST /pad`, `GET /pad/{id}`) | ✅ done |
| 4 | **Migrate flat notes into Postgres** via `scripts/import-notes.ts`, idempotent, keyed on original filename | ✅ done |
| 5 | **Cut over + relocate Taskpad_MCP to the VPS** — `storage.ts` → `api-client.ts`, OAuth state copied so the phone never had to re-authenticate | ✅ done 08-10 |
| 6 | **Harden**: make `/api/pad` internal-only, unreachable from the public internet | ✅ done |
| 7 | **End-to-end verification** of all 6 tools against real data | ✅ done 08-10 |

**Bugs found and fixed during this stage** (detail in Execution 1's notes): migration
dropped a real note as a false duplicate (two notes shared an H1); `.git` got imported
as a bogus project; a bad Caddyfile matcher caused a brief **full site outage**;
`docker compose restart` silently doesn't reload `.env`.

## Stage 2 — Postgres backup (Execution 2, 2026-08-14 → 08-15)

Full detail: [`20260814_TaskpadSuite_Execution2_PostgresBackup.md`](20260814_TaskpadSuite_Execution2_PostgresBackup.md) · spec §9

| # | Step | Status |
|---|---|---|
| 8 | **Home Server → VPS connection**: dedicated SSH key restricted by forced command so it can only ever run `pg_dump` | ✅ done |
| 9 | **Daily local pull** — `backup-postgres.sh`, cron 3am, kept forever | ✅ done |
| 10 | **Upload to Google Drive** via `rclone`, kept forever; Drive token lives only on the Home Server | ✅ done 08-15 |

Why it was urgent: after Stage 1 the notes lived *only* in Postgres on the VPS, with
zero backup coverage. Design is **pull, not push** — the VPS never holds a credential
reaching into the home network.

## Stage 3 — Local notes access (Execution 3, 2026-08-15 → 08-16)

Full detail: [`20260815_TaskpadSuite_Execution3_LocalVaultExport.md`](20260815_TaskpadSuite_Execution3_LocalVaultExport.md) · spec §8a

| # | Step | Status |
|---|---|---|
| 11 | **`get_project_all_notes` MCP tool** + **`taskpad-notes-sync` Skill** — pulls every project down to local markdown | ✅ done 08-16 |

Bug found: ~17% of notes don't start with a clean `# Title`, so section boundaries broke.
Fixed by always prepending the reliable `name` field.

## Stage 4 — Local vault + laptop backup ◀ **CURRENT**

Detail: spec §8b, §9b · verified by R9, R10, R15, R16

| # | Step | Status |
|---|---|---|
| 12a | Create `~/taskpad-vault/` (`context/`, `notes/`, `export/`, `db/`), `git init`, no public remote | ⬜ **not started** |
| 12b | **Tier A backup** — pull every note via MCP into `export/`. No SSH, no passphrase, works while travelling | ⬜ **not started, unblocked** |
| 12c | Retarget the sync Skill to `~/taskpad-vault/notes/`, retire `~/TaskpadNotes/` | ⬜ not started |
| 12d | **Tier B backup** — `pg_dump` over SSH into `db/`. Needs one interactive passphrase unlock | ⬜ not started |
| 12e | **Restore rehearsal (R11)** — prove a dump actually restores, into a scratch DB, never live | ⬜ **not started — oldest unverified assumption** |

## Not started, not scheduled

Deferred deliberately — none block Stage 4.

| Item | Spec | Why it's waiting |
|---|---|---|
| Frontend tree UI | §11 phase 2 | never prioritized |
| Nested Obsidian vault export | §8 | blocked on untested `GET /pad/tree`; largely covered by Step 11 + 12b |
| Background summarizer | §7 | blocked on untested `PATCH /pad/{id}/summary` + open trigger question |
| `create_folder` / `move_pad` / `summarize_person` tools | §6 | named in the spec, never built |
| `delete_note` / `delete_project` tools | — | absent; why the test suite can't clean up after itself |
| VPS SSH hardening + patch currency | §10 item 4 | flagged 2026-08-08, never audited |

## Open risks carried forward

1. **No restore has ever been tested** — for either backup path. Step 12e.
2. **`~/TaskpadNotes/` is stale** — last synced 08-16 (08-19 for `journal.md`); missing
   `skills.md` and 5 journal entries. Superseded by Step 12c.
3. **Notes scattered across projects** — the real 08-03 first-day entry and a duplicated
   08-04 career note sit in `default`/`ProjectJournal` rather than `journal`. Nothing
   lost, just not where you'd look.
4. **`scripts/test-taskpad.ts` has never run** — written 08-16, extended 09-06, but this
   laptop has no working Node, so it is unverified code.
5. **Possible stale backup cron on the VPS** — the superseded 2026-08-08 design had the
   VPS pushing to Drive. If a leftover cron is still there it holds credentials the
   current design says it must not. Unchecked (R12).
