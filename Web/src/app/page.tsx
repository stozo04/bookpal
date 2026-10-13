import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAllowed } from "@/lib/allowlist";
import { SignInButton } from "./SignInButton";

const messages: Record<string, string> = {
  not_invited: "This library is private. Ask the owner for an invitation.",
  sign_in_failed: "Sign-in didn't complete. Please try again.",
  missing_code: "Sign-in didn't complete. Please try again.",
};

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (isAllowed(user)) redirect("/library");

  return (
    <main className="hero">
      <div>
        <h1>BookPal</h1>
        <p className="voice">A quiet place to read.</p>
        <SignInButton />
        {error && <p className="error" role="alert">{messages[error] ?? messages.sign_in_failed}</p>}
        <p className="fine voice">Private library · invitation only</p>
      </div>
    </main>
  );
}
