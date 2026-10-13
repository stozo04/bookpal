import { NextResponse } from "next/server";
import { aiGuard } from "@/lib/ai/guard";
import { disconnect } from "@/lib/ai/openai";

export async function POST(request: Request) {
  const owner = await aiGuard(request, true);
  if (owner instanceof NextResponse) return owner;
  await disconnect(owner.userId);
  return new NextResponse(null, { status: 204 });
}
