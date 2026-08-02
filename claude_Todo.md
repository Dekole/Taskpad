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

## Phase 1 — File layer + bare MCP server (no networking yet) ✅ DONE
- [x] **[Local]** Design note/project file layout: `notes/<project>/<title>.md`, title on first line, `default` project folder.
- [x] **[Local]** Scaffold MCP server project (pick language/runtime, e.g. Node/TS or Python). → TypeScript/Node.
- [x] **[Local]** Implement core tools: `create_project`, `list_projects`, `save_note`, `get_note`, `list_notes`, `search_notes`.
- [x] **[Local]** Enforce req logic in-server (not prompt-reliant): missing project → `default`, missing/blank title → derive or reject.
- [x] **[Local]** Run server over stdio, wire into local Claude Code, test create/save/list/search end-to-end against a local test folder. → skipped straight to HTTP + Docker.

## Phase 2 — Move to Home Server, run as a real service ✅ DONE
- [x] **[Home]** Provision the notes directory on persistent storage. → `~/taskpad_mcp/data/notes` bind mount.
- [x] **[Home]** Deploy the MCP server code to the home server (scp'd, not git clone yet).
- [x] **[Home]** Switch transport from stdio to network (HTTP), bind to a local port. → stateless Streamable HTTP, port 3002 (3000 was taken by another container).
- [x] **[Home]** Wrap it as a real service. → Docker + `docker-compose.yml`, `restart: unless-stopped` (no systemd unit needed).
- [x] **[Home]** Verify from another device on the LAN that it responds. → confirmed via `curl` and Claude Code from laptop.

## Phase 3 — Auth on the MCP server itself ✅ DONE
- [x] **[Home]** Generate a bearer token; store as a secret. → in `.env` on home server (gitignored), read via `MCP_AUTH_TOKEN`.
- [x] **[Home]** Require the token on every request; reject unauthenticated calls. → verified 401 without token.
- [x] **[Local]** Confirm local Claude Code / test client still works with the token. → re-registered `taskpad` at user scope with `Authorization` header.

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

## Phase 7 — Durability — ⏸ DEFERRED, come back to this
- [ ] **[User]** Decide where the off-box backup remote lives. Leaning **GitHub (private repo)** as of 2026-08-02, but not decided — reconsider before committing:
  - GitHub/GitLab private repo: easy, free, genuinely not public — but still a third party holding your personal notes, same category of trade-off that ruled out Notion/Google Docs earlier in this project. Worth being deliberate about, not just defaulting to it out of familiarity.
  - Self-hosted remote on the **VPS** (`git init --bare` there, push over SSH/Tailscale) once it exists: zero third parties, consistent with the rest of this architecture, no new accounts. No extra infra cost since the VPS is being built anyway.
  - Local-only (no off-box copy): current state — accepted for now, revisit before this is the sole copy of anything you'd be upset to lose.
- [ ] **[Home]** Init the notes directory as its own git repo (separate from the app repo — notes are gitignored from `taskpad_mcp`). Script already written: `scripts/backup-notes.sh`.
- [ ] **[Home]** Cron the backup script (e.g. every 15 min) for local version history.
- [ ] **[Home]** Once remote is decided: `git remote add origin <...>` + push step in the script.

## Phase 8 — VFuture: task lists
- [ ] **[Local]** Extend note schema/tools with a `status` field (open/done) and task-specific tools once notes are stable.

---

## Open decisions to revisit
- Does Claude Code run **directly on Home Server**, or on **Local Machine** mounting Home Server's files over LAN/Tailscale? (Either works; former is simpler, latter keeps your normal dev environment.)
- ~~Runtime/language for the MCP server.~~ → TypeScript/Node, decided.
- **Where the backup git remote lives** (see Phase 7) — user leaning GitHub private repo, not final.
