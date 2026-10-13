import { NextResponse } from "next/server";
import { aiFail, aiGuard } from "@/lib/ai/guard";
import { startConnect } from "@/lib/ai/openai";

export async function POST(request: Request) {
  const owner = await aiGuard(request, true);
  if (owner instanceof NextResponse) return owner;
  try {
    const returnTo = `${new URL(request.url).origin}/ai-settings`;
    return NextResponse.json({ url: await startConnect(owner.userId, returnTo) });
  } catch (e) {
    if ((e as Error).message === "port_in_use") {
      return aiFail(409, "port_in_use", "Port 1455 is busy, often because Codex is signing in. Close it and try again.");
    }
    return aiFail(502, "connect_failed", "The connection couldn't be started.");
  }
}
