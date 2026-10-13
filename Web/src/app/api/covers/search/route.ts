import { NextResponse } from "next/server";
import { getOwner } from "@/lib/owner";

// Real cover art from Open Library, found by title and author. No key is needed, and the
// browser only ever talks to this site (see ../image).
type Doc = { title?: string; author_name?: string[]; cover_i?: number; first_publish_year?: number };

export async function GET(request: Request) {
  if (!(await getOwner())) return NextResponse.json({ error: { message: "Please sign in again" } }, { status: 401 });
  const url = new URL(request.url);
  const title = (url.searchParams.get("title") ?? "").trim().slice(0, 200);
  const author = (url.searchParams.get("author") ?? "").trim().slice(0, 200);
  if (!title) return NextResponse.json({ error: { message: "A title is needed" } }, { status: 400 });

  const query = new URLSearchParams({ title, limit: "24", fields: "title,author_name,cover_i,first_publish_year" });
  if (author) query.set("author", author);
  try {
    const response = await fetch(`https://openlibrary.org/search.json?${query}`, { signal: AbortSignal.timeout(8000), next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("upstream");
    const docs = ((await response.json()) as { docs?: Doc[] }).docs ?? [];
    const seen = new Set<number>();
    const covers = docs
      .filter((d) => d.cover_i && !seen.has(d.cover_i) && seen.add(d.cover_i))
      .slice(0, 8)
      .map((d) => ({ id: d.cover_i!, title: d.title ?? "", author: d.author_name?.[0] ?? "", year: d.first_publish_year ?? null }));
    return NextResponse.json({ covers });
  } catch {
    return NextResponse.json({ error: { message: "Open Library couldn’t be reached. Please try again." } }, { status: 502 });
  }
}
