import { NextResponse } from "next/server";
import { getOwner, sameOrigin } from "@/lib/owner";
import { BUCKET, fail, ownsBook, readJpeg, serveJpeg, validFileId } from "@/lib/storedJpeg";

const pathFor = (userId: string, id: string) => `${userId}/${id}/cover`;

// Serves the owner's custom cover. The ?v= query only busts the browser cache.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await getOwner();
  if (!owner) return fail(401, "Please sign in again");
  const { id } = await params;
  if (!validFileId(id)) return fail(400, "Invalid book");
  return serveJpeg(owner, pathFor(owner.userId, id), "No custom cover", "private, max-age=3600");
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return fail(403, "Cross-origin request refused");
  const owner = await getOwner();
  if (!owner) return fail(401, "Please sign in again");
  const { id } = await params;
  if (!validFileId(id)) return fail(400, "Invalid book");

  const bytes = await readJpeg(request);
  if (bytes instanceof NextResponse) return bytes;
  if (!(await ownsBook(owner, id))) return fail(404, "Book not found");

  const up = await owner.supabase.storage.from(BUCKET).upload(pathFor(owner.userId, id), bytes, { contentType: "image/jpeg", upsert: true });
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
  if (!validFileId(id)) return fail(400, "Invalid book");
  await owner.supabase.storage.from(BUCKET).remove([pathFor(owner.userId, id)]);
  await owner.supabase.from("reader_book_details").update({ cover_updated_at: null }).eq("user_id", owner.userId).eq("file_id", id);
  return new NextResponse(null, { status: 204 });
}
