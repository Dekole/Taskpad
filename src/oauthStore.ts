import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const OAUTH_DIR = process.env.OAUTH_DIR
  ? path.resolve(process.env.OAUTH_DIR)
  : path.resolve(process.cwd(), "data", "oauth");
const CLIENTS_FILE = path.join(OAUTH_DIR, "clients.json");

export interface RegisteredClient {
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  created_at: number;
}

interface PendingAuth {
  clientId: string;
  redirectUri: string;
  state?: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  createdAt: number;
}

interface IssuedCode {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  email: string;
  createdAt: number;
}

const PENDING_TTL_MS = 10 * 60 * 1000; // 10 minutes to complete Google login
const CODE_TTL_MS = 60 * 1000; // 60 seconds to redeem our code for a token

const pendingAuths = new Map<string, PendingAuth>();
const issuedCodes = new Map<string, IssuedCode>();
let clients = new Map<string, RegisteredClient>();
let loaded = false;

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await fs.readFile(CLIENTS_FILE, "utf-8");
    const parsed: RegisteredClient[] = JSON.parse(raw);
    clients = new Map(parsed.map((c) => [c.client_id, c]));
  } catch {
    clients = new Map();
  }
}

async function persistClients(): Promise<void> {
  await fs.mkdir(OAUTH_DIR, { recursive: true });
  await fs.writeFile(CLIENTS_FILE, JSON.stringify([...clients.values()], null, 2), "utf-8");
}

export async function registerClient(params: {
  client_name?: string;
  redirect_uris: string[];
}): Promise<RegisteredClient> {
  await ensureLoaded();
  const client: RegisteredClient = {
    client_id: crypto.randomUUID(),
    client_name: params.client_name,
    redirect_uris: params.redirect_uris,
    created_at: Date.now(),
  };
  clients.set(client.client_id, client);
  await persistClients();
  return client;
}

export async function getClient(clientId: string): Promise<RegisteredClient | undefined> {
  await ensureLoaded();
  return clients.get(clientId);
}

function sweepPending(): void {
  const now = Date.now();
  for (const [key, value] of pendingAuths) {
    if (now - value.createdAt > PENDING_TTL_MS) pendingAuths.delete(key);
  }
}

function sweepCodes(): void {
  const now = Date.now();
  for (const [key, value] of issuedCodes) {
    if (now - value.createdAt > CODE_TTL_MS) issuedCodes.delete(key);
  }
}

export function createPendingAuth(params: Omit<PendingAuth, "createdAt">): string {
  sweepPending();
  const googleState = crypto.randomBytes(24).toString("hex");
  pendingAuths.set(googleState, { ...params, createdAt: Date.now() });
  return googleState;
}

export function consumePendingAuth(googleState: string): PendingAuth | undefined {
  sweepPending();
  const pending = pendingAuths.get(googleState);
  if (pending) pendingAuths.delete(googleState);
  return pending;
}

export function issueCode(params: Omit<IssuedCode, "createdAt">): string {
  sweepCodes();
  const code = crypto.randomBytes(32).toString("hex");
  issuedCodes.set(code, { ...params, createdAt: Date.now() });
  return code;
}

export function consumeCode(code: string): IssuedCode | undefined {
  sweepCodes();
  const issued = issuedCodes.get(code);
  if (issued) issuedCodes.delete(code); // single-use
  return issued;
}
