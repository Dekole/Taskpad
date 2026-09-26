import { randomUUID } from "node:crypto";
import express, { type Request, type Response, type NextFunction } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "./server.js";
import { createOAuthRouter, oauthMetadataHandler, verifyAccessToken } from "./oauth.js";

const PORT = Number(process.env.PORT ?? 3000);
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

const app = express();
app.use(express.json());

app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

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

// Sessions are kept alive in memory so clients can establish a connection
// once (via `initialize`) and reuse it for subsequent tool calls, instead of
// every request starting from a blank slate.
const SESSION_IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
interface Session {
  transport: StreamableHTTPServerTransport;
  lastActivity: number;
}
const sessions = new Map<string, Session>();

setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions) {
    if (now - session.lastActivity > SESSION_IDLE_TIMEOUT_MS) {
      session.transport.close();
      sessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000).unref();

app.post("/mcp", requireAuth, async (req: Request, res: Response) => {
  try {
    const sessionId = req.header("mcp-session-id");
    let transport: StreamableHTTPServerTransport;

    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      session.lastActivity = Date.now();
      transport = session.transport;
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          sessions.set(newSessionId, { transport, lastActivity: Date.now() });
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId);
      };
      const server = createServer();
      await server.connect(transport);
    } else {
      res.status(400).json({ error: "Bad Request: no valid session ID provided" });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("Error handling MCP request:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

async function handleSessionRequest(req: Request, res: Response) {
  const sessionId = req.header("mcp-session-id");
  const session = sessionId ? sessions.get(sessionId) : undefined;
  if (!session) {
    res.status(400).json({ error: "Invalid or missing session ID" });
    return;
  }
  session.lastActivity = Date.now();
  await session.transport.handleRequest(req, res);
}

app.get("/mcp", requireAuth, handleSessionRequest);
app.delete("/mcp", requireAuth, handleSessionRequest);

app.listen(PORT, () => {
  console.log(`taskpad-mcp listening on port ${PORT} (auth ${AUTH_TOKEN ? "enabled" : "DISABLED"})`);
});
