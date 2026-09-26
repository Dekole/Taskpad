# Taskpad — Architecture

> **What the system *is*, after the `task-app` + `taskpad_mcp` merge.**
> For *how we get there*, see [`ExecutionPlan.md`](ExecutionPlan.md).
>
> Status: **LIVE as of 2026-09-26.** The merge shipped; this describes the system as it now
> runs on the VPS. Verified against a full snapshot diff after cutover. Supersedes the scope of
> `docs/ARCHITECTURE.md` v1.0 (June 2026), which predates the MCP server, the `pad` table
> and the deploy webhook. That doc is **kept**, not folded in — it carries the per-service
> internals, the Google auth flow and the task-CRUD data path, none of which are repeated here.

## 1. Repository layout

One repo, one history, one Compose project.

```
Taskpad/                      GitHub: Dekole/Taskpad
│                             VPS: /root/Taskpad      laptop: ~/projects/taskpad
│
├── app/                      ← was task-app
│   ├── backend/              FastAPI: main.py, app/{routers,services,db,auth,sheets}
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   └── frontend/             React + Vite + Tailwind, built into an nginx image
│       ├── Dockerfile
│       └── src/
│
├── mcp/                      ← was taskpad_mcp (git subtree, 27 commits preserved)
│   ├── src/                  index.ts, server.ts, api-client.ts, oauth.ts, oauthStore.ts,
│   │                         noteNaming.ts
│   ├── scripts/              backup-notes.sh, backup-postgres.sh, test-taskpad.ts
│   ├── data/                 ⛔ gitignored — OAuth clients.json, bind-mounted to /data
│   ├── Dockerfile
│   └── package.json
│
├── scripts/
│   ├── webhook.py            ⚠️ path is load-bearing — see §6
│   └── verify-taskpad.sh     baseline snapshot; diff before/after any deploy
│
├── .github/workflows/
│   └── deploy.yml            push to main → curl /webhook
│
├── docs/                     suite spec, steps, requirements, 3 execution logs, drawio,
│                             API_REFERENCE, ARCHITECTURE, PRD, DEMO_SCRIPT, wireframe
│
├── secrets/                  ⛔ gitignored — client_secret.json (mounted read-only)
├── data/tokens/              ⛔ gitignored — Google OAuth tokens
│
├── docker-compose.yml        one project `taskpad`: db, backend, frontend, mcp, caddy
├── Caddyfile                 the live routing config (§3)
├── .env                      ⛔ gitignored — app + MCP vars + POSTGRES_PASSWORD
├── .env.example
└── README.md
```

## 2. Services

One Compose project, `taskpad`, derived from the VPS directory name `/root/Taskpad`
(Compose lowercases it). Five services on one default network, `taskpad_default`.

| Service | Container | Image | Exposure |
|---|---|---|---|
| `caddy` | `taskpad-caddy-1` | `caddy:alpine` | `0.0.0.0:80`, `0.0.0.0:443` — the only public surface |
| `frontend` | `taskpad-frontend-1` | built, nginx | `80/tcp`, internal |
| `backend` | `taskpad-backend-1` | built, uvicorn `--reload` | `8080`, internal, **no host port** |
| `db` | `taskpad-db-1` | `postgres:16-alpine` | `5432/tcp`, internal, **never published** |
| `mcp` | `taskpad-mcp` | built, node:20-alpine | `127.0.0.1:3003 → 3000`, loopback only |

```
                        Internet
                           │  :443
                    ┌──────▼──────┐
                    │    caddy    │  taskpad.duckdns.org, automatic TLS
                    └──┬───┬───┬──┘
          /api/* ┌─────┘   │   └─────┐ /mcp, /.well-known
                 ▼         ▼         ▼
            ┌────────┐ ┌────────┐ ┌──────────┐
            │backend │ │frontend│ │   mcp    │
            └───┬────┘ └────────┘ └────┬─────┘
                │                      │ HTTP, service token
                │      ┌───────────────┘
                ▼      ▼
             ┌────────────┐
             │     db     │  taskpad_postgres_data
             └────────────┘
                                  /webhook → host.docker.internal:9000
                                            (webhook.py, on the host)
```

**MCP owns no storage.** `api-client.ts` replaced the old `storage.ts`; it reads and writes
Taskpad's `/api/pad` with a service token. Postgres is the single source of truth for the
whole suite — tasks, notes, folders, people, journal.

## 3. Public surface

Routed by Caddy, in order. Anything not listed falls through to the frontend.

| Path | Target | Notes |
|---|---|---|
| `/webhook` | `host.docker.internal:9000` | deploy receiver; needs `extra_hosts` on caddy |
| `/api/auth/*` | `backend:8080` | Google OAuth login |
| `/api/tasks`, `/api/tasks/*` | `backend:8080` | task CRUD |
| `/api/import/csv*` | `backend:8080` | CSV import |
| `/api/health` | `backend:8080` | |
| `/.well-known/oauth-authorization-server` | `taskpad-mcp:3000` | MCP OAuth discovery |
| `/mcp`, `/mcp/*` | `taskpad-mcp:3000` | Streamable HTTP + OAuth endpoints |
| `*` | `frontend:80` | SPA |

**`/api/pad` is deliberately not routed.** The note API is reachable only from inside the
Docker network — which is how MCP reaches it, and why it never needs to be public.

MCP exposes seven tools: `list_projects`, `create_project`, `save_note`, `get_note`,
`list_notes`, `search_notes`, `get_project_all_notes`.

## 4. Data

Postgres 16, user/database `taskapp`, volume `taskpad_postgres_data`.

| Table | Contents |
|---|---|
| `users` | id = Google `sub`, email, name |
| `tasks` | title, category, due_date, status, task_order, last_modified |
| `pad` | hierarchical notes — `type` ∈ folder/note/person/journal, `parent_id`, `metadata_json` (JSONB), max 5 levels deep |

Baseline as of 2026-09-20: 37 notes, 5 folders, 39 tasks, 1 user, 7 registered OAuth clients.

Backups are **pulled, never pushed** — the VPS holds no credential reaching into the home
network. The Home Server pulls a nightly `pg_dump` and uploads it to Google Drive.

## 5. Deployment

```
git push origin main
      │
      ▼
.github/workflows/deploy.yml
      │  POST https://taskpad.duckdns.org/webhook
      │  header: X-Webhook-Secret
      ▼
caddy  /webhook → host.docker.internal:9000
      ▼
scripts/webhook.py          (systemd: taskpad-webhook.service)
      │  verifies the secret, else 403
      ▼
cd /root/Taskpad && git pull origin main && docker compose up --build -d
```

After the merge this covers **both halves** — today MCP isn't even a git checkout on the VPS,
so it has no deploy path at all.

The webhook must be stopped (`systemctl stop taskpad-webhook`) during the migration itself, or
an intermediate push deploys a half-migrated tree unattended. See ExecutionPlan Phase 3.

## 6. Invariants

Break one of these and something fails quietly rather than loudly.

| # | Invariant | What breaks otherwise |
|---|---|---|
| 1 | VPS directory stays `/root/Taskpad` | Compose project name changes → a **new empty** `postgres_data` volume; looks like total data loss |
| 2 | `scripts/webhook.py` stays at that exact path | `taskpad-webhook.service` has it in `ExecStart`; deploys silently stop working |
| 3 | `mcp/data/` is bind-mounted and never wiped | all 7 registered OAuth clients de-register; every Claude client must re-authenticate |
| 4 | `POSTGRES_PASSWORD` lives in `.env`, never in `docker-compose.yml` | the rotated password gets committed to GitHub |
| 5 | `db` never gets a host port mapping | Postgres becomes internet-reachable |
| 6 | `caddy` keeps `extra_hosts: host.docker.internal:host-gateway` | `/webhook` 502s; deploys stop |
| 7 | Container names stay as in §2 | Caddy resolves MCP and backend **by name**; renaming breaks routing |
| 8 | `DATABASE_URL`, `POSTGRES_USER/DB` keep saying `taskapp` | renaming them is a data migration, not a rename |

## 7. Secrets

No **live** secret is tracked in git — verified across all 27 MCP commits and the app's
tracked-file list. One **dead** value remains in history: the pre-rotation `POSTGRES_PASSWORD`
in `docker-compose.yml` since `eca856d`. It is worthless, but it is why that file must never
carry the current password again.

| Secret | Lives in | Notes |
|---|---|---|
| `POSTGRES_PASSWORD` | `.env` (VPS) | rotated 2026-08; the value in git history is dead |
| `GOOGLE_CLIENT_SECRET`, `GOOGLE_CLIENT_ID` | `.env` (VPS) | shared by app and MCP |
| `MCP_AUTH_TOKEN`, `MCP_JWT_SECRET` | `.env` (VPS) | static bearer + session signing |
| `TASKPAD_SERVICE_TOKEN` | `.env` (VPS) | MCP → `/api/pad` auth; present in both halves |
| `WEBHOOK_SECRET` | systemd unit env | also a GitHub Actions secret |
| `client_secret.json` | `secrets/`, mounted `:ro` | gitignored |
| Google OAuth tokens | `data/tokens/` | gitignored |
| OAuth client registrations | `mcp/data/oauth/clients.json` | gitignored, bind-mounted |

## 8. Known gaps

Carried forward from `taskpad_suite_steps.md`; none are introduced by the merge.

- **No restore has ever been tested** — backups exist for both paths, recovery is unverified.
- Frontend tree UI for `pad` — never built; the note hierarchy is MCP-only today.
- Background summarizer job (§7) — never built.
- `create_folder`, `move_pad`, `delete_note` tools — named in the spec, absent.
- Backend auth takes `user_id` as a parameter rather than verifying a session token per
  request. Acceptable for a single-user app; it is the reason `/api/pad` must stay internal.
- **Google OAuth scope is broader than needed** (carried over from `readme.txt`, 2026-04-12):
  the consent screen asks for more than the app uses. Ideally it would request permission to
  edit a single sheet, so granting it feels less alarming. Never investigated.
