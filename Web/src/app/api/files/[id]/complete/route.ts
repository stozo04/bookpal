import { NextResponse } from "next/server";
import { getOwner, sameOrigin } from "@/lib/owner";
import { completeUpload } from "@/lib/library";

const fail = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return fail(403, "forbidden", "Cross-origin request refused");
  const owner = await getOwner();
  if (!owner) return fail(401, "unauthorized", "Please sign in again");

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(400, "invalid_request", "Invalid file");

  const completed = await completeUpload(owner.supabase, id);
  if (!completed.ok) {
    const status = completed.code === "failed" ? 502 : completed.code === "file_not_found" ? 404 : 409;
    return fail(status, completed.code, "The upload couldn't be finished");
  }
  return NextResponse.json({ ok: true });
}
