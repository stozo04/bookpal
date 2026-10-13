import "server-only";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

// Local-only credential store for "Sign in with ChatGPT". OpenAI's documentation
// has apps keep these tokens in a protected local file, so they never touch the
// shared database. The directory is git-ignored.
const DIR = path.join(process.cwd(), ".local");
const FILE = path.join(DIR, "openai.json");

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

export async function readStore(): Promise<Store> {
  try {
    const parsed = JSON.parse(await readFile(FILE, "utf8")) as Store;
    return { hostId: parsed.hostId, users: parsed.users ?? {} };
  } catch {
    return { hostId: `urn:uuid:${crypto.randomUUID()}`, users: {} };
  }
}

export async function writeStore(store: Store): Promise<void> {
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
