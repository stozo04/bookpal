import { NextResponse } from "next/server";
import { getOwner } from "@/lib/owner";

// Streams one Open Library cover through this site, so pages need no outside image sources
// and nothing but a numeric id and a fixed size can reach the other server.
export async function GET(request: Request) {
  if (!(await getOwner())) return new NextResponse(null, { status: 401 });
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const size = url.searchParams.get("size") === "L" ? "L" : "M";
  if (!/^\d{1,12}$/.test(id)) return new NextResponse(null, { status: 400 });
  try {
    const upstream = await fetch(`https://covers.openlibrary.org/b/id/${id}-${size}.jpg?default=false`, { signal: AbortSignal.timeout(10_000) });
    const type = upstream.headers.get("content-type") ?? "";
    if (!upstream.ok || !type.startsWith("image/")) return new NextResponse(null, { status: 404 });
    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > 6_000_000) return new NextResponse(null, { status: 413 });
    return new NextResponse(bytes, { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=86400" } });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
