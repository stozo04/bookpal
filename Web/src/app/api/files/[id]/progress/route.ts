import { NextResponse } from "next/server";
import { z } from "zod";
import { backendFetch, getOwner, sameOrigin } from "@/lib/owner";

// Mirrors ReaderLocator in the Mac app (schemaVersion 1) so either client can
// resume from a position written by the other.
const body = z.object({
  deviceId: z.string().uuid(),
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

  const now = Date.now() / 1000;
  const response = await backendFetch(owner, "/v1/reading-states/sync", {
    deviceId: parsed.data.deviceId,
    states: [{ fileId: id, locator: parsed.data.locator, progress: parsed.data.progress, lastOpenedAt: now, updatedAt: now }],
  });
  if (!response.ok) return fail(502, "backend_error", "Your place couldn't be saved");
  return new NextResponse(null, { status: 204 });
}
