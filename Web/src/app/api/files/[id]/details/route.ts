import { NextResponse } from "next/server";
import { z } from "zod";
import { backendFetch, getOwner, sameOrigin } from "@/lib/owner";

const body = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  author: z.string().trim().max(300).optional(),
  description: z.string().trim().max(4000).optional(),
});
const fail = (status: number, message: string) => NextResponse.json({ error: { message } }, { status });

// Title lives on the library file (shared with the Mac app); author and description
// live in reader_book_details. RLS limits every write to the owner's own rows.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return fail(403, "Cross-origin request refused");
  const owner = await getOwner();
  if (!owner) return fail(401, "Please sign in again");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(400, "Invalid book");
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Please check the title, author and description");
  const { title, author, description } = parsed.data;

  const { data: file } = await owner.supabase.from("library_files").select("display_name").eq("id", id).eq("user_id", owner.userId).maybeSingle();
  if (!file) return fail(404, "Book not found");

  if (title !== undefined && title !== file.display_name) {
    const r = await backendFetch(owner, `/v1/files/${id}`, { displayName: title }, "PATCH");
    if (!r.ok) return fail(502, "The title couldn't be changed");
  }
  if (author !== undefined || description !== undefined) {
    const row: Record<string, unknown> = { user_id: owner.userId, file_id: id };
    if (author !== undefined) row.author = author || null;
    if (description !== undefined) row.description = description || null;
    const { error } = await owner.supabase.from("reader_book_details").upsert(row, { onConflict: "user_id,file_id" });
    if (error) return fail(502, "The details couldn't be saved");
  }
  return new NextResponse(null, { status: 204 });
}
