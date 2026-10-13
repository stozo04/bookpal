import "server-only";
import crypto from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { get, put } from "@vercel/blob";

// Credential store for "Sign in with ChatGPT". OpenAI's documentation has apps keep
// these tokens in a protected file, never in the shared database. Locally that is a
// git-ignored 0600 file. When a Blob store and AI_CREDENTIALS_KEY are configured, the
// same record lives in a private Vercel Blob, encrypted (AES-256-GCM) with that key, so
// the hosted site and your computer share one connection and one set of rotating tokens.
const DIR = path.join(process.cwd(), ".local");
const FILE = path.join(DIR, "openai.json");
const BLOB = "ai/openai-credentials.enc";

export type Connection = {
  clientId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch seconds
  scope: string;
  subject: string;
  email?: string;
  selection?: { model: string; reasoning: string; name?: string };
};

export type Store = { hostId: string; users: Record<string, Connection> };

const blobKey = () => {
  const raw = process.env.AI_CREDENTIALS_KEY;
  if (!raw || !process.env.BLOB_READ_WRITE_TOKEN) return null;
  const key = Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
};

const seal = (key: Buffer, text: string) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
};

const unseal = (key: Buffer, data: Buffer) => {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
};

const fresh = (): Store => ({ hostId: `urn:uuid:${crypto.randomUUID()}`, users: {} });

async function readFileStore(): Promise<Store | null> {
  try {
    const parsed = JSON.parse(await readFile(FILE, "utf8")) as Store;
    return { hostId: parsed.hostId, users: parsed.users ?? {} };
  } catch {
    return null;
  }
}

export async function readStore(): Promise<Store> {
  const key = blobKey();
  if (!key) return (await readFileStore()) ?? fresh();
  const found = await get(BLOB, { access: "private", useCache: false });
  if (found?.statusCode === 200) {
    const parsed = JSON.parse(unseal(key, Buffer.from(await new Response(found.stream).arrayBuffer()))) as Store;
    return { hostId: parsed.hostId, users: parsed.users ?? {} };
  }
  // First use of the shared store: carry over an existing local connection, if any.
  return (await readFileStore()) ?? fresh();
}

export async function writeStore(store: Store): Promise<void> {
  const key = blobKey();
  if (key) {
    await put(BLOB, seal(key, JSON.stringify(store)), {
      access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/octet-stream",
    });
    return;
  }
  await mkdir(DIR, { recursive: true, mode: 0o700 });
  const temp = `${FILE}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(store, null, 2), { mode: 0o600 });
  await chmod(temp, 0o600);
  await rename(temp, FILE); // atomic replace
}

// Serialise writes so concurrent refreshes cannot clobber each other.
let queue: Promise<unknown> = Promise.resolve();
export function updateStore<T>(change: (store: Store) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const store = await readStore();
    const result = await change(store);
    await writeStore(store);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}
