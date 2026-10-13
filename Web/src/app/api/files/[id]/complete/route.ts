import { NextResponse } from "next/server";
import { backendFetch, getOwner, sameOrigin } from "@/lib/owner";

const fail = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return fail(403, "forbidden", "Cross-origin request refused");
  const owner = await getOwner();
  if (!owner) return fail(401, "unauthorized", "Please sign in again");

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(400, "invalid_request", "Invalid file");

  const response = await backendFetch(owner, `/v1/files/${id}/complete`, {});
  const payload = await response.json().catch(() => null);
  if (!response.ok) return fail(response.status === 409 ? 409 : 502, payload?.error?.code ?? "backend_error", "The upload couldn't be finished");
  return NextResponse.json({ ok: true });
}
