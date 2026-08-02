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
- [x] **[Home]** Provision the notes directory on persistent storage. → `~/projects/taskpad_mcp/data/notes` bind mount.
- [x] **[Home]** Deploy the MCP server code to the home server (scp'd, not git clone yet).
- [x] **[Home]** Switch transport from stdio to network (HTTP), bind to a local port. → stateless Streamable HTTP, port 3002 (3000 was taken by another container).
- [x] **[Home]** Wrap it as a real service. → Docker + `docker-compose.yml`, `restart: unless-stopped` (no systemd unit needed).
- [x] **[Home]** Verify from another device on the LAN that it responds. → confirmed via `curl` and Claude Code from laptop.

## Phase 3 — Auth on the MCP server itself ✅ DONE
- [x] **[Home]** Generate a bearer token; store as a secret. → in `.env` on home server (gitignored), read via `MCP_AUTH_TOKEN`.
- [x] **[Home]** Require the token on every request; reject unauthenticated calls. → verified 401 without token.
- [x] **[Local]** Confirm local Claude Code / test client still works with the token. → re-registered `taskpad` at user scope with `Authorization` header.

## Phase 4 — Tailscale bridge ✅ DONE
- [x] **[Home]** Install Tailscale, join tailnet. → tailnet IP `100.125.184.106`.
- [x] **[VPS]** Install Tailscale, join the same tailnet.
- [x] **[VPS]** Confirm VPS can reach the home server's tailnet address + MCP port. → verified via curl through the full chain.
- [x] No home router config touched — confirmed zero port-forwarding needed.

## Phase 5 — Public gateway on the VPS ✅ DONE
- [x] **[VPS]** DNS already existed: `taskpad.duckdns.org`.
- [x] **[VPS]** Reused the VPS's *existing* Caddy container (`taskpad-caddy-1`, part of an unrelated app already running there) rather than installing a second reverse proxy — added a new route instead of fighting over ports 80/443.
- [x] **[VPS]** Routed **path-based**, not subdomain: `https://taskpad.duckdns.org/mcp` and `/mcp/*` → `100.125.184.106:3002`, via explicit `handle` blocks (bare repeated `reverse_proxy` directives with matchers silently dropped one route — `handle` blocks are the reliable pattern).
- [x] **[VPS]** Auth passed through to the home server, which is the one that actually validates — proxy itself stays dumb/stateless.
- [x] **[VPS]** Confirmed no notes data touches the VPS — Caddy only proxies.
- Gotchas hit and fixed, worth remembering: (1) editing the Caddyfile via `scp` replaces the inode, so Docker's single-file bind mount kept serving the *old* file until the container was restarted (`docker restart taskpad-caddy-1`) — `cat` on the host looked right the whole time, only `docker exec ... cat` inside the container revealed the mismatch; (2) the `.env` holding `MCP_AUTH_TOKEN` on the home server ended up empty at one point (likely a `docker compose up` run without it present) — silently disabled auth until caught by a curl test returning 405 instead of the expected 401.

## Phase 6 — End-to-end test
- [x] **[Local]** Verified via `curl` from laptop through the full public chain: 401 without token, 405 with valid token.
- [ ] From **Claude mobile** (off your home network, e.g. cellular): create a project, save a note, list notes, search. ← blocked, see below
- [ ] **[Home]** Confirm the file actually landed on disk in the right project folder with correct title.
- [ ] **[Local]** Confirm Claude Code (reading the same home-server files over LAN/Tailscale) sees the new note immediately — no sync step required.

### Blocker found 2026-08-02: Claude mobile/claude.ai connector UI wants OAuth, not a bearer token
- The "Add custom connector" form (mobile *and* claude.ai desktop) only exposes **URL** + **Advanced Settings: OAuth Client ID / Client Secret** — there is no plain header/API-key field like Claude Code's CLI (`-H "Authorization: Bearer ..."`) has.
- Our server only implements static bearer-token auth (Phase 3) — enough for Claude Code, not enough for the mobile/web connector UI.
- Confirmed: tried leaving Advanced Settings blank, got: *"Couldn't register with taskpad_mcp's sign-in service. You can try again, or add an OAuth Client ID in the connector settings."* (ref `ofid_eb37e86b5f6003e0`) — Claude attempted Dynamic Client Registration and found no OAuth endpoints at all.
- **Next step — implement minimal OAuth 2.1 on the MCP server:**
  - `/.well-known/oauth-authorization-server` — metadata discovery.
  - `/register` — Dynamic Client Registration (RFC7591), so Claude can self-register.
  - `/authorize` — since single-user, can just be a simple password gate (something only the owner knows) rather than real accounts.
  - `/token` — issues access tokens after authorization; needs PKCE support.
  - Swap the `/mcp` auth check from "matches static `MCP_AUTH_TOKEN`" to "is a valid token this server itself issued."
  - Bigger, deliberate feature — not a quick patch. Not started yet.

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
