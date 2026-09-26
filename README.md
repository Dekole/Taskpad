# Taskpad

A personal task and note system: a web app, a REST API, a Postgres store, and an MCP
server that lets Claude read and write the same notes from mobile, Claude Code or voice.

Live at **https://taskpad.duckdns.org**

## Layout

```
app/      FastAPI backend + React/Vite frontend
mcp/      TypeScript MCP server (7 tools, OAuth 2.1)
scripts/  deploy webhook receiver, stack verification
docs/     architecture, suite spec, execution logs
```

One Docker Compose project, five services: `db`, `backend`, `frontend`, `mcp`, `caddy`.
Postgres is the single source of truth — the MCP server owns no storage of its own and
reaches the notes through the app's `/api/pad`.

## Running it

```
cp .env.example .env     # fill in every value; the MCP vars are required
docker compose up -d --build
```

The directory name matters: Compose derives the project name from it, and the project
name prefixes the volumes. In production the directory is `/root/Taskpad`, which yields
`taskpad_postgres_data`. Renaming it creates an empty database.

## Deploying

Push to `main`. A GitHub Actions workflow calls `/webhook`, and `scripts/webhook.py`
(systemd: `taskpad-webhook`) runs `git pull && docker compose up --build -d` on the VPS.

Verify a deploy changed nothing it shouldn't:

```
scripts/verify-taskpad.sh > after.txt
diff before.txt after.txt
```

## Documentation

| Doc | What it covers |
|---|---|
| `docs/architecture.md` | System level: layout, services, routing, invariants, secrets |
| `docs/ARCHITECTURE.md` | App level: per-service internals, auth flow, task CRUD |
| `docs/taskpad_suite_spec.md` | Design decisions and target architecture for the suite |
| `docs/taskpad_suite_steps.md` | What was built, in order, and what is still open |
| `docs/2026*Execution*.md` | Execution logs for each major change |
| `docs/API_REFERENCE.md` | REST endpoints |

## History

`app/` and `mcp/` were separate repositories until 2026-09-26. They were merged with
`git subtree`, so all history is preserved in this one repo.
