import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as storage from "./api-client.js";

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "taskpad-mcp", version: "0.1.0" });

  server.tool(
    "list_projects",
    "List all existing projects (folders notes are organized under).",
    {},
    async () => {
      try {
        const projects = await storage.listProjects();
        return textResult(
          projects.length ? projects.join("\n") : "No projects yet."
        );
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "create_project",
    'Create a new project. If omitted, the project is called "default".',
    { project: z.string().optional().describe("Project name") },
    async ({ project }) => {
      try {
        const created = await storage.createProject(project ?? storage.DEFAULT_PROJECT);
        return textResult(`Project "${created}" is ready.`);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "save_note",
    'Save a note under a project. If project is omitted, the note is saved to the "default" project. Every note must have a short title.',
    {
      project: z.string().optional().describe('Project name, defaults to "default"'),
      title: z.string().describe("Short title for the note"),
      content: z.string().describe("Body of the note"),
    },
    async ({ project, title, content }) => {
      try {
        const summary = await storage.saveNote({ project, title, content });
        return textResult(
          `Saved "${summary.title}" to project "${summary.project}" (${summary.filename}).`
        );
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "get_note",
    'Retrieve a single note by title from a project (defaults to "default").',
    {
      project: z.string().optional().describe('Project name, defaults to "default"'),
      title: z.string().describe("Title (or slug) of the note to fetch"),
    },
    async ({ project, title }) => {
      try {
        const note = await storage.getNote({ project, title });
        return textResult(`# ${note.title}\n(project: ${note.project})\n\n${note.content}`);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "list_notes",
    "List notes with their titles. If project is omitted, lists notes across all projects.",
    {
      project: z.string().optional().describe("Project name; omit to list across all projects"),
    },
    async ({ project }) => {
      try {
        const notes = await storage.listNotes({ project });
        if (!notes.length) return textResult("No notes found.");
        return textResult(
          notes.map((n) => `[${n.project}] ${n.title} (${n.filename})`).join("\n")
        );
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "search_notes",
    "Search note contents for a text query. If project is omitted, searches across all projects.",
    {
      query: z.string().describe("Text to search for"),
      project: z.string().optional().describe("Project name; omit to search all projects"),
    },
    async ({ query, project }) => {
      try {
        const results = await storage.searchNotes({ query, project });
        if (!results.length) return textResult("No matches found.");
        return textResult(
          results
            .map((r) => `[${r.project}] ${r.title} (${r.filename}): ${r.snippet}`)
            .join("\n")
        );
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  return server;
}
