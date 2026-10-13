import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwner, sameOrigin } from "@/lib/owner";

const body = z.object({ appearance: z.enum(["system", "light", "dark"]) });

export async function PUT(request: Request) {
  const fail = (status: number, message: string) => NextResponse.json({ error: { message } }, { status });
  if (!sameOrigin(request)) return fail(403, "Cross-origin request refused");
  const owner = await getOwner();
  if (!owner) return fail(401, "Please sign in again");
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Choose System, Light or Dark");

  // RLS limits this to the user's own row.
  const { error } = await owner.supabase
    .from("reader_profile")
    .upsert({ user_id: owner.userId, appearance: parsed.data.appearance }, { onConflict: "user_id" });
  if (error) return fail(502, "Your choice couldn't be saved");

  const response = new NextResponse(null, { status: 204 });
  // A cookie mirrors the choice so every page renders in the right mode with no flash.
  response.cookies.set("bookpal-appearance", parsed.data.appearance, {
    path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", secure: process.env.NODE_ENV === "production",
  });
  return response;
}
