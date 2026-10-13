import { NextResponse } from "next/server";
import { getOwner } from "@/lib/owner";
import { getConnection, isLocalHost } from "@/lib/ai/openai";

export async function GET(request: Request) {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: { code: "unauthorized" } }, { status: 401 });
  const connection = await getConnection(owner.userId);
  return NextResponse.json({
    available: true,
    canConnect: isLocalHost(request),
    connected: Boolean(connection),
    email: connection?.email ?? null,
    selection: connection?.selection ?? null,
  }, { headers: { "cache-control": "no-store" } });
}
