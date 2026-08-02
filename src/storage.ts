import { promises as fs } from "node:fs";
import path from "node:path";

export const DEFAULT_PROJECT = "default";

const NOTES_DIR = process.env.NOTES_DIR
  ? path.resolve(process.env.NOTES_DIR)
  : path.resolve(process.cwd(), "data", "notes");

const NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

export interface NoteSummary {
  project: string;
  title: string;
  filename: string;
}

export interface Note extends NoteSummary {
  content: string;
}

export interface SearchResult extends NoteSummary {
  snippet: string;
}

function assertValidProjectName(project: string): void {
  if (!NAME_PATTERN.test(project)) {
    throw new Error(
      `Invalid project name "${project}": only letters, numbers, "-" and "_" are allowed.`
    );
  }
}

function slugify(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `note-${Date.now()}`;
}

function normalizeProject(project?: string): string {
  const trimmed = project?.trim();
  return trimmed ? trimmed : DEFAULT_PROJECT;
}

function projectDir(project: string): string {
  assertValidProjectName(project);
  return path.join(NOTES_DIR, project);
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function readTitle(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath, "utf-8");
  const firstLine = content.split("\n", 1)[0] ?? "";
  return firstLine.replace(/^#+\s*/, "").trim() || path.basename(filePath, ".md");
}

export async function listProjects(): Promise<string[]> {
  await ensureDir(NOTES_DIR);
  const entries = await fs.readdir(NOTES_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

export async function createProject(project: string): Promise<string> {
  const name = normalizeProject(project);
  await ensureDir(projectDir(name));
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
  const dir = projectDir(project);
  await ensureDir(dir);

  const slug = slugify(title);
  let filename = `${slug}.md`;
  let attempt = 2;
  while (await fileExists(path.join(dir, filename))) {
    filename = `${slug}-${attempt}.md`;
    attempt += 1;
  }

  const body = params.content.trim();
  const fileContent = body.startsWith("#")
    ? `${body}\n`
    : `# ${title}\n\n${body}\n`;

  await fs.writeFile(path.join(dir, filename), fileContent, "utf-8");
  return { project, title, filename };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function findByTitleOrFilename(
  files: string[],
  titleOrSlug: string
): string | undefined {
  const slug = slugify(titleOrSlug);
  return files.find(
    (f) => f === titleOrSlug || f === `${slug}.md` || f.startsWith(`${slug}-`)
  );
}

export async function getNote(params: {
  project?: string;
  title: string;
}): Promise<Note> {
  const project = normalizeProject(params.project);
  const dir = projectDir(project);
  let files: string[];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md"));
  } catch {
    throw new Error(`Project "${project}" does not exist.`);
  }

  const filename = findByTitleOrFilename(files, params.title);
  if (!filename) {
    throw new Error(`No note matching "${params.title}" in project "${project}".`);
  }

  const filePath = path.join(dir, filename);
  const content = await fs.readFile(filePath, "utf-8");
  const title = await readTitle(filePath);
  return { project, title, filename, content };
}

export async function listNotes(params: { project?: string }): Promise<NoteSummary[]> {
  const projects = params.project ? [normalizeProject(params.project)] : await listProjects();
  const results: NoteSummary[] = [];

  for (const project of projects) {
    const dir = projectDir(project);
    let files: string[];
    try {
      files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md"));
    } catch {
      continue;
    }
    for (const filename of files.sort()) {
      const title = await readTitle(path.join(dir, filename));
      results.push({ project, title, filename });
    }
  }
  return results;
}

export async function searchNotes(params: {
  query: string;
  project?: string;
}): Promise<SearchResult[]> {
  const projects = params.project ? [normalizeProject(params.project)] : await listProjects();
  const needle = params.query.toLowerCase();
  const results: SearchResult[] = [];

  for (const project of projects) {
    const dir = projectDir(project);
    let files: string[];
    try {
      files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md"));
    } catch {
      continue;
    }
    for (const filename of files.sort()) {
      const filePath = path.join(dir, filename);
      const content = await fs.readFile(filePath, "utf-8");
      const idx = content.toLowerCase().indexOf(needle);
      if (idx === -1) continue;
      const title = await readTitle(filePath);
      const start = Math.max(0, idx - 40);
      const end = Math.min(content.length, idx + needle.length + 40);
      const snippet = `${start > 0 ? "…" : ""}${content.slice(start, end).replace(/\n/g, " ")}${
        end < content.length ? "…" : ""
      }`;
      results.push({ project, title, filename, snippet });
    }
  }
  return results;
}
