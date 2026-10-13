import { NextResponse } from "next/server";
import { getOwner } from "@/lib/owner";

const fail = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status });

// Returns a short-lived signed URL for the user's own file. Both lookups use the
// user-scoped client, so RLS and the storage owner policy apply.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await getOwner();
  if (!owner) return fail(401, "unauthorized", "Please sign in again");

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(400, "invalid_request", "Invalid file");

  const { data: file } = await owner.supabase
    .from("library_files")
    .select("storage_path, status")
    .eq("id", id)
    .eq("user_id", owner.userId)
    .maybeSingle();
  if (!file || file.status !== "ready") return fail(404, "not_found", "Book not found");

  const { data, error } = await owner.supabase.storage.from("reader-files").createSignedUrl(file.storage_path, 600);
  if (error || !data) return fail(502, "storage_error", "The book couldn't be opened");
  return NextResponse.json({ url: data.signedUrl }, { headers: { "cache-control": "no-store" } });
}
