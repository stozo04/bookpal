import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwner, sameOrigin } from "@/lib/owner";

const body = z.object({
  kind: z.enum(["cast", "summary", "character"]),
  label: z.string().trim().min(1).max(200),
  progress: z.number().min(0).max(1),
  content: z.record(z.string(), z.unknown()),
});
const fail = (status: number, message: string) => NextResponse.json({ error: { message } }, { status });

// Saves one AI note. A book has one cast map, so a new cast replaces the old one.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return fail(403, "Cross-origin request refused");
  const owner = await getOwner();
  if (!owner) return fail(401, "Please sign in again");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(400, "Invalid book");
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "That note couldn't be read");
  const { kind, label, progress, content } = parsed.data;
  if (JSON.stringify(content).length > 150_000) return fail(413, "That note is too large");

  if (kind === "cast") {
    await owner.supabase.from("reader_ai_notes").delete().eq("user_id", owner.userId).eq("file_id", id).eq("kind", "cast");
  }
  const { error } = await owner.supabase
    .from("reader_ai_notes")
    .upsert({ user_id: owner.userId, file_id: id, kind, label, progress, content }, { onConflict: "user_id,file_id,kind,label" });
  if (error) return fail(502, "The note couldn't be saved");
  return new NextResponse(null, { status: 204 });
}
