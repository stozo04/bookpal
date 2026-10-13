import { NextResponse } from "next/server";
import { aiFail, aiGuard } from "@/lib/ai/guard";
import { accessTokenFor, listModels } from "@/lib/ai/openai";

export async function GET(request: Request) {
  const owner = await aiGuard(request);
  if (owner instanceof NextResponse) return owner;
  const token = await accessTokenFor(owner.userId);
  if (!token) return aiFail(401, "not_connected", "Connect your ChatGPT account first.");
  try {
    return NextResponse.json({ models: await listModels(token) }, { headers: { "cache-control": "no-store" } });
  } catch {
    return aiFail(502, "models_failed", "Your models couldn't be loaded.");
  }
}
