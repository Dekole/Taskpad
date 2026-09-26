# Taskpad Suite Execution 3: Local project-notes sync

**Status: DONE. Both phases executed and verified 2026-08-16.** New `get_project_all_notes`
MCP tool is live on the VPS; `~/.claude/skills/taskpad-notes-sync/SKILL.md` exists and
was manually dry-run successfully (real invocation via `Skill` deferred to a future
session - skills are discovered at session startup, so one created mid-session can't be
invoked by name until the harness reloads). See "Execution notes" below.

**Scope**: implement spec §8a — a new MCP tool that flattens a project's notes into one
document, and a Claude Code Skill that pulls every project down to a local folder.
Existing notes data can be used as the test case, not a migration target.

**Design note**: earlier drafts of this doc explored a VPS-side or Home-Server-side
export script. Superseded — this runs entirely through the existing MCP connector,
matching how any productized user's Claude Code would access it. No server infra beyond
the one new tool.

## Plan

### Phase 1 — New MCP tool: `get_project_all_notes`

The server-side piece. Once deployed, this is usable by any MCP client, not just the
Skill in Phase 2.

1. **Add `getProjectAllNotes(project?)` to `taskpad_mcp/src/api-client.ts`.** Finds the
   project's root folder, fetches its notes (reuses the existing `listNotesIn` fetch,
   full `content` already included), sorts by name, joins each note's content with a
   blank-line separator. Each note's existing `# {title}` header (written by `saveNote`)
   becomes its section header in the combined document.
2. **Register `get_project_all_notes` as a new tool in `taskpad_mcp/src/server.ts`.**
   Input: optional `project` (defaults to `"default"`, matching `get_note`'s pattern).
   Output: the combined document as tool text content.
3. **Deploy to the VPS** (mirrors Execution 1 Block 4's deploy pattern): scp the two
   changed files, rebuild/restart the `taskpad-mcp` container, confirm clean startup logs.
4. **Verify the tool** via the working MCP connector: call `get_project_all_notes` for a
   real project, confirm the returned document contains every note in that project as
   its own `#`-headed section, content matches Postgres directly.

### Phase 2 — Claude Code Skill: local sync

The client-side piece, built on top of Phase 1's tool. This is what the user actually
runs.

5. **Write the Skill** (`SKILL.md` + instructions): for each project
   (`list_projects` → `get_project_all_notes` per project), write
   `<location>/<project>.md`, prepend an auto-generated/synced-at marker, overwrite in
   place, then delete any local `.md` whose project no longer exists upstream. Target
   location: configurable, defaults to `~/TaskpadNotes/`.
6. **Run the Skill once**, confirm the output folder matches current projects exactly
   (right file count, right content, no orphans), confirm rerunning it twice back-to-back
   produces identical output.

### Closing

7. **Update this doc** with an Execution notes section (bugs found, deviations) once
   built and verified, matching Executions 1 and 2's closing style.

## Execution notes

**Real bug found and fixed in Phase 1** (before this doc's plan was even finalized -
caught during initial tool testing): the first version of `getProjectAllNotes` relied
on each note's own content already starting with a proper `# {title}` heading to
produce clean section boundaries. ~17% of real notes don't - some start with a
sub-heading (`## Morning`) or a hashtag-style tag (`#career-development`), both of which
pass `saveNote`'s naive `startsWith("#")` check without being an actual title line. Fixed
by always explicitly prepending `# {name}` (the reliable `name` field) rather than
trusting content parsing, then stripping an exact-match duplicate leading title line to
avoid double-heading noise for the common case.

**Known, accepted limitation, re-confirmed during Phase 2 verification**: for notes
whose `name` got dedup-suffixed at creation time (e.g. `Car Trip To-Do List (2)`), the
embedded content still carries the pre-dedup title (`# Car Trip To-Do List`, no
suffix) - the exact-match strip doesn't fire for these, so both the prepended header and
the note's own original heading appear. Every note is still correctly present and
bounded; this only affects the cosmetic double-heading, not data completeness or
correctness. Confirmed via direct Postgres cross-check (26 notes across 4 projects,
all present) - the 2 known instances of this pattern account for the entire discrepancy
between a naive `grep -c '^# '` count and the actual note count.

**Deploy-process gap caught mid-Phase-1**: after fixing the bug above, only the VPS
deployment was updated for two iterations - the Home Server's git checkout briefly held
the original buggy version. Caught before it could cause confusion, synced and
committed the real final version there too. Worth remembering going forward: this
project's deploy pattern (scp per-target, no shared git remote for `taskpad_mcp`) means
"deployed to VPS" and "deployed to Home Server" are two separate manual steps, easy to
let drift during rapid iteration.

**Skill location**: `~/.claude/skills/taskpad-notes-sync/SKILL.md` (user-level, not
project-level - intentional, so it's usable from any project directory, not just when
working inside `taskpad_mcp`). Not committed to this repo's git history since it lives
outside the repo entirely.

**Verified output**: `~/TaskpadNotes/` contains `ProjectJournal.md`, `Scratchpad.md`,
`default.md`, `journal.md` - one file per current project, matching exactly (no orphans,
since this was a fresh directory on first run). Total content cross-checked against
Postgres directly, not just trusted from the tool's own response.
