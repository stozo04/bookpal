import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAllowed } from "@/lib/allowlist";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { AppearanceSync } from "@/components/AppearanceSync";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");
  if (!isAllowed(user)) {
    await supabase.auth.signOut({ scope: "local" });
    redirect("/?error=not_invited");
  }

  const { data: profile } = await supabase.from("reader_profile").select("appearance").eq("user_id", user.id).maybeSingle();
  const appearance = (profile?.appearance ?? "system") as "system" | "light" | "dark";

  const name = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? "Reader";
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;

  return (
    <div className="shell">
      <AppearanceSync value={appearance} />
      <AppHeader name={name} email={user.email ?? ""} avatarUrl={avatarUrl} />
      <div className="shell-body">{children}</div>
      <AppFooter />
    </div>
  );
}
