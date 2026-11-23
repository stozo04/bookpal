import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwner, sameOrigin } from "@/lib/owner";
import { startUpload } from "@/lib/library";

const body = z.object({
  clientFileId: z.string().uuid(),
  displayName: z.string().trim().min(1).max(500),
  originalFilename: z.string().trim().min(1).max(500),
  mediaType: z.enum(["application/epub+zip", "application/pdf", "text/plain"]),
  byteSize: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  folderId: z.string().uuid().nullable().optional(),
});

const fail = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, "forbidden", "Cross-origin request refused");
  const owner = await getOwner();
  if (!owner) return fail(401, "unauthorized", "Please sign in again");

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "invalid_request", "That file couldn't be read");
  const input = parsed.data;

  // The database has a unique (user, sha256) index, so a repeat would fail the
  // insert; detect it here instead. RLS limits this lookup to the user.
  const { data: existing } = await owner.supabase
    .from("library_files")
    .select("id, status")
    .eq("user_id", owner.userId)
    .eq("sha256", input.sha256)
    .maybeSingle();
  if (existing?.status === "ready") return NextResponse.json({ duplicate: true, fileId: existing.id });
  // An earlier attempt left an unfinished row: resume it instead of colliding.
  const clientFileId = existing?.id ?? input.clientFileId;

  const started = await startUpload(owner.supabase, owner.userId, { ...input, clientFileId });
  if (!started.ok) return fail(started.code === "failed" ? 502 : 409, started.code, "The upload couldn't be started");
  return NextResponse.json({
    duplicate: !started.value.needsUpload,
    fileId: started.value.file.id,
    upload: started.value.upload,
  });
}
