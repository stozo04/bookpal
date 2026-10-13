import { NextResponse } from "next/server";
import { getOwner, sameOrigin } from "@/lib/owner";

const fail = (status: number, message: string) => NextResponse.json({ error: { message } }, { status });
const MAX_BYTES = 800 * 1024;
const validId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const pathFor = (userId: string, id: string) => `${userId}/${id}/cover`;

// Serves the owner's custom cover. The ?v= query only busts the browser cache.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await getOwner();
  if (!owner) return fail(401, "Please sign in again");
  const { id } = await params;
  if (!validId(id)) return fail(400, "Invalid book");
  const { data, error } = await owner.supabase.storage.from("reader-files").download(pathFor(owner.userId, id));
  if (error || !data) return fail(404, "No custom cover");
  return new NextResponse(await data.arrayBuffer(), {
    headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600", "content-disposition": "inline" },
  });
}

// Accepts one small JPEG (the browser resizes covers before sending).
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return fail(403, "Cross-origin request refused");
  const owner = await getOwner();
  if (!owner) return fail(401, "Please sign in again");
  const { id } = await params;
  if (!validId(id)) return fail(400, "Invalid book");

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_BYTES) return fail(413, "That image is too large");
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) return fail(415, "Please use a JPEG image");

  const { data: file } = await owner.supabase.from("library_files").select("id").eq("id", id).eq("user_id", owner.userId).maybeSingle();
  if (!file) return fail(404, "Book not found");

  const up = await owner.supabase.storage.from("reader-files").upload(pathFor(owner.userId, id), bytes, { contentType: "image/jpeg", upsert: true });
  if (up.error) return fail(502, "The cover couldn't be saved");
  const { error } = await owner.supabase.from("reader_book_details")
    .upsert({ user_id: owner.userId, file_id: id, cover_updated_at: new Date().toISOString() }, { onConflict: "user_id,file_id" });
  if (error) return fail(502, "The cover couldn't be saved");
  return new NextResponse(null, { status: 204 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return fail(403, "Cross-origin request refused");
  const owner = await getOwner();
  if (!owner) return fail(401, "Please sign in again");
  const { id } = await params;
  if (!validId(id)) return fail(400, "Invalid book");
  await owner.supabase.storage.from("reader-files").remove([pathFor(owner.userId, id)]);
  await owner.supabase.from("reader_book_details").update({ cover_updated_at: null }).eq("user_id", owner.userId).eq("file_id", id);
  return new NextResponse(null, { status: 204 });
}
