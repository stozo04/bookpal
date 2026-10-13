import { NextResponse } from "next/server";
import { z } from "zod";
import { backendFetch, getOwner, sameOrigin } from "@/lib/owner";

const body = z
  .object({ name: z.string().trim().min(1).max(200).optional(), parentId: z.string().uuid().nullable().optional() })
  .refine((v) => v.name !== undefined || v.parentId !== undefined);
const fail = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });
const validId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

async function guard(request: Request, params: Promise<{ id: string }>) {
  if (!sameOrigin(request)) return { error: fail(403, "forbidden", "Cross-origin request refused") } as const;
  const owner = await getOwner();
  if (!owner) return { error: fail(401, "unauthorized", "Please sign in again") } as const;
  const { id } = await params;
  if (!validId(id)) return { error: fail(400, "invalid_request", "Invalid folder") } as const;
  return { owner, id } as const;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request, params);
  if ("error" in g) return g.error;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "invalid_request", "Nothing to change");
  const response = await backendFetch(g.owner, `/v1/folders/${g.id}`, parsed.data, "PATCH");
  if (response.status === 409) {
    const code = (await response.json().catch(() => null))?.error?.code;
    return fail(409, code ?? "conflict", code === "folder_cycle" ? "A folder can't be moved inside itself" : "A folder with that name already exists there");
  }
  if (response.status === 404) return fail(404, "not_found", "Folder not found");
  if (!response.ok) return fail(502, "backend_error", "The folder couldn't be changed");
  return new NextResponse(null, { status: 204 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request, params);
  if ("error" in g) return g.error;
  const response = await backendFetch(g.owner, `/v1/folders/${g.id}`, undefined, "DELETE");
  if (response.status === 409) return fail(409, "folder_not_empty", "Move or remove what's inside this folder first");
  if (response.status === 404) return fail(404, "not_found", "Folder not found");
  if (!response.ok) return fail(502, "backend_error", "The folder couldn't be removed");
  return new NextResponse(null, { status: 204 });
}
