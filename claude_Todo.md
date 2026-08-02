# Taskpad MCP — Build Plan

Architecture:
```
Claude mobile → VPS (public URL, TLS, auth) — stateless proxy, no data at rest
                        │  Tailscale
                        ▼
        Home Server (always-on): MCP server + notes on disk — source of truth
                        ▲
        Local Machine: Claude Code reads/writes same files via LAN/Tailscale
```

Legend: **[Local]** = your dev laptop/desktop · **[Home]** = always-on home server/NAS · **[VPS]** = paid public server

---

## Phase 1 — File layer + bare MCP server (no networking yet)
- [ ] **[Local]** Design note/project file layout: `notes/<project>/<title>.md`, title on first line, `default` project folder.
- [ ] **[Local]** Scaffold MCP server project (pick language/runtime, e.g. Node/TS or Python).
- [ ] **[Local]** Implement core tools: `create_project`, `list_projects`, `save_note`, `get_note`, `list_notes`, `search_notes`.
- [ ] **[Local]** Enforce req logic in-server (not prompt-reliant): missing project → `default`, missing/blank title → derive or reject.
- [ ] **[Local]** Run server over stdio, wire into local Claude Code, test create/save/list/search end-to-end against a local test folder.

## Phase 2 — Move to Home Server, run as a real service
- [ ] **[Home]** Provision the notes directory on persistent storage (not a tmp/cache disk).
- [ ] **[Home]** Deploy the MCP server code to the home server (git pull / rsync / container).
- [ ] **[Home]** Switch transport from stdio to network (HTTP/SSE), bind to a local port.
- [ ] **[Home]** Wrap it as a systemd service (or Docker container with `restart: always`) so it survives reboots/crashes.
- [ ] **[Home]** Verify from another device on the LAN that it responds.

## Phase 3 — Auth on the MCP server itself
- [ ] **[Home]** Generate a bearer token / API key; store as a secret (env var / systemd `EnvironmentFile`, not in git).
- [ ] **[Home]** Require the token on every request; reject unauthenticated calls.
- [ ] **[Local]** Confirm local Claude Code / test client still works with the token.

## Phase 4 — Tailscale bridge
- [ ] **[Home]** Install Tailscale, join your tailnet, confirm it gets a stable tailnet IP/hostname.
- [ ] **[VPS]** Install Tailscale, join the same tailnet.
- [ ] **[VPS]** Confirm VPS can reach the home server's tailnet address + MCP port (`curl` test with the bearer token).
- [ ] Do **not** open any port on the home router — this step should require zero router config.

## Phase 5 — Public gateway on the VPS
- [ ] **[VPS]** Point your domain's DNS at the VPS.
- [ ] **[VPS]** Install Caddy (or nginx) as reverse proxy; Caddy auto-provisions TLS via Let's Encrypt for the domain.
- [ ] **[VPS]** Configure proxy to forward `https://your-domain.com/*` → home server's tailnet address:port.
- [ ] **[VPS]** Decide auth location: token checked at the proxy vs. passed through to the home server (recommend: proxy forwards it through, home server is the one that actually validates — proxy stays dumb/stateless).
- [ ] **[VPS]** Confirm proxy has no persistent notes data anywhere — logs only, no note content written to disk on the VPS.

## Phase 6 — End-to-end test
- [ ] From **Claude mobile** (off your home network, e.g. cellular): create a project, save a note, list notes, search.
- [ ] **[Home]** Confirm the file actually landed on disk in the right project folder with correct title.
- [ ] **[Local]** Confirm Claude Code (reading the same home-server files over LAN/Tailscale) sees the new note immediately — no sync step required.

## Phase 7 — Durability
- [ ] **[Home]** Init the notes directory as a git repo.
- [ ] **[Home]** Commit-on-write (server-side hook) or a periodic cron commit.
- [ ] **[Home]** Push that git repo somewhere off-box (could be the VPS as a bare git remote, or any git host) — this is backup only, VPS still never holds live/served note data.

## Phase 8 — VFuture: task lists
- [ ] **[Local]** Extend note schema/tools with a `status` field (open/done) and task-specific tools once notes are stable.

---

## Open decisions to revisit
- Does Claude Code run **directly on Home Server**, or on **Local Machine** mounting Home Server's files over LAN/Tailscale? (Either works; former is simpler, latter keeps your normal dev environment.)
- Runtime/language for the MCP server.
- Where the backup git remote lives.
