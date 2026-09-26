import crypto from "node:crypto";
import express, { type Request, type Response, type Router } from "express";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import * as store from "./oauthStore.js";

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? "";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const ALLOWED_GOOGLE_EMAIL = (process.env.ALLOWED_GOOGLE_EMAIL ?? "").toLowerCase();
const JWT_SECRET = process.env.MCP_JWT_SECRET ?? "";
const GOOGLE_CALLBACK_PATH = "/mcp/oauth/google/callback";

function isConfigured(): boolean {
  return Boolean(
    PUBLIC_BASE_URL && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && ALLOWED_GOOGLE_EMAIL && JWT_SECRET
  );
}

function googleClient(): OAuth2Client {
  return new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, `${PUBLIC_BASE_URL}${GOOGLE_CALLBACK_PATH}`);
}

function verifyPkce(verifier: string, challenge: string): boolean {
  const computed = crypto.createHash("sha256").update(verifier).digest("base64url");
  return computed === challenge;
}

function issueAccessToken(email: string, clientId: string): string {
  return jwt.sign({ email, client_id: clientId, typ: "access" }, JWT_SECRET, { expiresIn: "30d" });
}

function issueRefreshToken(email: string, clientId: string): string {
  return jwt.sign({ email, client_id: clientId, typ: "refresh" }, JWT_SECRET, { expiresIn: "180d" });
}

export function verifyAccessToken(token: string): { email: string } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    if (payload.typ !== "access" || typeof payload.email !== "string") return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}

export function oauthMetadataHandler(_req: Request, res: Response) {
  if (!isConfigured()) {
    res.status(503).json({ error: "OAuth not configured on this server" });
    return;
  }
  res.json({
    issuer: PUBLIC_BASE_URL,
    authorization_endpoint: `${PUBLIC_BASE_URL}/mcp/oauth/authorize`,
    token_endpoint: `${PUBLIC_BASE_URL}/mcp/oauth/token`,
    registration_endpoint: `${PUBLIC_BASE_URL}/mcp/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
  });
}

export function createOAuthRouter(): Router {
  const router = express.Router();
  router.use(express.urlencoded({ extended: true }));

  router.use((_req, res, next) => {
    if (!isConfigured()) {
      res.status(503).json({ error: "OAuth not configured on this server" });
      return;
    }
    next();
  });

  router.post("/register", async (req: Request, res: Response) => {
    const redirectUris: unknown = req.body?.redirect_uris;
    if (!Array.isArray(redirectUris) || redirectUris.some((u) => typeof u !== "string") || redirectUris.length === 0) {
      res.status(400).json({ error: "invalid_client_metadata", error_description: "redirect_uris is required" });
      return;
    }
    const client = await store.registerClient({
      client_name: typeof req.body?.client_name === "string" ? req.body.client_name : undefined,
      redirect_uris: redirectUris as string[],
    });
    res.status(201).json({
      client_id: client.client_id,
      client_name: client.client_name,
      redirect_uris: client.redirect_uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });
  });

  router.get("/authorize", async (req: Request, res: Response) => {
    const { client_id, redirect_uri, state, code_challenge, code_challenge_method, response_type } = req.query;

    if (response_type !== "code") {
      res.status(400).send("Only response_type=code is supported");
      return;
    }
    if (typeof client_id !== "string" || typeof redirect_uri !== "string" || typeof code_challenge !== "string") {
      res.status(400).send("Missing client_id, redirect_uri, or code_challenge");
      return;
    }
    if (code_challenge_method !== "S256") {
      res.status(400).send("Only code_challenge_method=S256 is supported");
      return;
    }

    const client = await store.getClient(client_id);
    if (!client || !client.redirect_uris.includes(redirect_uri)) {
      res.status(400).send("Unknown client_id or redirect_uri does not match registration");
      return;
    }

    const googleState = store.createPendingAuth({
      clientId: client_id,
      redirectUri: redirect_uri,
      state: typeof state === "string" ? state : undefined,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method,
    });

    const googleUrl = googleClient().generateAuthUrl({
      access_type: "online",
      scope: ["openid", "email"],
      state: googleState,
      prompt: "select_account",
    });
    res.redirect(googleUrl);
  });

  router.get("/google/callback", async (req: Request, res: Response) => {
    const { code, state } = req.query;
    if (typeof code !== "string" || typeof state !== "string") {
      res.status(400).send("Missing code or state from Google");
      return;
    }

    const pending = store.consumePendingAuth(state);
    if (!pending) {
      res.status(400).send("This sign-in link expired or was already used. Please try connecting again.");
      return;
    }

    try {
      const client = googleClient();
      const { tokens } = await client.getToken(code);
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token ?? "", audience: GOOGLE_CLIENT_ID });
      const payload = ticket.getPayload();
      const email = payload?.email?.toLowerCase();

      if (!email || !payload?.email_verified || email !== ALLOWED_GOOGLE_EMAIL) {
        const denyUrl = new URL(pending.redirectUri);
        denyUrl.searchParams.set("error", "access_denied");
        if (pending.state) denyUrl.searchParams.set("state", pending.state);
        res.redirect(denyUrl.toString());
        return;
      }

      const ourCode = store.issueCode({
        clientId: pending.clientId,
        redirectUri: pending.redirectUri,
        codeChallenge: pending.codeChallenge,
        codeChallengeMethod: pending.codeChallengeMethod,
        email,
      });

      const redirectUrl = new URL(pending.redirectUri);
      redirectUrl.searchParams.set("code", ourCode);
      if (pending.state) redirectUrl.searchParams.set("state", pending.state);
      res.redirect(redirectUrl.toString());
    } catch (err) {
      console.error("Google OAuth callback error:", err);
      res.status(500).send("Something went wrong verifying your Google sign-in. Please try again.");
    }
  });

  router.post("/token", async (req: Request, res: Response) => {
    const grantType = req.body?.grant_type;

    if (grantType === "authorization_code") {
      const { code, redirect_uri, client_id, code_verifier } = req.body;
      if (
        typeof code !== "string" ||
        typeof redirect_uri !== "string" ||
        typeof client_id !== "string" ||
        typeof code_verifier !== "string"
      ) {
        res.status(400).json({ error: "invalid_request" });
        return;
      }

      const issued = store.consumeCode(code);
      if (!issued || issued.clientId !== client_id || issued.redirectUri !== redirect_uri) {
        res.status(400).json({ error: "invalid_grant" });
        return;
      }
      if (!verifyPkce(code_verifier, issued.codeChallenge)) {
        res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
        return;
      }

      res.json({
        access_token: issueAccessToken(issued.email, client_id),
        token_type: "Bearer",
        expires_in: 60 * 60 * 24 * 30,
        refresh_token: issueRefreshToken(issued.email, client_id),
        scope: "mcp",
      });
      return;
    }

    if (grantType === "refresh_token") {
      const { refresh_token, client_id } = req.body;
      if (typeof refresh_token !== "string") {
        res.status(400).json({ error: "invalid_request" });
        return;
      }
      try {
        const payload = jwt.verify(refresh_token, JWT_SECRET) as jwt.JwtPayload;
        if (payload.typ !== "refresh" || typeof payload.email !== "string") {
          throw new Error("not a refresh token");
        }
        res.json({
          access_token: issueAccessToken(payload.email, client_id ?? payload.client_id),
          token_type: "Bearer",
          expires_in: 60 * 60 * 24 * 30,
          scope: "mcp",
        });
      } catch {
        res.status(400).json({ error: "invalid_grant" });
      }
      return;
    }

    res.status(400).json({ error: "unsupported_grant_type" });
  });

  return router;
}
