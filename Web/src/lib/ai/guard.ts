import "server-only";
import { NextResponse } from "next/server";
import { getOwner, sameOrigin, type Owner } from "@/lib/owner";
import { isLocalHost } from "./openai";

export const aiFail = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status });

// Every AI route needs the signed-in owner, a same-origin request on writes, and a
// locally hosted app (OpenAI's plan usage is not offered to hosted deployments).
export async function aiGuard(request: Request, write = false): Promise<Owner | NextResponse> {
  if (write && !sameOrigin(request)) return aiFail(403, "forbidden", "Cross-origin request refused");
  const owner = await getOwner();
  if (!owner) return aiFail(401, "unauthorized", "Please sign in again");
  if (!isLocalHost(request)) return aiFail(409, "not_local", "ChatGPT plan usage is only available when BookPal runs on your own computer.");
  return owner;
}
