import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAllowed } from "@/lib/allowlist";

export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}/?error=missing_code`);

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/?error=sign_in_failed`);

  const { data: { user } } = await supabase.auth.getUser();
  if (!isAllowed(user)) {
    await supabase.auth.signOut({ scope: "local" });
    return NextResponse.redirect(`${origin}/?error=not_invited`);
  }
  const { data: profile } = await supabase.from("reader_profile").select("appearance").eq("user_id", user!.id).maybeSingle();
  const response = NextResponse.redirect(`${origin}/library`);
  response.cookies.set("bookpal-appearance", profile?.appearance ?? "system", {
    path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", secure: process.env.NODE_ENV === "production",
  });
  return response;
}
