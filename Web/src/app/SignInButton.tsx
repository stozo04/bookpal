"use client";
import { createClient } from "@/lib/supabase/browser";

export function SignInButton() {
  return (
    <button
      onClick={() =>
        createClient().auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/auth/callback` },
        })
      }
    >
      Continue with Google
    </button>
  );
}
