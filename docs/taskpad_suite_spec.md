# Taskpad Suite — Unified Architecture Spec

Supersedes the file-based design in `claude_Todo.md` (Phases 1-6, all shipped and working — Tailscale bridge, OAuth, stateful MCP sessions). This doc covers the shift from "flat notes for voice capture" to a structured personal knowledge system: hierarchical notes/people/journal, existing task list, phone/browser UI, automated summarization.

## 1. Decisions locked in (2026-08-08)

- **Single shared datastore**: Postgres (existing `taskpad-db-1` on the VPS) becomes source of truth for tasks, tree/notes, people, journal. `Taskpad_MCP` stops owning its own file storage and becomes an API client of `Taskpad App`'s backend.
- **DB stays on the VPS**, not the home server. Rationale: it's already there, running, serving `Taskpad App`'s UI; round-tripping every phone/browser interaction over Tailscale to home hardware adds latency for no benefit. Accepted tradeoff, not an accident — durability handled via backup (below), not by relocating the DB.
- **Hierarchy**: Obsidian-style nesting, capped at **5 levels deep** (enforced in the API, not assumed infinite).
- **Backup target: Google Drive.** No encryption for v1 — user explicitly does not want decrypt friction. Revisit only if requested later; do not add silently.
- **Local Obsidian access**: solved via a scheduled/on-demand **export** job (DB → local markdown vault), not live file access. Same export also satisfies Claude Code's original "just grep local files" use case — one mechanism, two consumers. Claude Code does **not** need direct DB/API dependency for casual browsing.
- **Auto-summarization**: both mechanisms wanted — (a) Claude calls an MCP tool mid-conversation to write/update a summary, and (b) a separate scheduled background job re-mines raw notes and regenerates summaries independently of any live conversation.

## 2. Current state (as of audit, do not re-derive — verified by reading code)

- `task-app/backend`: FastAPI + SQLAlchemy + Postgres 16. Two tables: `users` (id=Google `sub`, email, name), `tasks` (id, user_id, title, category [string, e.g. "gray"/"green"/"yellow"/"red"], due_date, status, task_order, last_modified, never_stale). Flat list, no hierarchy.
- Auth pattern: endpoints take `user_id` as a query/body param and look it up in `users` — **not** a verified session token per request. Fine for a single-user hobby app today; flag as a gap before this DB becomes the target of a second write path (`Taskpad_MCP`) — see §6.
- `taskpad-db-1` Postgres: **not published to the host** (`docker ps` shows bare `5432/tcp`, no `0.0.0.0:5432->`) — already correctly private, only reachable from other containers on the same Docker network. Preserve this; never add a port mapping for it.
- `POSTGRES_PASSWORD=dekoletaskapp` in `task-app/.env` — weak, guessable, sitting in a plaintext env file. **Rotate this** regardless of the rest of this project — cheap fix, real risk reduction, independent of everything else here.
- `Taskpad_MCP` (`taskpad_mcp/`): Node/Express, its own flat-file storage (`storage.ts`), OAuth 2.1 layer reusing `task-app`'s Google client, stateful Streamable HTTP sessions. All working. This is the piece that gets rewired to talk to `task-app`'s API instead of the filesystem.

## 3. Target architecture

```
                         Postgres (VPS, taskpad-db-1)
                         tasks, nodes, node_content, journal_entries
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
      Taskpad App API      Taskpad_MCP (API client   Backup cron (VPS)
      (existing FastAPI,    of Taskpad App API,       pg_dump → Drive,
      + tree/people/         same auth model as        daily, unencrypted
      journal endpoints,     App — see §6)
      phone/browser UI)              │
                            Claude (mobile / Code / voice→text)
                                    │
                         Summarizer job (cron or triggered)
                         re-mines nodes/journal → writes
                         summary field back via API

Derived/local, never source of truth:
  Obsidian vault export (local machine) — pulled via API on schedule or on
  demand, materializes nodes as nested folders/markdown files. Claude Code
  reads this same folder for raw-file convenience.
```

## 4. Data model changes (task-app backend)

New tables (SQLAlchemy models in `task-app/backend/app/db/models.py`):

```python
class Node(Base):
    __tablename__ = "nodes"
    id = Column(String, primary_key=True)  # uuid
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    parent_id = Column(String, ForeignKey("nodes.id"), nullable=True, index=True)
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
- **`tasks` table is untouched** for now. Do not force-migrate existing tasks into `nodes`. Add nullable `tasks.parent_node_id → nodes.id` so tasks can optionally be organized into the tree for display, without touching existing task-app code paths that already work.
- Journal: model as `type="journal"` nodes under a fixed root folder, not a separate table — keeps one query path for "everything under Work > People > X" style browsing.

## 5. API surface to add (task-app backend)

New router, e.g. `app/routers/nodes.py`:
- `POST /nodes` — create (parent_id, type, name, content, metadata)
- `GET /nodes/{id}` — fetch one, with children list
- `GET /nodes/tree?root_id=` — full subtree (for UI rendering and for Obsidian export)
- `PATCH /nodes/{id}` — update content/name/metadata
- `PATCH /nodes/{id}/summary` — dedicated endpoint for the summarizer job to write summaries without touching content
- `POST /nodes/{id}/move` — reparent (revalidate depth ≤ 5)
- `GET /nodes/search?q=` — text search across name/content/summary

## 6. Taskpad_MCP rewrite

- Remove `storage.ts` (flat-file logic). Replace with an API client module calling the new `task-app` endpoints above.
- **Auth gap to close before this ships**: `task-app`'s current auth is "trust the `user_id` you're given." That was fine when only the App's own frontend (behind Google login in the browser) called it. Once `Taskpad_MCP` — a second, independently-reachable service — writes to the same API, it needs the same level of identity verification `Taskpad_MCP` already built for itself (it already gates on `ALLOWED_GOOGLE_EMAIL` via its own OAuth flow). Simplest fix: `Taskpad_MCP` calls `task-app`'s API using a fixed service credential (shared secret, VPS-internal traffic only, never exposed) rather than reinventing per-request user auth — single-user system, this doesn't need to be more elaborate than that.
- MCP tool surface expands: `save_note`/`get_note`/`list_notes`/`search_notes` map onto the new `/nodes` endpoints (project ≈ top-level folder node); add `create_folder`, `move_node`, and a `summarize_person`-style tool Claude can call in-conversation per the "Claude decides in-conversation" summarization path.
- Existing static-bearer-token + OAuth dual auth on `/mcp` itself is unaffected — this is about how `Taskpad_MCP` talks *outward* to the DB API, not how clients talk to `Taskpad_MCP`.

## 7. Background summarizer job

- Separate scheduled process (cron on the VPS, or triggered), not part of the request path.
- Reads nodes whose `content` changed since `summary_updated_at`, calls the Claude API to regenerate `summary`, writes via `PATCH /nodes/{id}/summary`.
- Scope for v1: define trigger condition (time-based sweep vs. explicit "needs resummarize" flag set on write) — **open, decide during implementation**, not blocking the rest of the plan.

## 8. Obsidian / Claude Code export

- Script (can live in `taskpad_mcp/scripts/` or a new small tool) that calls `GET /nodes/tree` and writes each node to `<vault>/<path-from-root>/<name>.md`, folders as directories, `content` as the file body, `summary` as a header block or frontmatter.
- Run manually on demand initially; cron later if it proves useful. One-directional (DB → local files) — do not build local-edit-syncs-back for v1, that's a much bigger problem (conflict resolution) and wasn't asked for.

## 9. Backup

- Daily cron on the VPS: `docker exec taskpad-db-1 pg_dump -U taskapp taskapp > dump.sql`, then upload via `rclone` to a Google Drive folder (rclone has a Drive backend, avoids writing custom Drive API code).
- No encryption in v1 per explicit decision — revisit only if asked.
- Retain last N days (e.g. 14), delete older dumps on the Drive side via the same cron script.

## 10. Security priorities (user-stated: VPS security is the higher concern, more than Google trust)

Concrete, in priority order:
1. **Rotate `POSTGRES_PASSWORD`** (currently `dekoletaskapp`, weak, sitting in a plaintext `.env`) — do this regardless of the rest of this project.
2. Close the auth gap in §6 before `Taskpad_MCP` gets a second write path into the DB.
3. Confirm `taskpad-db-1` never gets a published port when this is extended (already correct today — just don't regress it).
4. Out of scope for this doc but worth a pass separately: SSH hardening (key-only, fail2ban) and OS/Docker patch currency on the VPS — not audited here, flagging as a gap.

## 11. Phased implementation plan

1. **Schema + API**: add `nodes` table + router to `task-app` backend. No `Taskpad_MCP` changes yet — testable standalone via the existing frontend or curl.
2. **Frontend tree UI**: `task-app` frontend gets a tree view (Work > People > LorinS style) alongside the existing task list.
3. **Taskpad_MCP rewrite**: swap `storage.ts` for the API client; add service-credential auth to `task-app`'s API (§6); update MCP tool surface.
4. **Obsidian/Claude Code export script**.
5. **Backup cron** (§9) — independent of the above, can happen any time, do early since it's low-risk/high-value.
6. **Background summarizer** — last, depends on real content existing in `nodes` to summarize.

## 12. Open questions (explicitly unresolved, do not assume)

- Exact trigger condition for the summarizer job (§7).
- Whether `metadata_json` needs a defined shape per type now or can stay freeform until real usage patterns emerge.
- Whether the phone/browser UI needs real-time updates (e.g. if Claude writes a note while the App is open) or a simple refresh-on-load is acceptable for v1.
