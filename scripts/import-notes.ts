// One-off migration: import existing flat-file notes (storage.ts's on-disk
// layout) into the new `pad` table via task-app's API. Safe to rerun -
// finds-or-creates rather than blindly inserting, so a rerun after a partial
// failure just fills in what's missing instead of duplicating.
//
// Run on the Home Server (where the notes actually live), e.g.:
//   TASKPAD_API_URL=https://taskpad.duckdns.org/api \
//   TASKPAD_SERVICE_TOKEN=... \
//   TASKPAD_USER_ID=... \
//   npx tsx scripts/import-notes.ts

import { promises as fs } from "node:fs";
import path from "node:path";
import { titleFromContent, normalizeForMatch, resolveUniqueName } from "../src/noteNaming.js";

const NOTES_DIR = process.env.NOTES_DIR
  ? path.resolve(process.env.NOTES_DIR)
  : path.resolve(process.cwd(), "data", "notes");

const API_URL = requireEnv("TASKPAD_API_URL");
const SERVICE_TOKEN = requireEnv("TASKPAD_SERVICE_TOKEN");
const USER_ID = requireEnv("TASKPAD_USER_ID");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

interface PadEntry {
  id: string;
  name: string;
  type: string;
  parent_id: string | null;
  metadata_json: Record<string, unknown>;
}

async function apiFetch(pathAndQuery: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${API_URL}${pathAndQuery}`, {
    ...init,
    headers: {
      "X-Service-Token": SERVICE_TOKEN,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${init?.method ?? "GET"} ${pathAndQuery} -> ${res.status}: ${body}`);
  }
  return res.json();
}

async function findOrCreateFolder(name: string): Promise<PadEntry> {
  const roots: PadEntry[] = await apiFetch(
    `/pad?user_id=${encodeURIComponent(USER_ID)}&root_only=true&type=folder`
  );
  const existing = roots.find((r) => normalizeForMatch(r.name) === normalizeForMatch(name));
  if (existing) return existing;

  return apiFetch(`/pad?user_id=${encodeURIComponent(USER_ID)}`, {
    method: "POST",
    body: JSON.stringify({ type: "folder", name, parent_id: null }),
  });
}

async function findOrCreateNote(
  folderId: string,
  sourceFile: string,
  desiredTitle: string,
  content: string
): Promise<"created" | "skipped"> {
  const siblings: PadEntry[] = await apiFetch(
    `/pad?user_id=${encodeURIComponent(USER_ID)}&parent_id=${encodeURIComponent(folderId)}&type=note`
  );
  // Idempotency key is the original filename, not the derived title - two
  // distinct notes can legitimately share the same title (same H1 heading,
  // different body), and storage.ts already guaranteed filenames are unique
  // per project via its own dedup suffixing at save time.
  const alreadyImported = siblings.some((s) => s.metadata_json?.source_file === sourceFile);
  if (alreadyImported) return "skipped";

  const name = resolveUniqueName(siblings.map((s) => s.name), desiredTitle);
  await apiFetch(`/pad?user_id=${encodeURIComponent(USER_ID)}`, {
    method: "POST",
    body: JSON.stringify({
      type: "note",
      name,
      parent_id: folderId,
      content,
      metadata_json: { source_file: sourceFile },
    }),
  });
  return "created";
}

async function main() {
  const entries = await fs.readdir(NOTES_DIR, { withFileTypes: true });
  const projectDirs = entries.filter((e) => e.isDirectory());

  let createdFolders = 0;
  let createdNotes = 0;
  let skippedNotes = 0;

  for (const dirent of projectDirs) {
    const projectName = dirent.name;
    const dir = path.join(NOTES_DIR, projectName);
    const folder = await findOrCreateFolder(projectName);
    createdFolders += 1;

    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md"));
    for (const filename of files) {
      const filePath = path.join(dir, filename);
      const content = await fs.readFile(filePath, "utf-8");
      const fallback = path.basename(filename, ".md");
      const title = titleFromContent(content, fallback);

      const result = await findOrCreateNote(folder.id, filename, title, content);
      if (result === "created") createdNotes += 1;
      else skippedNotes += 1;
      console.log(`[${projectName}] ${title}: ${result}`);
    }
  }

  console.log(
    `\nDone. Projects processed: ${projectDirs.length}, notes created: ${createdNotes}, notes skipped (already present): ${skippedNotes}.`
  );
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
