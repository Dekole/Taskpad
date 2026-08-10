// Shared between api-client.ts (Block 4) and scripts/import-notes.ts (Block 3).
// Replicates storage.ts's title-derivation and dedup-matching behavior, but
// operating on human-readable names rather than filesystem-safe slugs, since
// Postgres has no filesystem-safe-name constraint to satisfy.

export function titleFromContent(content: string, fallback: string): string {
  const firstLine = content.split("\n", 1)[0] ?? "";
  return firstLine.replace(/^#+\s*/, "").trim() || fallback;
}

export function normalizeForMatch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Given existing names in the same scope (e.g. sibling notes in a project),
// returns `desiredName` unchanged if it doesn't collide, or a suffixed
// variant ("Groceries (2)") if it does - mirrors storage.ts's filename
// "-2"/"-3" collision handling, but as a user-facing suffix instead of a
// buried filename detail.
export function resolveUniqueName(existingNames: string[], desiredName: string): string {
  const normalizedExisting = new Set(existingNames.map(normalizeForMatch));
  if (!normalizedExisting.has(normalizeForMatch(desiredName))) {
    return desiredName;
  }
  let attempt = 2;
  let candidate = `${desiredName} (${attempt})`;
  while (normalizedExisting.has(normalizeForMatch(candidate))) {
    attempt += 1;
    candidate = `${desiredName} (${attempt})`;
  }
  return candidate;
}
