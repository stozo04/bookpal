import { NextResponse } from "next/server";
import { z } from "zod";
import { aiFail, aiGuard } from "@/lib/ai/guard";
import { updateStore } from "@/lib/ai/store";

const body = z.object({ model: z.string().min(1).max(200), reasoning: z.string().min(1).max(40), name: z.string().max(200).optional() });

export async function PUT(request: Request) {
  const owner = await aiGuard(request, true);
  if (owner instanceof NextResponse) return owner;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return aiFail(400, "invalid_request", "Choose a model and a reasoning level");
  const saved = await updateStore((store) => {
    const connection = store.users[owner.userId];
    if (!connection) return false;
    connection.selection = parsed.data;
    return true;
  });
  return saved ? new NextResponse(null, { status: 204 }) : aiFail(401, "not_connected", "Connect your ChatGPT account first.");
}
