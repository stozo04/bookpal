import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isAllowed } from "@/lib/allowlist";

export type Owner = {
  userId: string;
  accessToken: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

// Returns the signed-in, allowlisted user or null. getUser() verifies the JWT
// with Supabase; getSession() is only read afterwards to obtain the token.
export async function getOwner(): Promise<Owner | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAllowed(user)) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  return { userId: user.id, accessToken: session.access_token, supabase };
}

export async function backendFetch(owner: Owner, path: string, body?: unknown, method = "POST") {
  const base = process.env.READER_BACKEND_URL;
  if (!base) throw new Error("READER_BACKEND_URL is not set");
  return fetch(new URL(path, base), {
    method,
    headers: {
      authorization: `Bearer ${owner.accessToken}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
}

// Cookie-authenticated POST routes only accept same-origin requests.
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
