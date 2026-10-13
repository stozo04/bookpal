import "server-only";
import { NextResponse } from "next/server";
import { getOwner, sameOrigin, type Owner } from "@/lib/owner";
import { isLocalHost } from "./openai";

export const aiFail = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status });

// Every AI route needs the signed-in owner and a same-origin request on writes. Signing
// in with ChatGPT (`needLocal`) must happen on your own computer, because OpenAI's
// callback is a 127.0.0.1 address; the saved connection can then be used from anywhere.
export async function aiGuard(request: Request, write = false, needLocal = false): Promise<Owner | NextResponse> {
  if (write && !sameOrigin(request)) return aiFail(403, "forbidden", "Cross-origin request refused");
  const owner = await getOwner();
  if (!owner) return aiFail(401, "unauthorized", "Please sign in again");
  if (needLocal && !isLocalHost(request)) return aiFail(409, "not_local", "Connect ChatGPT from BookPal running on your own computer; the connection then works here too.");
  return owner;
}
