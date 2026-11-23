import "server-only";
import { NextResponse } from "next/server";
import type { Owner } from "@/lib/owner";

// Small JPEGs the owner saves next to a book (custom covers, character portraits).
// The browser resizes pictures before sending them.
export const BUCKET = "reader-files";
export const MAX_JPEG_BYTES = 800 * 1024;

export const fail = (status: number, message: string) => NextResponse.json({ error: { message } }, { status });
export const validFileId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
export const isJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

export async function readJpeg(request: Request): Promise<Uint8Array | NextResponse> {
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_JPEG_BYTES) return fail(413, "That image is too large");
  if (!isJpeg(bytes)) return fail(415, "Please use a JPEG image");
  return bytes;
}

export async function ownsBook(owner: Owner, fileId: string): Promise<boolean> {
  const { data } = await owner.supabase.from("library_files").select("id").eq("id", fileId).eq("user_id", owner.userId).maybeSingle();
  return Boolean(data);
}

export async function serveJpeg(owner: Owner, path: string, missing: string, cacheControl: string): Promise<NextResponse> {
  const { data, error } = await owner.supabase.storage.from(BUCKET).download(path);
  if (error || !data) return fail(404, missing);
  return new NextResponse(await data.arrayBuffer(), {
    headers: { "content-type": "image/jpeg", "cache-control": cacheControl, "content-disposition": "inline" },
  });
}
