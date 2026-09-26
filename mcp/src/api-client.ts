// Drop-in replacement for storage.ts - same exported functions/signatures,
// backed by task-app's /api/pad instead of the local filesystem. server.ts
// only needs one import line changed to switch between them.

import { normalizeForMatch, resolveUniqueName } from "./noteNaming.js";

export const DEFAULT_PROJECT = "default";

const API_URL = process.env.TASKPAD_API_URL;
const SERVICE_TOKEN = process.env.TASKPAD_SERVICE_TOKEN;
const USER_ID = process.env.TASKPAD_USER_ID;

if (!API_URL || !SERVICE_TOKEN || !USER_ID) {
  throw new Error(
    "TASKPAD_API_URL, TASKPAD_SERVICE_TOKEN, and TASKPAD_USER_ID must all be set."
  );
}

export interface NoteSummary {
  project: string;
  title: string;
  filename: string; // no filesystem name anymore - holds "(id: ...)" instead
}

export interface Note extends NoteSummary {
  content: string;
}

export interface SearchResult extends NoteSummary {
  snippet: string;
}

interface PadEntry {
  id: string;
  parent_id: string | null;
  type: string;
  name: string;
  content: string;
  metadata_json: Record<string, unknown>;
}

async function apiFetch(pathAndQuery: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${API_URL}${pathAndQuery}`, {
    ...init,
    headers: {
      "X-Service-Token": SERVICE_TOKEN as string,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}

function normalizeProject(project?: string): string {
  const trimmed = project?.trim();
  return trimmed ? trimmed : DEFAULT_PROJECT;
}

async function listRootFolders(): Promise<PadEntry[]> {
  return apiFetch(`/pad?user_id=${encodeURIComponent(USER_ID as string)}&root_only=true&type=folder`);
}

async function findRootFolder(project: string): Promise<PadEntry | null> {
  const roots = await listRootFolders();
  return roots.find((r) => normalizeForMatch(r.name) === normalizeForMatch(project)) ?? null;
}

async function listNotesIn(folderId: string): Promise<PadEntry[]> {
  return apiFetch(
    `/pad?user_id=${encodeURIComponent(USER_ID as string)}&parent_id=${encodeURIComponent(folderId)}&type=note`
  );
}

function findByTitle(notes: PadEntry[], query: string): PadEntry | undefined {
  const target = normalizeForMatch(query);
  return (
    notes.find((n) => normalizeForMatch(n.name) === target) ??
    notes.find((n) => normalizeForMatch(n.name).startsWith(target))
  );
}

export async function listProjects(): Promise<string[]> {
  const roots = await listRootFolders();
  return roots.map((r) => r.name).sort();
}

export async function createProject(project: string): Promise<string> {
  const name = normalizeProject(project);
  const existing = await findRootFolder(name);
  if (existing) return name;
  await apiFetch(`/pad?user_id=${encodeURIComponent(USER_ID as string)}`, {
    method: "POST",
    body: JSON.stringify({ type: "folder", name, parent_id: null }),
  });
  return name;
}

export async function saveNote(params: {
  project?: string;
  title: string;
  content: string;
}): Promise<NoteSummary> {
  const title = params.title.trim();
  if (!title) {
    throw new Error("Note title must not be empty.");
  }
  const project = normalizeProject(params.project);
  let folder = await findRootFolder(project);
  if (!folder) {
    await createProject(project);
    folder = await findRootFolder(project);
  }
  if (!folder) {
    throw new Error(`Could not create or find project "${project}".`);
  }

  const siblings = await listNotesIn(folder.id);
  const name = resolveUniqueName(siblings.map((s) => s.name), title);

  const body = params.content.trim();
  const fileContent = body.startsWith("#") ? `${body}\n` : `# ${title}\n\n${body}\n`;

  const created: PadEntry = await apiFetch(`/pad?user_id=${encodeURIComponent(USER_ID as string)}`, {
    method: "POST",
    body: JSON.stringify({ type: "note", name, parent_id: folder.id, content: fileContent }),
  });
  return { project, title, filename: `(id: ${created.id})` };
}

export async function getNote(params: { project?: string; title: string }): Promise<Note> {
  const project = normalizeProject(params.project);
  const folder = await findRootFolder(project);
  if (!folder) {
    throw new Error(`Project "${project}" does not exist.`);
  }

  const notes = await listNotesIn(folder.id);
  const match = findByTitle(notes, params.title);
  if (!match) {
    throw new Error(`No note matching "${params.title}" in project "${project}".`);
  }

  return { project, title: match.name, filename: `(id: ${match.id})`, content: match.content };
}

export async function listNotes(params: { project?: string }): Promise<NoteSummary[]> {
  const folders = params.project ? [await findRootFolder(normalizeProject(params.project))] : await listRootFolders();
  const results: NoteSummary[] = [];

  for (const folder of folders) {
    if (!folder) continue;
    const notes = await listNotesIn(folder.id);
    for (const n of notes.sort((a, b) => a.name.localeCompare(b.name))) {
      results.push({ project: folder.name, title: n.name, filename: `(id: ${n.id})` });
    }
  }
  return results;
}

export async function getProjectAllNotes(project?: string): Promise<{ project: string; content: string }> {
  const projectName = normalizeProject(project);
  const folder = await findRootFolder(projectName);
  if (!folder) {
    throw new Error(`Project "${projectName}" does not exist.`);
  }

  const notes = await listNotesIn(folder.id);
  // Always prepend "# {name}" explicitly rather than trusting each note's own
  // content to already have a reliable top-level heading - some notes start
  // with a sub-heading ("## ...") or a hashtag-style tag ("#tag ..."), both of
  // which pass saveNote's naive `startsWith("#")` check without actually being
  // the note's own title line, which would otherwise blend into the previous
  // note's section with no boundary.
  const combined = notes
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((n) => {
      const trimmed = (n.content ?? "").trim();
      const ownTitleLine = `# ${n.name}`;
      // Strip an exact-match leading title line before re-adding it, so most
      // notes (whose content already embeds "# {name}") don't get a visibly
      // duplicated header. Doesn't fire for the sub-heading/hashtag edge
      // cases above, or for deduped names ("X (2)") whose embedded heading
      // still says the pre-dedup title - acceptable, rare, still bounded.
      const body = trimmed.startsWith(ownTitleLine)
        ? trimmed.slice(ownTitleLine.length).trimStart()
        : trimmed;
      return `# ${n.name}\n\n${body}`;
    })
    .join("\n\n");

  return { project: projectName, content: combined };
}

export async function searchNotes(params: { query: string; project?: string }): Promise<SearchResult[]> {
  const folders = params.project ? [await findRootFolder(normalizeProject(params.project))] : await listRootFolders();
  const needle = params.query.toLowerCase();
  const results: SearchResult[] = [];

  for (const folder of folders) {
    if (!folder) continue;
    const notes = await listNotesIn(folder.id);
    for (const n of notes.sort((a, b) => a.name.localeCompare(b.name))) {
      const content = n.content ?? "";
      const idx = content.toLowerCase().indexOf(needle);
      if (idx === -1) continue;
      const start = Math.max(0, idx - 40);
      const end = Math.min(content.length, idx + needle.length + 40);
      const snippet = `${start > 0 ? "…" : ""}${content.slice(start, end).replace(/\n/g, " ")}${
        end < content.length ? "…" : ""
      }`;
      results.push({ project: folder.name, title: n.name, filename: `(id: ${n.id})`, snippet });
    }
  }
  return results;
}
