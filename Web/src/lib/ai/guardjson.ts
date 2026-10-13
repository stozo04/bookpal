import "server-only";
import { NextResponse } from "next/server";
import { z, type ZodType } from "zod";
import { aiGuard } from "./guard";
import type { Owner } from "@/lib/owner";

// Common opening for the AI routes: signed in, same origin, local, and a valid body.
export async function aiBody<T>(request: Request, schema: ZodType<T>): Promise<{ owner: Owner; input: T } | NextResponse> {
  const owner = await aiGuard(request, true);
  if (owner instanceof NextResponse) return owner;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "invalid_request", message: "That request couldn't be read" } }, { status: 400 });
  return { owner, input: parsed.data };
}
export { z };
