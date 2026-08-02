import express, { type Request, type Response, type NextFunction } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";
import { createOAuthRouter, oauthMetadataHandler, verifyAccessToken } from "./oauth.js";

const PORT = Number(process.env.PORT ?? 3000);
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

const app = express();
app.use(express.json());

app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/.well-known/oauth-authorization-server", oauthMetadataHandler);
app.use("/mcp/oauth", createOAuthRouter());

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!AUTH_TOKEN) {
    // No token configured: auth disabled (local/dev testing only).
    next();
    return;
  }
  const header = req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  // Accept either the static token (Claude Code CLI) or a valid signed
  // access token from the Google-backed OAuth flow (Claude mobile/web).
  if (token === AUTH_TOKEN || (token && verifyAccessToken(token))) {
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized" });
}

app.post("/mcp", requireAuth, async (req: Request, res: Response) => {
  try {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("Error handling MCP request:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// Stateless server: no sessions to resume (GET) or terminate (DELETE).
app.get("/mcp", requireAuth, (_req, res) => {
  res.status(405).json({ error: "Method not allowed (stateless server)" });
});
app.delete("/mcp", requireAuth, (_req, res) => {
  res.status(405).json({ error: "Method not allowed (stateless server)" });
});

app.listen(PORT, () => {
  console.log(`taskpad-mcp listening on port ${PORT} (auth ${AUTH_TOKEN ? "enabled" : "DISABLED"})`);
});
