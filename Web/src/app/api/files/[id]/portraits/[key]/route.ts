import { NextResponse } from "next/server";
import { getOwner, sameOrigin } from "@/lib/owner";
import { isPortraitKey, portraitPath } from "@/lib/portrait";
import { BUCKET, fail, ownsBook, readJpeg, serveJpeg, validFileId } from "@/lib/storedJpeg";

type Params = { params: Promise<{ id: string; key: string }> };

// The ?v= query only busts the browser cache after a picture is replaced.
export async function GET(_request: Request, { params }: Params) {
  const owner = await getOwner();
  if (!owner) return fail(401, "Please sign in again");
  const { id, key } = await params;
  if (!validFileId(id) || !isPortraitKey(key)) return fail(400, "Invalid portrait");
  return serveJpeg(owner, portraitPath(owner.userId, id, key), "No portrait", "private, max-age=3600");
}

export async function PUT(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return fail(403, "Cross-origin request refused");
  const owner = await getOwner();
  if (!owner) return fail(401, "Please sign in again");
  const { id, key } = await params;
  if (!validFileId(id) || !isPortraitKey(key)) return fail(400, "Invalid portrait");

  const bytes = await readJpeg(request);
  if (bytes instanceof NextResponse) return bytes;
  if (!(await ownsBook(owner, id))) return fail(404, "Book not found");

  const up = await owner.supabase.storage.from(BUCKET).upload(portraitPath(owner.userId, id, key), bytes, { contentType: "image/jpeg", upsert: true });
  if (up.error) return fail(502, "The portrait couldn't be saved");
  return new NextResponse(null, { status: 204 });
}

export async function DELETE(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return fail(403, "Cross-origin request refused");
  const owner = await getOwner();
  if (!owner) return fail(401, "Please sign in again");
  const { id, key } = await params;
  if (!validFileId(id) || !isPortraitKey(key)) return fail(400, "Invalid portrait");
  const { error } = await owner.supabase.storage.from(BUCKET).remove([portraitPath(owner.userId, id, key)]);
  if (error) return fail(502, "The portrait couldn't be removed");
  return new NextResponse(null, { status: 204 });
}
