import { NextResponse } from "next/server";
import { getOwner } from "@/lib/owner";
import { isPortraitKey, portraitFolder } from "@/lib/portrait";
import { BUCKET, fail, validFileId } from "@/lib/storedJpeg";

// Which characters in this book already have a saved portrait, by key.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await getOwner();
  if (!owner) return fail(401, "Please sign in again");
  const { id } = await params;
  if (!validFileId(id)) return fail(400, "Invalid book");
  const { data, error } = await owner.supabase.storage.from(BUCKET).list(portraitFolder(owner.userId, id), { limit: 1000 });
  if (error) return fail(502, "Portraits couldn't be read");
  const keys = (data ?? []).filter((o) => isPortraitKey(o.name)).map((o) => ({ key: o.name, version: o.updated_at ?? o.created_at ?? "" }));
  return NextResponse.json({ portraits: keys }, { headers: { "cache-control": "no-store" } });
}
