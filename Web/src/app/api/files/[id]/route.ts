import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwner, sameOrigin } from "@/lib/owner";
import { deleteFile, updateFile } from "@/lib/library";
import { isPortraitKey, portraitFolder, portraitPath } from "@/lib/portrait";
import { BUCKET } from "@/lib/storedJpeg";

const fail = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status });

const change = z
  .object({ displayName: z.string().trim().min(1).max(500).optional(), folderId: z.string().uuid().nullable().optional() })
  .refine((v) => v.displayName !== undefined || v.folderId !== undefined);
const validId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return fail(403, "forbidden", "Cross-origin request refused");
  const owner = await getOwner();
  if (!owner) return fail(401, "unauthorized", "Please sign in again");
  const { id } = await params;
  if (!validId(id)) return fail(400, "invalid_request", "Invalid file");
  const parsed = change.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "invalid_request", "Nothing to change");

  const updated = await updateFile(owner.supabase, id, parsed.data);
  if (!updated.ok && updated.code === "file_not_found") return fail(404, "not_found", "Book not found");
  if (!updated.ok) return fail(502, "save_failed", "The change couldn't be saved");
  return new NextResponse(null, { status: 204 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return fail(403, "forbidden", "Cross-origin request refused");
  const owner = await getOwner();
  if (!owner) return fail(401, "unauthorized", "Please sign in again");
  const { id } = await params;
  if (!validId(id)) return fail(400, "invalid_request", "Invalid file");

  const deleted = await deleteFile(owner.supabase, id);
  if (!deleted.ok && deleted.code === "file_not_found") return fail(404, "not_found", "Book not found");
  if (!deleted.ok) return fail(502, "delete_failed", "The book couldn't be removed");
  const storage = owner.supabase.storage.from(BUCKET);
  const { data: portraits } = await storage.list(portraitFolder(owner.userId, id), { limit: 1000 });
  await storage.remove([
    `${owner.userId}/${id}/cover`,
    ...(portraits ?? []).filter((o) => isPortraitKey(o.name)).map((o) => portraitPath(owner.userId, id, o.name)),
  ]);
  return new NextResponse(null, { status: 204 });
}
