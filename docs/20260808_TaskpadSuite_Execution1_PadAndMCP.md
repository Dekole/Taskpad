# Taskpad Suite Execution 1: pad schema + Taskpad_MCP Postgres cutover + relocation

**Status: DONE. All 6 blocks executed and verified 2026-08-10.** See "Execution notes"
at the end of this doc for what actually happened, bugs found/fixed, and deviations from
the original plan.

**Scope**: first implementation slice of `taskpad_suite_spec.md`. Back up the existing
flat-file notes, add a `pad` table + minimal API to `task-app`, import all existing
notes into Postgres, then rewrite Taskpad_MCP to use the API instead of the filesystem
**and relocate it from the Home Server to the VPS**. Nothing from the spec has been built
prior to this doc — confirmed by direct audit of both repos (`git log`, `models.py`,
`storage.ts`) on 2026-08-08.

> Naming note: the table was originally called `nodes` in early drafts of this plan and
> in `taskpad_suite_spec.md` §4/§5. Renamed to `pad` on 2026-08-08 to fit the Taskpad
> theme — table `pad`, model class `Pad`, router `app/routers/pad.py`, service
> `app/services/pad_service.py`, API prefix `/api/pad`. Both docs use `pad` throughout.

## Plan

0. Snapshot and version the existing flat-file notes on the Home Server before anything
   else touches them.
1. Add a new `pad` table to `task-app`'s Postgres schema, matching existing model
   conventions, without touching the existing `tasks` table.
2. Add a minimal, service-token-gated `pad` API router to `task-app`'s backend —
   scaffolding the full spec surface but wiring up only what's needed this round.
3. Import all existing flat-file notes into the new `pad` table via the API,
   idempotently, while the live MCP connector keeps running untouched on the Home Server.
4. Rewrite Taskpad_MCP to call the new API instead of the filesystem and relocate it to
   the VPS, using a side-port pre-test, a copied OAuth state, and a staged Caddy route
   flip so the live Claude mobile connector isn't disrupted.
5. Once the VPS deployment is confirmed working, make the `pad` API internal-only —
   reachable over the VPS's internal Docker network, not the public internet — since MCP
   no longer needs the public route.
6. Confirm all 6 MCP tools work end-to-end against real data and that the Home Server is
   no longer a dependency.

## User priorities driving scope (stated 2026-08-08)

1. Protect the existing notes before anything else touches them.
2. Get the `pad` Postgres schema right.
3. Get Taskpad_MCP rewired to Postgres quickly.
4. Import all existing notes into Postgres.
5. (Added after reviewing the first draft of this plan) Relocate Taskpad_MCP itself from
   the Home Server to the VPS, and make the `pad` API internal-only (not reachable over
   the public internet) once that relocation lands — see "Why relocate" below.

**Explicitly out of scope this round** (confirmed with user): `task-app` frontend/tree
UI, `tasks.parent_pad_id` column, new MCP tools (`create_folder`/`move_pad`/
`summarize_person`), background summarizer, Obsidian export script. `POSTGRES_PASSWORD`
rotation was already done separately by the user — not part of this execution.

The full `pad` API is scaffolded per spec §5 (low cost to write correctly alongside
what we need), but only a subset is wired up and exercised this round — see Block 2.

## Why relocate Taskpad_MCP to the VPS

Taskpad_MCP currently runs on the **Home Server** (Tailscale IP `100.125.184.106`) —
that's where the flat-file notes live, which was the entire reason it was placed there
originally (`claude_Todo.md` Phase 2). The VPS was added later purely as a stateless
public gateway: Claude mobile already talks to the VPS's public URL
(`taskpad.duckdns.org/mcp`) today, and Caddy there proxies over Tailscale to the Home
Server's actual MCP process.

Once this migration lands, MCP no longer stores anything locally — its only job is
calling `task-app`'s API, which lives on the VPS. Leaving MCP on the Home Server after
that point means every call does an unnecessary round trip (VPS → Tailscale → Home
Server → back out to the VPS again → Postgres) and keeps the whole system dependent on
the Home Server and the Tailscale link staying up, for zero remaining benefit. Relocating
MCP to the VPS collapses this to Claude mobile → VPS Caddy → MCP (local) → `backend`
(local Docker network call) → Postgres (local) — no Tailscale hop, no Home Server
dependency — and lets the `pad` API be made internal-only, no longer reachable over the
public internet at all (see Block 5), which is closer to the spec's original
"VPS-internal only, never exposed"
intent for the service-credential call than the first draft of this plan achieved.

`docs/Taskpad_Suite_claude.drawio` reflects the target state: Taskpad_MCP is yellow/"VPS".

## Continuity guarantee for the live Claude ↔ MCP connector

**User requirement (2026-08-08): the currently-working mobile connector must not be
disrupted, and a brief Caddy-restart blip is acceptable, but a forced reconnect should be
avoided if cheap to avoid — confirmed it is cheap, so it stays in scope.**

- **Blocks 0-3 are zero-risk.** They only touch `task-app`'s backend and local files.
  Taskpad_MCP's OAuth layer (`oauth.ts`) talks to Google directly via its own copied
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, not to `task-app`'s backend at request time —
  so even the backend restarts in Blocks 1-2 have no effect on live MCP traffic. The Home
  Server instance keeps serving `/mcp`, completely untouched, through Block 3.
- **Block 4 is the only block that touches anything MCP-related**, and carries three
  safeguards, all confirmed in scope:
  1. **Side-port pre-test.** Deploy the new VPS instance and validate it on a
     host-published test port with `curl` + the static `MCP_AUTH_TOKEN` bearer token —
     exercises the API-client → `backend` → Postgres path end to end — **before the live
     `/mcp` route is touched at all**. Catches env var typos, network misconfig, and
     `api-client.ts` logic errors while the production connector is still unaffected.
  2. **OAuth-state copy.** Copy `data/oauth/` (registered client + issued-code state) and
     the exact same `MCP_JWT_SECRET`, `MCP_AUTH_TOKEN`, `GOOGLE_CLIENT_ID`,
     `GOOGLE_CLIENT_SECRET`, `ALLOWED_GOOGLE_EMAIL` from the Home Server to the VPS
     deployment before first boot — confirmed cheap (one `scp` + copying existing secret
     values into the new `.env`, a few minutes). Means the already-registered mobile
     connector and any live JWT are still recognized after cutover — no forced
     reconnect/re-authentication.
  3. **Home Server stays as rollback until confirmed.** Not decommissioned until mobile
     tool calls are confirmed working post-cutover. Rollback = one Caddyfile line back to
     `100.125.184.106:3002` + `docker restart taskpad-caddy-1`, documented as a
     ready-to-paste command in Block 4.
  - Joining `taskpad-mcp` to `task-app`'s existing Docker network (Block 4 step 3) is a
    one-directional operation from the new container's side — does **not** require
    modifying or recreating the already-running `backend`/`caddy` containers, so it adds
    no additional blip beyond the Caddyfile-edit one below.
- **Accepted, unavoidable caveat**: the Caddy restart itself (required to pick up any
  Caddyfile edit, in both Block 4 and Block 5) causes a brief (typically a few seconds)
  blip to *all* `taskpad.duckdns.org` traffic — not just `/mcp`, also `/api/*` and the
  frontend — because it's a single shared Caddy container serving both apps. User has
  confirmed this is acceptable; not a blocker.

## Execution model / constraints

- No SSH/Tailscale access from the assistant's session to the Home Server or the VPS.
  Every step that must run on those machines is a copy-pasteable command block for the
  user to run, with output reported back. Only local files in `task-app/` and
  `taskpad_mcp/` get edited directly.
- `task-app`'s `backend` container has **no host port mapping** — reachable only via the
  VPS's Caddy container (container name `taskpad-caddy-1`), which proxies `/api/*`
  publicly at `taskpad.duckdns.org` today.
- **`task-app/Caddyfile` in this repo is stale.** `git log -- Caddyfile` shows only one
  commit, predating the `/mcp` route (added by editing the file directly on the VPS via
  `scp`, per `claude_Todo.md` Phase 5, never committed back). **Before any Caddyfile edit
  in Block 5, fetch the live version first**:
  ```
  docker exec taskpad-caddy-1 cat /etc/caddy/Caddyfile
  ```
  Editing from the stale local copy would silently drop the working `/mcp` and
  `/.well-known/oauth-authorization-server` routes and break the Claude mobile connector.
- `task-app` backend has **no Alembic** — schema changes apply via
  `Base.metadata.create_all()` on startup (new tables only, never alters existing ones).
- **Sequencing note**: the `pad` API stays on the public `/api/*` route (behind the
  service token) through Blocks 2-4, so the migration script (Block 3) can hit it over
  plain HTTPS from wherever the flat files currently are — no dependency on Docker-internal
  networking. It only becomes internal-only (no longer reachable over the public
  internet) in Block 5, *after* MCP has actually relocated to the VPS and no longer needs
  the public path. Locking it down any
  earlier would break the migration script, since Docker-internal names like `backend:8080`
  only resolve inside containers on that network, not from the Home Server.

---

## Block 0 — Back up the flat-file notes (Home Server, do first, before any code change)

Dumb out-of-place copy first, then wire up the existing but never-activated git-based
backup script, then cron it.

1. Plain compressed snapshot, outside the docker volume/repo entirely:
   ```
   tar czf ~/taskpad-notes-backup-$(date +%Y%m%d-%H%M%S).tar.gz -C ~/projects/taskpad_mcp/data notes
   ```
2. `scripts/backup-notes.sh` currently has no `git init` guard (will fail "fatal: not a
   git repository" as-is). Fix locally in this repo checkout first — add:
   ```sh
   if [ ! -d .git ]; then git init -q; fi
   ```
   before the `git add -A` line — then deploy the updated script to the Home Server and
   run it once:
   ```
   cd ~/projects/taskpad_mcp && git pull   # or scp the updated script over
   ~/projects/taskpad_mcp/scripts/backup-notes.sh
   ```
3. Cron it for ongoing snapshots (adjust user/path to match the Home Server):
   ```
   (crontab -l 2>/dev/null; echo "*/15 * * * * /home/USER/projects/taskpad_mcp/scripts/backup-notes.sh") | crontab -
   ```

No repo code is touched by anything else until this block is confirmed done.

---

## Block 1 — `pad` table (`task-app/backend`)

Add to `backend/app/db/models.py`, matching the existing `Task`/`User` style exactly
(old-style `Column(...)`, explicit `str(uuid.uuid4())` id generation in the service
layer, no DB-side defaults):

```python
from sqlalchemy.dialects.postgresql import JSONB

class Pad(Base):
    __tablename__ = "pad"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    parent_id = Column(String, ForeignKey("pad.id"), nullable=True, index=True)
    type = Column(String, nullable=False)  # "folder" | "note" | "person" | "journal"
    name = Column(String, nullable=False)
    depth = Column(Integer, nullable=False)  # 1-5, server-computed, reject if > 5
    content = Column(Text, default="")
    summary = Column(Text, nullable=True)
    summary_updated_at = Column(String, nullable=True)
    metadata_json = Column(JSONB, default=dict)
    last_modified = Column(String, default="")
```

- **`JSONB`, not generic `JSON`** — same effort now, avoids a manual `ALTER TABLE` later
  (no Alembic in this repo).
- This round only ever creates `type="folder"` (project, `parent_id IS NULL`, `depth=1`)
  and `type="note"` (child of a folder, `depth=2`). `person`/`journal` unused for now.
- `create_all()` picks up the new table on next backend restart/reload — brand-new table,
  not an alter of `tasks`. **Not** adding `tasks.parent_pad_id` this round (frontend-tree
  -only, deferred).
- Deploy: `backend`'s Dockerfile runs `uvicorn --reload` against a volume-mounted
  `./backend:/app`, so this takes effect on next reload without an image rebuild —
  `docker compose restart backend` on the VPS if it doesn't pick it up automatically.

---

## Block 2 — Minimal `pad` API + service-token auth (`task-app/backend`)

### Auth: `require_service_token`

Router and auth dependency ship together, never a bare unauthenticated router even
briefly — the `pad` API is reachable via Caddy's public `/api/*` route through Block 4
(see sequencing note above; it becomes internal-only in Block 5, not before).

```python
# app/routers/pad.py
import os, secrets
from fastapi import APIRouter, Depends, Header, HTTPException

def require_service_token(x_service_token: str = Header(...)):
    expected = os.getenv("TASKPAD_SERVICE_TOKEN", "")
    if not expected or not secrets.compare_digest(x_service_token, expected):
        raise HTTPException(status_code=401, detail="Invalid service token")

router = APIRouter(dependencies=[Depends(require_service_token)])
```

Generate the real secret with `openssl rand -hex 32` (not memorable). Add to
`task-app/.env` on the VPS as `TASKPAD_SERVICE_TOKEN=...`, placeholder in `.env.example`.
`docker compose restart backend` required (env var change, not picked up by `--reload`).

### Service layer: `app/services/pad_service.py`

Mirror `task_service.py` style (free functions `fn(db, user_id, ...)`, `_serialize()`
helper, explicit `db.commit()`/`db.refresh()`).

- `create_pad`: if `parent_id` given, `db.get(Pad, parent_id)` — 404 if missing, verify
  it belongs to the same `user_id` before using it (nothing else enforces cross-user tree
  isolation). Depth = `1 if parent_id is None else parent.depth + 1` (no chain-walk —
  every pad row already stores its own depth). Reject with 400 if depth > 5.
- `list_pad(db, user_id, type=None, parent_id=None, root_only=False)`: always filters
  `user_id`; `root_only=True` filters `parent_id IS NULL` (ignores `parent_id` param);
  else filters `parent_id == value` if given; else no parent filter; `type` filters
  independently if given. (This list/filter endpoint is new vs. the original spec doc —
  fills a real gap, the spec never defined how a client discovers root-level pad rows
  without already knowing an id.)
- `get_pad_with_children(db, user_id, pad_id)`: fetch the pad row + its children (full
  fields — children's `content` is needed client-side for fuzzy title matching and
  search snippets).
- `search_pad(db, user_id, q, parent_id=None)`: `ILIKE` across `name`/`content`/
  `summary`, optionally scoped to one `parent_id`; returns full fields.
- `move_pad`, `update_pad`, `update_pad_summary`: scaffolded per spec §5, not exercised
  this round.

### Router: `app/routers/pad.py`

**Route registration order matters** — FastAPI matches in registration order; a bare
`GET /{id}` would swallow `GET /tree` and `GET /search` as `id` values. Register
static-suffix routes first:

```
GET  /pad                   (list/filter — see semantics above)
GET  /pad/tree                (?root_id=, full recursive subtree — scaffolded)
GET  /pad/search                (?user_id=&q=&parent_id= — WIRED UP this round)
POST /pad                    (create — WIRED UP this round)
GET  /pad/{id}                  (fetch one + children — WIRED UP this round)
PATCH /pad/{id}                 (update content/name/metadata — scaffolded)
PATCH /pad/{id}/summary          (scaffolded, for future summarizer)
POST /pad/{id}/move              (scaffolded)
```

Register in `main.py`: `app.include_router(pad.router, prefix="/api/pad", tags=["pad"])`.

---

## Block 3 — Migration: import flat notes into Postgres (BEFORE the MCP cutover)

Run this against the API over plain HTTPS (`https://taskpad.duckdns.org/api/pad`) with
the service token — still public at this point (see sequencing note). Needs read access
to `data/notes/`, so simplest to run **on the Home Server**, exactly where the files are
today, no relocation dependency.

New script, `taskpad_mcp/scripts/import-notes.ts` (or `.mjs`, run once via `node`/`tsx`):

- Reuses a **shared** title-derivation + duplicate-title-suffix helper (new small module,
  `taskpad_mcp/src/noteNaming.ts`) — replicate `storage.ts`'s exact `readTitle()` regex
  (`#`-stripped first line, fallback to filename stem) so post-migration titles match
  what the old `get_note` fuzzy match would have found. This same helper is imported by
  `api-client.ts` in Block 4 — write the dedup logic once, not twice.
- **Idempotent** (safe to rerun — no direct shell access to fix a bad partial state
  quickly): before creating a project folder, `GET /pad?user_id=&root_only=true&type=folder`
  and match by name, reuse the id if found; before creating a note, `GET /pad?parent_id=<folder_id>&type=note`
  and match by (post-dedup) name, skip if already present.
- For each project dir → find-or-create a `type="folder"` pad row; for each note file
  inside → find-or-create a `type="note"` child pad row with `content` = file body.

**Verify before Block 4**: compare file count vs. pad-row count
(`find data/notes -name '*.md' | wc -l` vs. `GET /pad?user_id=...&type=note` count, or
a one-off `SELECT COUNT(*) FROM pad WHERE type='note';` on the VPS). Taskpad_MCP is
still running on `storage.ts`, on the Home Server, untouched at this point — zero
user-facing risk if the import needs debugging/rerunning.

---

## Block 4 — Cutover + relocate: Taskpad_MCP moves to the VPS on `api-client.ts`

`server.ts` imports storage **only** via `import * as storage from "./storage.js"` and
calls exactly 6 functions + `DEFAULT_PROJECT` — a true drop-in swap. Relocation and the
storage-layer cutover happen together as one deployment (no value in standing up the old
flat-file code on the new host first — that would just create a second, divergent,
flat-file-writable instance during a transitional window).

1. New `src/api-client.ts`, same exported shape as `storage.ts` (`listProjects`,
   `createProject`, `saveNote`, `getNote`, `listNotes`, `searchNotes`, `DEFAULT_PROJECT`),
   backed by native `fetch` (Node 20, no new dependency) against `TASKPAD_API_URL` with an
   `X-Service-Token: TASKPAD_SERVICE_TOKEN` header. Point `TASKPAD_API_URL` at the public
   `https://taskpad.duckdns.org/api` for now — it moves to the internal URL in Block 5.
   - Same thrown-`Error`-with-human-message contract as today (e.g.
     `Project "X" does not exist.`) — map API error responses to matching messages.
   - `getNote` fuzzy match and `searchNotes`/`listNotes` "all projects" aggregation done
     client-side against API responses, same as today's in-memory logic.
   - Matching leniency preserved via a small `normalizeForMatch()` (lowercase/trim/
     collapse whitespace) used only for comparison — dropping *storage* slugification
     doesn't mean dropping *matching* leniency; those are separate concerns.
   - Old `(filename)` display token in tool output text (`[project] title (filename)`)
     becomes `(id: ...)` — no filesystem name exists anymore, and a stable id is useful
     for future id-based tools anyway.
2. `server.ts`: one-line change, `import * as storage from "./api-client.js"`.
3. Set up a Docker network shared with `task-app` so Caddy (and later, `backend`) can
   reach the relocated MCP by container name. On the VPS:
   ```
   docker network ls   # confirm task-app's actual compose network name (container
                        # naming suggests the project name is "taskpad", not "task-app" —
                        # confirm before assuming)
   ```
   Add to `taskpad_mcp/docker-compose.yml`:
   ```yaml
   services:
     taskpad-mcp:
       ...
       networks:
         - default
         - shared
   networks:
     shared:
       external: true
       name: <confirmed network name from docker network ls>
   ```
4. Deploy the `taskpad_mcp` repo to the VPS (new checkout — `git clone`/`scp`, not the
   Home Server's copy). Carry over the existing secrets into a new `.env` on the VPS:
   `MCP_AUTH_TOKEN`, `PUBLIC_BASE_URL` (stays `https://taskpad.duckdns.org`),
   `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `ALLOWED_GOOGLE_EMAIL`, `MCP_JWT_SECRET`,
   plus new `TASKPAD_API_URL`, `TASKPAD_SERVICE_TOKEN` (same value as Block 2's),
   `TASKPAD_USER_ID` (the fixed Google-`sub` for the single real user — look up once via
   `docker exec taskpad-db-1 psql -U taskapp -d taskapp -c "select id, email from users;"`).
   `NOTES_DIR` becomes dead config (fine to leave — `OAUTH_DIR` still needs the volume).
5. **Copy OAuth state from the Home Server** before first boot, so the existing mobile
   connector keeps working without re-registering:
   ```
   scp -r homeserver:~/projects/taskpad_mcp/data/oauth ./data/
   ```
   Combined with the identical `MCP_JWT_SECRET`/`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/
   `ALLOWED_GOOGLE_EMAIL` copied in step 4, the new instance recognizes the
   already-registered client and validates already-issued JWTs the same way the Home
   Server instance did — no forced reconnect.
6. **Side-port pre-test, before touching the live route.** Temporarily publish a test
   port (e.g. `3003:3000` in `docker-compose.yml`), bring the container up, and verify
   with `curl` + the static `MCP_AUTH_TOKEN` bearer token that the full path works
   end-to-end — health check, then an actual tool call (e.g. `list_projects`) round-tripping
   through `api-client.ts` → `backend` → Postgres. This exercises nearly everything except
   the OAuth/mobile-specific code path, and catches env var typos, network misconfig, and
   `api-client.ts` bugs while the production `/mcp` route is still untouched and still
   serving the Home Server instance. Remove the test port mapping once this passes.
7. **Fetch the live Caddyfile first** (see constraints section — the local copy is
   stale), then update the `/mcp*` and `/.well-known/oauth-authorization-server` routes
   to proxy to `taskpad-mcp:3000` (the container/service name on the shared network)
   instead of `100.125.184.106:3002` (the Home Server's Tailscale IP). This is the one
   step that actually affects the live connector — everything before it is either
   local-only or tested on a side channel.
   Remember the Caddyfile-editing gotcha from `claude_Todo.md`: editing via `scp` can
   leave Docker's single-file bind mount serving the old inode — `docker restart
   taskpad-caddy-1` after editing, and verify with `docker exec taskpad-caddy-1 cat
   /etc/caddy/Caddyfile` (not just `cat` on the host) that the change actually landed
   inside the container. **Note the rollback command before proceeding** — revert that
   same line back to `100.125.184.106:3002` + `docker restart taskpad-caddy-1` — so it's
   ready to paste immediately if step 8 fails.
8. Verify from Claude mobile: an existing conversation/tool call should keep working
   without any reconnect prompt, confirming the OAuth-state copy worked. Also verify a
   fresh tool call end-to-end (e.g. `save_note` + `get_note` round trip).
9. **Only once step 8 passes**, decommission the Home Server instance
   (`docker compose down` there) and delete `src/storage.ts` (dead code, no other
   importers). Keep the Home Server's `data/notes` and its backups (Block 0) around for a
   while as an extra safety net even after decommissioning — no urgency to delete them.

---

## Block 5 — Harden: make `/api/pad` internal-only, not reachable over the public internet

Only do this after Block 4 is verified working — MCP now reaches `backend` over the
shared Docker network and no longer needs the public route at all.

1. **Fetch the live Caddyfile again** (same caution as Block 4 step 5).
2. Narrow the blanket `reverse_proxy /api/* backend:8080` rule to an explicit allow-list
   that excludes `/api/pad/*` — e.g. separate `reverse_proxy /api/tasks/* backend:8080`,
   `reverse_proxy /api/auth/* backend:8080`, `reverse_proxy /api/import/* backend:8080`
   rules, with no rule at all for `/api/pad/*` (so it 404s at the edge — the frontend
   doesn't use it yet, so nothing else breaks).
3. Update `TASKPAD_API_URL` in the VPS's `taskpad_mcp/.env` to the internal address
   (`http://backend:8080/api`), restart `taskpad-mcp`.
4. Verify: `curl https://taskpad.duckdns.org/api/pad` from outside now fails (no route),
   while MCP tool calls still work (proving the internal path is live).
5. Keep the `X-Service-Token` check in place regardless (Block 2) — defense in depth,
   cheap to keep even once network-level exposure is closed.

---

## Block 6 — End-to-end verification

1. From Claude Code or mobile, exercise all 6 tools against real data: `list_projects`,
   `list_notes` (with and without a project), `get_note` on a migrated note,
   `search_notes`, `save_note` + `get_note` round-trip on a brand-new note,
   `create_project`.
2. Confirm a fresh `save_note` call actually lands as a new row in Postgres (not just a
   successful tool response) via a `SELECT` on the VPS.
3. Confirm the Home Server's old `taskpad-mcp` container is stopped and Claude no longer
   depends on it or Tailscale for any part of this flow.

---

## Explicitly deferred (not in this execution)

- `task-app` frontend tree UI, `tasks.parent_pad_id` column.
- New MCP tools (`create_folder`, `move_pad`, `summarize_person`).
- Background summarizer job, Obsidian export script.
- `POSTGRES_PASSWORD` rotation — already done by the user separately, prior to this doc.

---

# Explicit Instructions

Ready-to-paste commands as each block is actually executed, filled in block by block
(this section grows as we go — see the design detail above for the "why" behind each
step).

## Block 0

Local fix already applied: `scripts/backup-notes.sh` now has a `git init` guard (was
missing one, would have failed with "fatal: not a git repository" on first run).
Everything else below runs **on the Home Server**, not from here.

**1. Plain snapshot (do this first, independent of everything else):**
```
tar czf ~/taskpad-notes-backup-$(date +%Y%m%d-%H%M%S).tar.gz -C ~/projects/taskpad_mcp/data notes
```

**2. Copy the fixed backup script over** (the Home Server copy was `scp`'d originally,
not git-cloned, so `git pull` may not work there — `scp` is the safe bet):
```
scp scripts/backup-notes.sh homeserver:~/projects/taskpad_mcp/scripts/backup-notes.sh
```
(run from this machine, in `~/projects/taskpad_mcp`; adjust `homeserver` to whatever
host alias/IP you actually use)

**3. Run it once on the Home Server** to confirm it works and create the first commit:
```
ssh homeserver '~/projects/taskpad_mcp/scripts/backup-notes.sh'
```

**4. Cron it** (adjust the username/path if different):
```
ssh homeserver '(crontab -l 2>/dev/null; echo "*/15 * * * * /home/USER/projects/taskpad_mcp/scripts/backup-notes.sh") | crontab -'
```

**Status: done.** Steps 1-4 confirmed working on the Home Server 2026-08-09 (git identity
for root needed configuring first - see Execution notes below).

---

# Execution notes

Written after all 6 blocks completed and verified, 2026-08-10. Captures what actually
happened - bugs found, incidents, and places the real outcome differs from the plan
above. The plan sections above are left as originally written for the design reasoning;
this section is the accurate record of what's actually running.

## Bugs found and fixed during execution

- **Migration idempotency bug (Block 3).** First version of `import-notes.ts` keyed
  "already imported?" off the note's *derived title*, not its filename. Two real notes
  (`car-trip-to-do-list.md` and `car-trip-to-do-list-2.md`) share the same H1 heading
  ("Car Trip To-Do List") but have different bodies - the second one was silently
  dropped as a false duplicate on the first run. Caught because the skip count didn't
  make sense for a first run against an empty table. Fixed: idempotency key is now the
  original filename, stored in `metadata_json.source_file`; display-name collisions are
  resolved via `resolveUniqueName` ("Car Trip To-Do List (2)") instead of skipping.
  `pad` table was wiped and re-imported clean once the fix landed (safe - nothing
  downstream depended on the rows yet).
- **`.git` imported as a bogus project (Block 3/4).** `backup-notes.sh` (Block 0)
  initializes a git repo *inside* `data/notes/`, and the migration script's directory
  scan didn't exclude dotfiles - `.git` got created as an empty root-level "folder" in
  `pad`. Caught during Block 4's pre-cutover smoke test (`listProjects()` returned
  `.git` alongside the real projects), not during Block 3 itself. Cleaned up the bad row
  and added a dotfile filter to the script.
- **`docker compose restart` does not reload `.env`** - only `docker compose up -d`
  (recreates the container, not the volumes/data) does. Hit this in Block 2 (new
  `TASKPAD_SERVICE_TOKEN` silently absent after `restart`) and again correctly avoided
  in Blocks 4/5 by using `up -d` for every env var change.
- **Caddy `handle` does not accept multiple space-separated path matchers** (e.g.
  `handle /api/tasks /api/tasks/*` is invalid syntax). Caused a real, if brief, **full
  site outage** during Block 5 - Caddy failed to load the bad config and crash-looped
  (frontend, `/api/tasks`, `/mcp`, everything down). Fixed with named matchers
  (`@tasks path /api/tasks /api/tasks/*` then `handle @tasks { ... }`). Caught and fixed
  within the same exchange via `docker ps`/`docker logs`, no separate incident response
  needed, but worth remembering: **any future Caddyfile edit needs the `@matcher path`
  form for any route that must match both a bare path and its wildcard**, not `handle`
  with multiple path args.
- **Wildcard-only route missed the bare path.** Relatedly: `/api/tasks/*` alone doesn't
  match plain `/api/tasks` (the frontend's actual list/create endpoint - FastAPI's
  `router.get("")`/`router.post("")` under that prefix). Same fix (named matcher
  covering both forms) applies to `/api/import/csv`.

## Deliberate deviations from the written plan

- **Deployed via direct file copy (`scp`/`tar` pipe), not git**, for every code push to
  both the VPS and Home Server. Both machines' git repos had pre-existing uncommitted
  local drift (VPS: `Caddyfile`/`docker-compose.yml`; Home Server: `Dockerfile`/
  `docker-compose.yml`/`package.json`/`src/index.ts`, plus an unexplained `src/src/`
  nested duplicate) from before this execution - left all of that alone throughout,
  only ever committing the specific files this execution actually touched.
- **Kept the `127.0.0.1:3003` test port** on the VPS's `taskpad-mcp` container instead of
  removing it after the Block 4 pre-test (plan said to remove it). Loopback-only, not
  publicly reachable, useful as an ongoing debug/health-check path. Low-risk call, not
  hidden.
- **Skipped the OAuth path in the Block 4 pre-test** - only the bearer-token
  (`MCP_AUTH_TOKEN`) path was tested pre-cutover; the OAuth/mobile flow was verified only
  at the real cutover, by the user directly on their phone (both read and a write).

## State that differs from a fresh reading of the plan above

- **Home Server's `docker-compose.yml`/`.env`** were synced to match the VPS's
  post-relocation config (for git-history consistency on that side) - that repo copy is
  **not actually runnable as-is** anymore (references the VPS's external Docker network,
  which doesn't exist on the Home Server). Intentional, since the Home Server instance is
  decommissioned, but worth knowing if anyone looks at that checkout later.
- **Two `taskpad` MCP registrations exist in this Claude Code environment**: a stale one
  pointing directly at the Home Server's LAN IP (`http://192.168.1.132:3002/mcp`, now
  correctly broken since that container is gone) and the working one via the public
  domain. Flagged to the user 2026-08-10, not yet resolved - either remove the stale one
  or repoint it.
- **No off-box backup exists for the live Postgres `pad`/`tasks` data.** Block 0 backed up
  the *flat files* (now superseded as source of truth). The actual live data - 21 notes,
  4 folders, in `taskpad-db-1` on the VPS - has zero backup coverage right now. Spec §9
  (`pg_dump` → Google Drive via `rclone`) was always planned as separate, deferred work,
  but it's worth being explicit that this is now the most exposed gap, not a low-priority
  nice-to-have - a VPS disk failure today would lose the sole copy of these notes.
- Real values now baked into the VPS's `taskpad_mcp/.env`: `TASKPAD_USER_ID` is the real
  Google `sub` for `dakaboo@gmail.com` (`110621994547208925762`); `TASKPAD_SERVICE_TOKEN`
  is a generated 64-char hex secret, identical in both `task-app/.env` and
  `taskpad_mcp/.env` on the VPS - never displayed in this conversation, only confirmed
  present by key name.
