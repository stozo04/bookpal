import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/Avatar";
import { SignOutForm } from "@/components/SignOutForm";
import { AppearanceControl } from "@/components/AppearanceControl";

const date = (iso?: string | null) =>
  iso ? new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(new Date(iso)) : "—";

function size(bytes: number) {
  if (bytes === 0) return "0 KB";
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function Profile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // Same user-scoped, RLS-limited query as the library.
  const { data: files } = await supabase.from("library_files").select("byte_size").eq("user_id", user.id);

  const { data: profile } = await supabase.from("reader_profile").select("appearance").eq("user_id", user.id).maybeSingle();
  const appearance = (profile?.appearance ?? "system") as "system" | "light" | "dark";

  const name = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? "Reader";
  const books = files?.length ?? 0;
  const bytes = files?.reduce((sum, f) => sum + Number(f.byte_size), 0) ?? 0;

  return (
    <main className="narrow">
      <div className="profile-head">
        <Avatar name={name} url={user.user_metadata?.avatar_url as string | undefined} size={72} />
        <div>
          <h1>{name}</h1>
          <div className="voice">{user.email}</div>
        </div>
      </div>

      <h2 className="section">Appearance</h2>
      <p className="voice section-note">Saved to your profile, so it follows you to every device.</p>
      <AppearanceControl initial={appearance} />

      <h2 className="section" style={{ marginTop: 44 }}>Account</h2>
      <dl className="facts">
        <div><dt>Sign-in</dt><dd>Google</dd></div>
        <div><dt>Member since</dt><dd>{date(user.created_at)}</dd></div>
        <div><dt>Last sign-in</dt><dd>{date(user.last_sign_in_at)}</dd></div>
      </dl>

      <h2 className="section">Your shelf</h2>
      <dl className="facts">
        <div><dt>Books</dt><dd>{books}</dd></div>
        <div><dt>Storage used</dt><dd>{size(bytes)}</dd></div>
      </dl>

      <SignOutForm className="profile-actions" />
    </main>
  );
}
