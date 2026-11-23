import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isAllowed } from "@/lib/allowlist";

export type Owner = {
  userId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

// Returns the signed-in, allowlisted user or null. getUser() verifies the JWT
// with Supabase rather than trusting the cookie.
export async function getOwner(): Promise<Owner | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAllowed(user)) return null;
  return { userId: user.id, supabase };
}

// Cookie-authenticated POST routes only accept same-origin requests.
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
