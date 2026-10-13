import "server-only";
import type { User } from "@supabase/supabase-js";

// Fails closed: an empty or missing ALLOWED_EMAILS admits nobody.
function allowedEmails(): Set<string> {
  return new Set(
    (process.env.ALLOWED_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAllowed(user: User | null | undefined): boolean {
  const email = user?.email?.toLowerCase();
  if (!user || !email) return false;
  const verified = Boolean(user.email_confirmed_at) ||
    user.identities?.some((i) => i.provider === "google" && i.identity_data?.email_verified === true);
  return Boolean(verified) && allowedEmails().has(email);
}
