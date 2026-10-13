import { NextResponse } from "next/server";
import { z } from "zod";
import { backendFetch, getOwner, sameOrigin } from "@/lib/owner";

const body = z.object({ name: z.string().trim().min(1).max(200), parentId: z.string().uuid().nullable().optional() });
const fail = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, "forbidden", "Cross-origin request refused");
  const owner = await getOwner();
  if (!owner) return fail(401, "unauthorized", "Please sign in again");
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "invalid_request", "Please enter a name");

  const response = await backendFetch(owner, "/v1/folders", parsed.data);
  const payload = await response.json().catch(() => null);
  if (response.status === 409) return fail(409, "exists", "A folder with that name already exists here");
  if (!response.ok) return fail(502, "backend_error", "The folder couldn't be created");
  return NextResponse.json({ folder: payload.folder }, { status: 201 });
}
