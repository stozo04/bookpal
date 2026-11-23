import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwner, sameOrigin } from "@/lib/owner";
import { createFolder } from "@/lib/library";

const body = z.object({ name: z.string().trim().min(1).max(200), parentId: z.string().uuid().nullable().optional() });
const fail = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, "forbidden", "Cross-origin request refused");
  const owner = await getOwner();
  if (!owner) return fail(401, "unauthorized", "Please sign in again");
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "invalid_request", "Please enter a name");

  const created = await createFolder(owner.supabase, owner.userId, parsed.data);
  if (!created.ok && created.code === "folder_already_exists") return fail(409, "exists", "A folder with that name already exists here");
  if (!created.ok) return fail(502, "save_failed", "The folder couldn't be created");
  return NextResponse.json({ folder: created.value }, { status: 201 });
}
