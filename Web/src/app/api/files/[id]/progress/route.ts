import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwner, sameOrigin } from "@/lib/owner";
import { placeTime, saveReadingPlace } from "@/lib/library";

// Mirrors ReaderLocator in the Mac app (schemaVersion 1) so either client can
// resume from a position written by the other.
const body = z.object({
  deviceId: z.string().uuid(),
  // When the reader was at this place, in ms since the epoch. Optional so a tab
  // loaded before this field existed can still save.
  clientUpdatedAt: z.number().int().positive().optional(),
  progress: z.number().min(0).max(1),
  locator: z.object({
    schemaVersion: z.literal(1),
    publicationFingerprint: z.string().min(1).max(500),
    resourceID: z.string().min(1).max(1000),
    position: z.number().int().min(0),
    progression: z.number().min(0).max(1),
    rectangles: z.array(z.unknown()).max(0),
  }),
});

const fail = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return fail(403, "forbidden", "Cross-origin request refused");
  const owner = await getOwner();
  if (!owner) return fail(401, "unauthorized", "Please sign in again");

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(400, "invalid_request", "Invalid file");
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "invalid_request", "Invalid position");

  const { clientUpdatedAt, ...place } = parsed.data;
  const saved = await saveReadingPlace(owner.supabase, owner.userId, { fileId: id, ...place, at: placeTime(clientUpdatedAt, Date.now()) });
  if (!saved.ok && saved.code === "file_not_found") return fail(404, "not_found", "Book not found");
  if (!saved.ok) return fail(502, "save_failed", "Your place couldn't be saved");
  return new NextResponse(null, { status: 204 });
}
