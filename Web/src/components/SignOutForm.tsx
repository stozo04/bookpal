"use client";
import { clearCovers } from "@/lib/covers";

// Signs out and clears this browser's cached covers so nothing outlives the session.
export function SignOutForm({ className }: { className?: string }) {
  return (
    <form
      action="/auth/signout"
      method="post"
      className={className}
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        await clearCovers();
        form.submit();
      }}
    >
      <button type="submit">Log out</button>
    </form>
  );
}
