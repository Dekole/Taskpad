# Taskpad Suite — Unified Architecture Spec

> **This is the architecture reference — what the system *is* and why.**
> For *what we did, in what order, and where we are now*, see
> [`taskpad_suite_steps.md`](taskpad_suite_steps.md) (currently **Step 12**).
> Section numbers here (`§`) are unrelated to step numbers there.
> Every section below carries its own status banner.

**Status as of 2026-09-06 — re-verified live, not just re-read from docs:**
- ✅ **DONE**: §2-6 Postgres cutover + Taskpad_MCP relocation to VPS (`20260808_...Execution1`) — confirmed live, `list_projects` returns real data.
- ✅ **DONE**: §9 Postgres backup, Home Server → local + Google Drive (`20260814_...Execution2`).
- ✅ **DONE**: §8a local project-notes sync — `get_project_all_notes` tool + `taskpad-notes-sync` Skill (`20260815_...Execution3`) — confirmed live, tool call returned correct flattened doc.
- ⬜ **NOT STARTED**: §8 nested Obsidian vault export (`GET /pad/tree` → folder tree of `.md` files) — distinct from §8a, never built.
- ⬜ **NOT STARTED**: §2 phased-plan item 2, frontend tree UI (`task-app`).
- ⬜ **NOT STARTED**: §7 background summarizer job.
- ⚠️ **Resolved 2026-09-06**: the stale `taskpad` MCP registration in Claude Code (pointing at the decommissioned Home Server IP) was repointed to `https://taskpad.duckdns.org/mcp`. Its bearer token was **not** re-verified — if it was rotated since the VPS relocation, expect an auth error rather than a connection error.

**Added 2026-09-06 (planned, not yet built):**
- ⬜ **§8b local work-context store** (`~/taskpad-vault/context/`) — the one local source of truth in this design; a scoped exception to §1.
- ⬜ **§9b laptop git backup vault** (`~/taskpad-vault/`) — second backup path covering local files, which §9 does not cover at all.
- ⚠️ **Untested restore path** for both §9 and §9b — backups exist, recovery is unverified. See §9b.
- ⚠️ **`~/TaskpadNotes/` is stale** — last synced 2026-08-16 (2026-08-19 for `journal.md`); missing `skills.md` and 5 journal entries. Superseded by `~/taskpad-vault/notes/`.

Supersedes the file-based design in `claude_Todo.md` (Phases 1-6, all shipped and working — Tailscale bridge, OAuth, stateful MCP sessions). This doc covers the shift from "flat notes for voice capture" to a structured personal knowledge system: hierarchical notes/people/journal, existing task list, phone/browser UI, automated summarization.

## 1. Decisions locked in (2026-08-08)

> **📋 REFERENCE — not a work item.** Decisions, not tasks. Still current; one exception
> added 2026-09-06 (§8b).

- **Single shared datastore**: Postgres (existing `taskpad-db-1` on the VPS) becomes source of truth for tasks, tree/notes, people, journal. `Taskpad_MCP` stops owning its own file storage and becomes an API client of `Taskpad App`'s backend.
- **DB stays on the VPS**, not the home server. Rationale: it's already there, running, serving `Taskpad App`'s UI; round-tripping every phone/browser interaction over Tailscale to home hardware adds latency for no benefit. Accepted tradeoff, not an accident — durability handled via backup (below), not by relocating the DB.
- **Hierarchy**: Obsidian-style nesting, capped at **5 levels deep** (enforced in the API, not assumed infinite).
- **Backup target: Google Drive.** No encryption for v1 — user explicitly does not want decrypt friction. Revisit only if requested later; do not add silently.
- **Local Obsidian access**: solved via a scheduled/on-demand **export** job (DB → local markdown vault), not live file access. Same export also satisfies Claude Code's original "just grep local files" use case — one mechanism, two consumers. Claude Code does **not** need direct DB/API dependency for casual browsing.
- **Scoped exception to "Postgres is source of truth" (added 2026-09-06)**: hand-authored *work context* (§8b) deliberately does **not** live in Postgres — the user's explicit intent is to keep bulk reference material out of Taskpad rather than pollute the note store. That local directory is therefore the sole source of truth for its own contents, and is the one local location in this design that is **not** derived and **not** regenerable. Everything else local (§8, §8a) remains derived and disposable. See §8b.
- **Auto-summarization**: both mechanisms wanted — (a) Claude calls an MCP tool mid-conversation to write/update a summary, and (b) a separate scheduled background job re-mines raw notes and regenerates summaries independently of any live conversation.

## 2. Current state (as of audit, do not re-derive — verified by reading code)

> **⚠️ HISTORICAL SNAPSHOT (2026-08-08) — do NOT read as current.** This describes the
> system *before* Execution 1. Since superseded: `Taskpad_MCP` no longer has flat-file
> storage (`storage.ts` deleted, now `api-client.ts`), the `pad` table exists, and
> **`POSTGRES_PASSWORD` was rotated** — the value printed below is dead. Kept for the
> audit trail only.

- `task-app/backend`: FastAPI + SQLAlchemy + Postgres 16. Two tables: `users` (id=Google `sub`, email, name), `tasks` (id, user_id, title, category [string, e.g. "gray"/"green"/"yellow"/"red"], due_date, status, task_order, last_modified, never_stale). Flat list, no hierarchy.
- Auth pattern: endpoints take `user_id` as a query/body param and look it up in `users` — **not** a verified session token per request. Fine for a single-user hobby app today; flag as a gap before this DB becomes the target of a second write path (`Taskpad_MCP`) — see §6.
- `taskpad-db-1` Postgres: **not published to the host** (`docker ps` shows bare `5432/tcp`, no `0.0.0.0:5432->`) — already correctly private, only reachable from other containers on the same Docker network. Preserve this; never add a port mapping for it.
- ~~`POSTGRES_PASSWORD=dekoletaskapp` in `task-app/.env` — weak, guessable, sitting in a plaintext env file. **Rotate this**~~ → **✅ ROTATED before Execution 1. This value is dead; not an open action.**
- `Taskpad_MCP` (`taskpad_mcp/`): Node/Express, its own flat-file storage (`storage.ts`), OAuth 2.1 layer reusing `task-app`'s Google client, stateful Streamable HTTP sessions. All working. This is the piece that gets rewired to talk to `task-app`'s API instead of the filesystem.

## 3. Target architecture

> **🟡 MOSTLY BUILT.** Everything above the dashed line is live (Postgres, backend API,
> MCP on the VPS, Home Server backup). Not yet built: the summarizer job (§7) and the
> local vault directories (§8b, §9b) — the layout below is *planned*, not on disk.

```
                         Postgres (VPS, taskpad-db-1)
                         tasks, pad (folders/notes/people/journal)
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
      Taskpad App API      Taskpad_MCP (API client   [NO backup job on the VPS.
      (existing FastAPI,    of Taskpad App API,        The VPS is passive: it is
      + tree/people/         same auth model as        connected TO, and initiates
      journal endpoints,     App — see §6)             nothing. Backups are pulled
      phone/browser UI)              │                 by Home Server (§9) and
                                     │                 laptop (§9b).]
                            Claude (mobile / Code / voice→text)
                                    │
                         Summarizer job (cron or triggered)
                         re-mines pad rows → writes
                         summary field back via API

Derived/local, never source of truth:
  Obsidian vault export (local machine) — pulled via API on schedule or on
  demand, materializes pad rows as nested folders/markdown files. Claude Code
  reads this same folder for raw-file convenience.

Local AND source of truth (the one exception — see §1, §8b):
  ~/taskpad-vault/context/ — hand-authored work context. Never written by any
  sync/export job. Exists nowhere else; if this laptop dies and it isn't
  backed up (§9b), it is gone.
```

### Local directory layout (fixed 2026-09-06, reserves paths for unbuilt §8)

```
~/taskpad-vault/                 git repo, laptop-local, no public remote
├── context/    SOURCE OF TRUTH  hand-authored. No script ever writes here.
├── notes/      derived (§8a)    flat, one .md per PROJECT. Sync-skill target.
├── export/     derived (§9b-A)  one .md per NOTE, id in frontmatter. Backup fidelity.
├── tree/       derived (§8)     RESERVED — nested vault export, not built yet.
└── db/         derived          pg_dump snapshots (§9b-B).
```

Three derived directories, because the same rows get materialized in three
incompatible shapes: one file per *project* (`notes/`, for reading and grepping), one
file per *note* (`export/`, for backup fidelity — preserves boundaries and ids), and
a nested folder tree (`tree/`, §8, unbuilt). Each has its own cleanup/prune step;
pointing any two at one directory would make each delete the other's output.

Only `context/` is authoritative. Everything else here can be deleted and regenerated.

## 4. Data model changes (task-app backend)

> **✅ DONE** (Execution 1, Block 1, 2026-08-10). `pad` table live in Postgres, `JSONB`
> for `metadata_json`. **Not done**: the optional `tasks.parent_pad_id` column — deferred
> with the frontend tree UI, and nothing needs it yet.

New tables (SQLAlchemy models in `task-app/backend/app/db/models.py`):

```python
class Pad(Base):
    __tablename__ = "pad"
    id = Column(String, primary_key=True)  # uuid
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    parent_id = Column(String, ForeignKey("pad.id"), nullable=True, index=True)
    type = Column(String, nullable=False)  # "folder" | "note" | "person" | "journal"
    name = Column(String, nullable=False)
    depth = Column(Integer, nullable=False)  # 1-5, computed on write from parent chain
    content = Column(Text, default="")        # user/Claude-authored body, markdown
    summary = Column(Text, nullable=True)     # auto-generated, separate from content
    summary_updated_at = Column(String, nullable=True)
    metadata_json = Column(JSON, default=dict)  # type-specific fields (tags, relationship, etc.)
    last_modified = Column(String, default="")
```

Rules:
- `depth` computed server-side on create/move; reject writes that would exceed 5.
- `content` vs `summary` are separate fields — the background summarizer must never overwrite `content` (user/Claude raw input), only `summary`.
- **`tasks` table is untouched** for now. Do not force-migrate existing tasks into `pad`. Add nullable `tasks.parent_pad_id → pad.id` so tasks can optionally be organized into the tree for display, without touching existing task-app code paths that already work.
- Journal: model as `type="journal"` rows under a fixed root folder, not a separate table — keeps one query path for "everything under Work > People > X" style browsing.

## 5. API surface to add (task-app backend)

> **🟡 PARTIAL** (Execution 1, Block 2). All routes are *scaffolded and deployed*, but
> only four are exercised by anything today:
> - **Wired + in use**: `GET /pad` (list/filter), `GET /pad/search`, `POST /pad`, `GET /pad/{id}`
> - **Scaffolded, never exercised**: `GET /pad/tree`, `PATCH /pad/{id}`, `PATCH /pad/{id}/summary`, `POST /pad/{id}/move`
>
> `GET /pad/tree` is the blocker for §8; `PATCH /pad/{id}/summary` is the blocker for §7.
> Both exist as untested code — assume neither works until proven.

New router, e.g. `app/routers/pad.py`:
- `POST /pad` — create (parent_id, type, name, content, metadata)
- `GET /pad/{id}` — fetch one, with children list
- `GET /pad/tree?root_id=` — full subtree (for UI rendering and for Obsidian export)
- `PATCH /pad/{id}` — update content/name/metadata
- `PATCH /pad/{id}/summary` — dedicated endpoint for the summarizer job to write summaries without touching content
- `POST /pad/{id}/move` — reparent (revalidate depth ≤ 5)
- `GET /pad/search?q=` — text search across name/content/summary

## 6. Taskpad_MCP rewrite

> **🟡 MOSTLY DONE** (Execution 1, Blocks 4-5, 2026-08-10). `storage.ts` deleted, running
> on `api-client.ts` against the API, relocated to the VPS, service-token auth in place,
> `/api/pad` internal-only. **7 tools live** (verified 2026-09-06): `list_projects`,
> `create_project`, `save_note`, `get_note`, `list_notes`, `search_notes`,
> `get_project_all_notes`.
> **Not built**: `create_folder`, `move_pad`, `summarize_person` — all three named in this
> section, none implemented. Also no `delete_note`/`delete_project` (see requirements doc).

- Remove `storage.ts` (flat-file logic). Replace with an API client module calling the new `task-app` endpoints above.
- **Auth gap to close before this ships**: `task-app`'s current auth is "trust the `user_id` you're given." That was fine when only the App's own frontend (behind Google login in the browser) called it. Once `Taskpad_MCP` — a second, independently-reachable service — writes to the same API, it needs the same level of identity verification `Taskpad_MCP` already built for itself (it already gates on `ALLOWED_GOOGLE_EMAIL` via its own OAuth flow). Simplest fix: `Taskpad_MCP` calls `task-app`'s API using a fixed service credential (shared secret, VPS-internal traffic only, never exposed) rather than reinventing per-request user auth — single-user system, this doesn't need to be more elaborate than that.
- MCP tool surface expands: `save_note`/`get_note`/`list_notes`/`search_notes` map onto the new `/pad` endpoints (project ≈ top-level folder row); add `create_folder`, `move_pad`, `get_project_all_notes` (added 2026-08-15, see §8a), and a `summarize_person`-style tool Claude can call in-conversation per the "Claude decides in-conversation" summarization path.
- Existing static-bearer-token + OAuth dual auth on `/mcp` itself is unaffected — this is about how `Taskpad_MCP` talks *outward* to the DB API, not how clients talk to `Taskpad_MCP`.

## 7. Background summarizer job

> **⬜ NOT STARTED.** Blocked on `PATCH /pad/{id}/summary` (§5, scaffolded but never
> exercised) and on the open trigger-condition question (§12). Lowest priority — depends
> on having content worth summarizing, which now exists (34 notes).

- Separate scheduled process (cron on the VPS, or triggered), not part of the request path.
- Reads pad rows whose `content` changed since `summary_updated_at`, calls the Claude API to regenerate `summary`, writes via `PATCH /pad/{id}/summary`.
- Scope for v1: define trigger condition (time-based sweep vs. explicit "needs resummarize" flag set on write) — **open, decide during implementation**, not blocking the rest of the plan.

## 8. Obsidian / Claude Code export

> **⬜ NOT STARTED.** The *nested* vault export (one file per note in folders). Blocked on
> `GET /pad/tree` (§5, scaffolded, untested). Largely superseded in practice by §8a and
> §9b Tier A, which cover the same "read my notes locally" need without it. `tree/` is
> reserved in the §3 layout if this ever gets built.

- Script (can live in `taskpad_mcp/scripts/` or a new small tool) that calls `GET /pad/tree` and writes each pad row to `<vault>/<path-from-root>/<name>.md`, folders as directories, `content` as the file body, `summary` as a header block or frontmatter.
- Run manually on demand initially; cron later if it proves useful. One-directional (DB → local files) — do not build local-edit-syncs-back for v1, that's a much bigger problem (conflict resolution) and wasn't asked for.

## 8a. Local project-notes sync (added 2026-08-15)

> **✅ DONE, but output is STALE** (Execution 3, 2026-08-16). Tool + Skill both live and
> verified. However `~/TaskpadNotes/` was last synced 2026-08-16 (2026-08-19 for
> `journal.md`) and is missing `skills.md` plus 5 journal entries. **Pending**: retarget
> to `~/taskpad-vault/notes/` and retire the old folder (Step 12).

A second, distinct local-access mechanism alongside §8's nested vault export — one flat
document per project instead of one file per note. Designed with productization in
mind: runs entirely through the MCP connector any customer's Claude Code already has,
no server-side script, no new API surface beyond the one new tool.

- New MCP tool `get_project_all_notes(project?)`: concatenates every note in a project
  into one document. No new backend endpoint - reuses the existing per-project notes
  fetch already in `api-client.ts`, joining each note's `content` (already `# {title}`
  -prefixed by `save_note`, so concatenation alone produces the "one `#` section per
  note" shape with no extra formatting logic).
- Claude Code Skill: for each project (`list_projects` → `get_project_all_notes` per
  project), writes `<location>/<project>.md`. Overwrites in place every run. Prunes
  local files for projects no longer present upstream. Prepends an
  auto-generated/synced-at marker to each file. Target location configurable, defaults
  to `~/TaskpadNotes/`, outside any git repo.
- **Target relocated 2026-09-06** to `~/taskpad-vault/notes/` (see §3 layout). The old
  `~/TaskpadNotes/` default is retired. The prune step is why this must never share a
  directory with §8b's `context/`: it deletes any `.md` it doesn't recognize as a
  current project.
- **The prune rule is prose interpreted by an LLM, not deterministic code.** Its exact
  blast radius (recursion into subdirectories, which extensions it considers) depends on
  how a given model reads `SKILL.md` on a given run. Treat *anything* under the sync
  target as destroyable — do not rely on a subdirectory being "obviously" out of scope.

## 8b. Local work-context store (added 2026-09-06)

> **⬜ NOT STARTED — this is the next step.** Directory does not exist yet. Nothing blocks
> it; it is a `mkdir` plus the discipline of never pointing a sync job at it. Part of
> Step 12.

Hand-authored reference material (meeting notes, docs, scratch research) that the user
wants Claude Code to read, but explicitly does **not** want in Taskpad — keeping the
note store clean is the stated goal, so this is deliberate, not an oversight.

- Location: `~/taskpad-vault/context/`.
- **Source of truth for itself** — the scoped exception to §1. Not derived from Postgres,
  not regenerable, not reachable via MCP.
- **No sync/export job may ever write to or prune this directory.** §8 and §8a both have
  destructive cleanup steps; both are confined to `tree/` and `notes/` respectively.
- Backed up by §9b (git), not by §9 (which only covers Postgres). Without §9b this
  directory has **zero** backup coverage.
- Not exposed through MCP by design — putting it in Postgres is precisely what the user
  wanted to avoid.

## 9. Backup (Postgres — automated)

> **✅ DONE, recovery UNVERIFIED** (Execution 2, 2026-08-15). Daily 3am cron on the Home
> Server → local copy + Google Drive, both retained forever. **Two caveats**: (a) the
> cron's continued health has not been re-checked since 2026-08-15 and can't be from this
> laptop off-LAN (R7); (b) **no dump has ever been restored** (R11). Also worth doing:
> add `--clean --if-exists` to `backup-postgres.sh` to match §9b.

**Updated 2026-08-14** (original version below ran the dump from the VPS; revised to a
pull model with a second destination, per user decision):

- **Pull, not push, and Home Server initiates.** A cron job on the **Home Server** SSHes
  into the VPS over Tailscale (not the public IP/port) to run
  `docker exec taskpad-db-1 pg_dump -U taskapp taskapp`, and pulls the dump down. The VPS
  never holds a credential that lets it reach into the home network — it only ever gets
  connected to. Rationale: VPS is the more exposed machine (public-facing) and was
  already flagged as the higher security priority (§10) — the more-trusted machine
  should hold the credential, not the more-exposed one.
- **Dedicated, forced-command-restricted SSH key.** Not the user's personal key. Added to
  the VPS's `authorized_keys` with a forced command
  (`command="docker exec taskpad-db-1 pg_dump -U taskapp taskapp",no-port-forwarding,no-agent-forwarding,no-pty`),
  so that key can never be used for anything else, even if compromised.
- **Two destinations from one pull**: Home Server keeps a local timestamped copy, and
  separately uploads the same dump to Google Drive via `rclone` (Drive backend, avoids
  writing custom Drive API code). Google Drive credentials (`rclone`'s OAuth token) live
  only on the Home Server, never on the VPS.
- No encryption in v1 per explicit decision — revisit only if asked.
- **Retain forever, on both the local Home Server copy and the Drive side** (revised
  2026-08-14, was "last 14 days" — at current usage, ~50 KB/backup and ~3.9 KB/day of
  new content, a full year of daily snapshots is only ~250-300 MB, negligible against
  either destination's available space; revisit only if that changes).

<details>
<summary>Original version (2026-08-08), superseded above</summary>

- Daily cron on the VPS: `docker exec taskpad-db-1 pg_dump -U taskapp taskapp > dump.sql`, then upload via `rclone` to a Google Drive folder (rclone has a Drive backend, avoids writing custom Drive API code).
- No encryption in v1 per explicit decision — revisit only if asked.
- Retain last N days (e.g. 14), delete older dumps on the Drive side via the same cron script.

</details>

## 9b. Backup — laptop git vault (added 2026-09-06, manual)

> **⬜ NOT STARTED.** Vault does not exist. **Tier A is unblocked and runnable right now**
> (needs no SSH, no passphrase, works while travelling). **Tier B** needs one interactive
> `ssh vps true` unlock. Part of Step 12.

A **second, independent** backup path alongside §9. §9 covers Postgres only and runs
unattended from the Home Server; §9b covers *everything local* and is human-initiated
from the laptop. Neither depends on the other.

| | §9 (Home Server) | §9b (laptop git) |
|---|---|---|
| Covers | Postgres dump | `context/` (§8b) + `notes/` (§8a) + a dump copy |
| Trigger | cron, daily 3am | manual |
| Destination | local disk + Google Drive | local git repo |
| Credential | dedicated forced-command key | MCP connector (A) / personal root key (B) |

### Two tiers, because they need different credentials

Split 2026-09-06 after confirming what actually works while travelling. **Tier A needs
no SSH at all** and is the one to reach for by default; Tier B is authoritative but
gated behind a passphrase prompt.

**Tier A — MCP pull (no SSH, works anywhere, run often).** Uses the already-working
MCP connector over HTTPS — the same path this laptop uses to read notes. No key, no
passphrase, no shell access to anything.
- `list_projects` → `list_notes` per project (captures each note's **id** and exact
  title) → `get_note` per note → write one file per note under `export/`.
- **One file per note, not §8a's concatenated per-project doc.** Per-note files preserve
  exact note boundaries and ids, which the concatenated form loses. §8a's flat docs stay
  useful for reading/grepping; per-note files are what makes this tier restorable.
- **What Tier A does NOT capture** — this is why it is not a complete backup:
  the entire **`tasks` table**, `metadata_json` (including `source_file`, the migration
  idempotency key), `summary`/`summary_updated_at`, `last_modified`, `parent_id`/`depth`
  tree structure, and the `users` row. It is a **content safety net**, not a restore
  image.

**Tier B — `pg_dump` over SSH (authoritative, run when you can type the passphrase).**
- **Network reachability is not the constraint** — verified 2026-09-06 that the VPS's
  port 22 is open from an away-from-home network (it is a public host). The only gate is
  the passphrase on `~/.ssh/digitalocean_dakaboo`. Unlock once per session
  (`ssh vps true`); `ControlPersist 4h` covers the rest.
- **Deviation from §9's security model, stated explicitly**: this path authenticates with
  the user's unrestricted personal `root` key, not the forced-command key. §9's guarantee
  ("that key can never be used for anything else") does **not** apply here. Accepted
  because the pull is interactive and human-initiated — and the passphrase is precisely
  why this path **cannot be cron'd**.

**Do not let Tier A's convenience stand in for Tier B.** Running only Tier A produces a
git history that looks like a healthy backup while silently omitting the tasks table and
every piece of note metadata. Tier B is the one that can actually rebuild the database.

- **Repo**: `~/taskpad-vault/` (layout in §3). `git init`, **no remote, or a private one
  only** — it contains a full DB dump plus employer-internal material (revenue figures,
  departures, performance notes). Consistent with §1's no-encryption decision, so the
  repo's access control *is* the only protection.
- **Home Server is not on the laptop's path.** Verified 2026-09-06: `homeserver`
  (`192.168.1.132`) is unreachable when off the home LAN. Both tiers go straight to the
  VPS, so §9b works from anywhere without the Home Server.
- **Dump uses `pg_dump --clean --if-exists`**, unlike §9's plain `pg_dump`. Without those
  flags a dump only restores into an *empty* database; with them, restore is repeatable
  into a live one. §9's `scripts/backup-postgres.sh` should be updated to match.
- **Restore has never been tested** (as of 2026-09-06) — for either §9 or §9b. Backups
  exist; *recovery* is unverified. Highest-value next step is one rehearsal into a scratch
  database on the VPS (`createdb taskapp_restoretest`, load, count rows, drop), never
  against the live DB.
- **`notes/` is a fallback restore source only, not the primary one.** Even as per-note
  files (Tier A) it omits everything listed above; §8a's concatenated form additionally
  loses note boundaries and carries a known double-heading artifact on dedup-suffixed
  titles (Execution 3 notes). The SQL dump is the real restore path.
- **Public `/healthz` is not routed** (corrected 2026-09-06: returns HTTP 404 through
  Caddy, which proxies only `/mcp*` and `/.well-known/oauth-authorization-server` to the
  MCP container). Use an actual MCP tool call to prove liveness from off-box; `/healthz`
  works only against the VPS's loopback debug port `127.0.0.1:3003`.

## 10. Security priorities (user-stated: VPS security is the higher concern, more than Google trust)

> **🟡 3 of 4 DONE.** Item 1 ✅ rotated (before Execution 1 — the value printed below is
> **dead**, left only for the audit trail). Item 2 ✅ closed via `X-Service-Token` +
> making `/api/pad` internal-only. Item 3 ✅ still correct, but **re-verify** (R14) —
> it's a "don't regress" item, not a one-time fix. Item 4 ⬜ **never done** — SSH
> hardening and OS/Docker patch currency on the VPS remain unaudited.

Concrete, in priority order:
1. ✅ **DONE — `POSTGRES_PASSWORD` rotated** (by the user, before Execution 1). The old value `dekoletaskapp` is dead; it appears here and in §2 only as part of the audit trail. Do not treat it as live.
2. Close the auth gap in §6 before `Taskpad_MCP` gets a second write path into the DB.
3. Confirm `taskpad-db-1` never gets a published port when this is extended (already correct today — just don't regress it).
4. Out of scope for this doc but worth a pass separately: SSH hardening (key-only, fail2ban) and OS/Docker patch currency on the VPS — not audited here, flagging as a gap.

## 11. Phased implementation plan

> **📋 INDEX.** Original 2026-08-08 phase list, kept for the record. The live
> chronological record now lives in [`taskpad_suite_steps.md`](taskpad_suite_steps.md).
> Renumbered **P1-P7** so these can't be confused with `§` section numbers.

P1. ✅ **DONE** — **Schema + API**: add `pad` table + router to `task-app` backend. No `Taskpad_MCP` changes yet — testable standalone via the existing frontend or curl.
P2. ⬜ **NOT STARTED** — **Frontend tree UI**: `task-app` frontend gets a tree view (Work > People > LorinS style) alongside the existing task list.
P3. ✅ **DONE** — **Taskpad_MCP rewrite**: swap `storage.ts` for the API client; add service-credential auth to `task-app`'s API (§6); update MCP tool surface. (Includes §8a's `get_project_all_notes` tool, added 2026-08-15.)
P4. ⬜ **NOT STARTED** — **Obsidian/Claude Code export script** (§8, nested vault tree — distinct from §8a's flat per-project doc, which *is* done).
P5. ✅ **DONE** — **Backup cron** (§9) — independent of the above, can happen any time, do early since it's low-risk/high-value.
P6. ⬜ **NOT STARTED** — **Background summarizer** — last, depends on real content existing in `pad` to summarize.
P7. ⬜ **NOT STARTED** — **Vault + local backup** (§8b, §9b): create `~/taskpad-vault/`, run a **Tier A** MCP-only pull (no SSH needed — do this first, it works while travelling), `git init`, first commit. Then **Tier B** (`pg_dump`) and the **restore rehearsal** (R11) when a passphrase prompt is convenient.

## 12. Open questions (explicitly unresolved, do not assume)

> **🟡 STILL OPEN.** None are blocking Step 12. Q1 blocks §7 only; Q3 blocks the frontend
> tree UI only.

- Exact trigger condition for the summarizer job (§7).
- Whether `metadata_json` needs a defined shape per type now or can stay freeform until real usage patterns emerge.
- Whether the phone/browser UI needs real-time updates (e.g. if Claude writes a note while the App is open) or a simple refresh-on-load is acceptable for v1.
