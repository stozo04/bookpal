import { NextResponse } from "next/server";
import { z } from "zod";
import { backendFetch, getOwner, sameOrigin } from "@/lib/owner";

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

  const response = await backendFetch(owner, `/v1/files/${id}`, parsed.data, "PATCH");
  if (response.status === 404) return fail(404, "not_found", "Book not found");
  if (!response.ok) return fail(502, "backend_error", "The change couldn't be saved");
  return new NextResponse(null, { status: 204 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return fail(403, "forbidden", "Cross-origin request refused");
  const owner = await getOwner();
  if (!owner) return fail(401, "unauthorized", "Please sign in again");
  const { id } = await params;
  if (!validId(id)) return fail(400, "invalid_request", "Invalid file");

  const response = await backendFetch(owner, `/v1/files/${id}`, undefined, "DELETE");
  if (response.status === 404) return fail(404, "not_found", "Book not found");
  if (!response.ok) return fail(502, "backend_error", "The book couldn't be removed");
  // The backend removes the book itself; a custom cover is ours to clean up.
  await owner.supabase.storage.from("reader-files").remove([`${owner.userId}/${id}/cover`]);
  return new NextResponse(null, { status: 204 });
}
