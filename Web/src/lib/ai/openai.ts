import "server-only";
import http from "node:http";
import crypto from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { readStore, updateStore, type Connection } from "./store";

// "Sign in with ChatGPT" for open-source, locally hosted apps, as documented at
// developers.openai.com/siwc. Plan usage is not available to hosted deployments.
const AUTHORIZE = "https://auth.openai.com/api/accounts/authorize";
const TOKEN = "https://auth.openai.com/api/accounts/oauth/token";
const DISCOVERY = "https://auth.openai.com/.well-known/openid-configuration";
const RESOURCE = "https://api.openai.com/v1";
const PORT = 1455;
const REDIRECT = `http://127.0.0.1:${PORT}/auth/callback`;
const SCOPE = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const USE_SCOPE = "chatgpt.tokens.use.direct";
const APP_NAME = "BookPal";

type Pending = { userId: string; verifier: string; nonce: string; clientId: string; returnTo: string; expires: number };
type Shared = { pending: Map<string, Pending>; server: http.Server | null };
const shared = ((globalThis as { __bookpalOpenAI?: Shared }).__bookpalOpenAI ??= { pending: new Map(), server: null });

const b64url = (buf: Buffer) => buf.toString("base64url");

export function isLocalHost(request: Request): boolean {
  if (process.env.VERCEL) return false;
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

async function verifyIdToken(idToken: string, clientId: string, nonce: string) {
  const config = (await (await fetch(DISCOVERY)).json()) as { issuer: string; jwks_uri: string };
  const { payload } = await jwtVerify(idToken, createRemoteJWKSet(new URL(config.jwks_uri)), {
    issuer: config.issuer,
    audience: clientId,
  });
  if (payload.nonce !== nonce) throw new Error("nonce_mismatch");
  return { subject: String(payload.sub), email: typeof payload.email === "string" ? payload.email : undefined };
}

async function tokenRequest(params: Record<string, string>) {
  const response = await fetch(TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, body: body as Record<string, string | number> };
}

function page(message: string, returnTo: string) {
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="1;url=${returnTo}">
<title>BookPal</title><body style="font:18px Georgia,serif;display:grid;place-items:center;min-height:90vh;color:#1d1d1f"><p><i>${message}</i></p>`;
}

async function handleCallback(request: http.IncomingMessage, response: http.ServerResponse) {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${PORT}`);
  if (url.pathname !== "/auth/callback") {
    response.writeHead(404).end();
    return;
  }
  const state = url.searchParams.get("state") ?? "";
  const flow = shared.pending.get(state);
  shared.pending.delete(state);
  const send = (message: string, returnTo: string, code = 200) => {
    response.writeHead(code, { "content-type": "text/html; charset=utf-8" }).end(page(message, returnTo));
    if (shared.pending.size === 0) closeListener();
  };
  if (!flow || flow.expires < Date.now()) return send("That sign-in link expired. Return to BookPal and try again.", "http://localhost:3000/ai-settings?ai_error=expired", 400);

  const back = (error?: string) => `${flow.returnTo}${error ? `?ai_error=${error}` : "?connected=1"}`;
  try {
    if (url.searchParams.get("error")) return send("Connection cancelled.", back("cancelled"));
    const code = url.searchParams.get("code");
    // A new registration returns the client ID OpenAI issued; keep that, not the placeholder.
    const issued = url.searchParams.get("client_id") ?? (flow.clientId === "dynamic_agent_client" ? "" : flow.clientId);
    if (!code || !issued) return send("OpenAI didn't finish registering BookPal.", back("registration"));
    if (flow.clientId !== "dynamic_agent_client" && issued !== flow.clientId) return send("Unexpected client.", back("registration"));

    const exchanged = await tokenRequest({
      grant_type: "authorization_code", client_id: issued, code, code_verifier: flow.verifier,
      redirect_uri: REDIRECT, resource: RESOURCE,
    });
    const t = exchanged.body;
    if (!exchanged.ok || !t.access_token || !t.id_token) return send("OpenAI couldn't complete the sign-in.", back("exchange"));

    const scope = String(t.scope ?? "");
    if (!scope.split(" ").includes(USE_SCOPE)) return send("Signed in, but plan usage wasn't allowed.", back("scope"));
    const identity = await verifyIdToken(String(t.id_token), issued, flow.nonce);

    await updateStore((store) => {
      const previous = store.users[flow.userId];
      store.users[flow.userId] = {
        clientId: issued, accessToken: String(t.access_token), refreshToken: String(t.refresh_token ?? ""),
        expiresAt: Math.floor(Date.now() / 1000) + Number(t.expires_in ?? 3600), scope,
        subject: identity.subject, email: identity.email, selection: previous?.selection,
      };
    });
    send("Connected. Taking you back to BookPal…", back());
  } catch {
    send("Something went wrong while connecting.", back("failed"));
  }
}

function closeListener() {
  shared.server?.close();
  shared.server = null;
}

function ensureListener(): Promise<void> {
  if (shared.server?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => void handleCallback(req, res));
    server.once("error", (error: NodeJS.ErrnoException) => reject(new Error(error.code === "EADDRINUSE" ? "port_in_use" : "listener_failed")));
    server.listen(PORT, "127.0.0.1", () => {
      shared.server = server;
      resolve();
    });
  });
}

export async function startConnect(userId: string, returnTo: string): Promise<string> {
  const store = await readStore();
  const known = store.users[userId]?.clientId;
  const verifier = b64url(crypto.randomBytes(48));
  const state = b64url(crypto.randomBytes(24));
  const nonce = b64url(crypto.randomBytes(24));
  const clientId = known ?? "dynamic_agent_client";
  await ensureListener();
  const expires = Date.now() + 10 * 60_000;
  shared.pending.set(state, { userId, verifier, nonce, clientId, returnTo, expires });
  // An abandoned sign-in must not leave the port open.
  setTimeout(() => {
    shared.pending.delete(state);
    if (shared.pending.size === 0) closeListener();
  }, 10 * 60_000 + 1000).unref();
  await updateStore((s) => { s.hostId = store.hostId; }); // persist the stable host ID

  const params = new URLSearchParams({
    client_id: clientId, ext_agent_host_id: store.hostId, response_type: "code", redirect_uri: REDIRECT,
    scope: SCOPE, resource: RESOURCE, state, nonce, code_challenge_method: "S256",
    code_challenge: b64url(crypto.createHash("sha256").update(verifier).digest()),
  });
  if (!known) params.set("agent_name_hint", APP_NAME);
  return `${AUTHORIZE}?${params}`;
}

export async function disconnect(userId: string) {
  await updateStore((s) => { delete s.users[userId]; });
}

export async function getConnection(userId: string): Promise<Connection | null> {
  return (await readStore()).users[userId] ?? null;
}

// A valid access token, refreshed (and rotated) when close to expiry.
export async function accessTokenFor(userId: string, forceRefresh = false): Promise<string | null> {
  const connection = await getConnection(userId);
  if (!connection) return null;
  if (!forceRefresh && connection.expiresAt - 60 > Date.now() / 1000) return connection.accessToken;
  if (!connection.refreshToken) return null;

  const refreshed = await tokenRequest({
    grant_type: "refresh_token", client_id: connection.clientId, refresh_token: connection.refreshToken, resource: RESOURCE,
  });
  const t = refreshed.body;
  if (!refreshed.ok || !t.access_token) return null;
  await updateStore((s) => {
    const current = s.users[userId];
    if (!current) return;
    current.accessToken = String(t.access_token);
    current.refreshToken = String(t.refresh_token ?? current.refreshToken); // the refresh token rotates
    current.expiresAt = Math.floor(Date.now() / 1000) + Number(t.expires_in ?? 3600);
    current.scope = String(t.scope ?? current.scope);
  });
  return String(t.access_token);
}

export type ModelOption = { slug: string; name: string; reasoning: string[] };

export async function listModels(token: string): Promise<ModelOption[]> {
  const response = await fetch(`${RESOURCE}/models`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) throw new Error(`models_${response.status}`);
  const body = (await response.json()) as { data?: Record<string, unknown>[]; models?: Record<string, unknown>[] };
  const rows = body.data ?? body.models ?? [];
  return rows
    .filter((m) => (m.visibility ?? "list") === "list")
    .map((m) => {
      const levels = (m.supported_reasoning_efforts ?? m.supported_reasoning_levels ?? m.reasoning_efforts) as unknown;
      const parsed = Array.isArray(levels) ? levels.map((l) => (typeof l === "string" ? l : String((l as { effort?: string })?.effort ?? ""))).filter(Boolean) : [];
      return {
        slug: String(m.slug ?? m.id),
        name: String(m.display_name ?? m.slug ?? m.id),
        reasoning: parsed.length ? parsed : ["low", "medium", "high"],
      };
    });
}

export const RESPONSES_URL = `${RESOURCE}/responses`;
