import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LibraryGrid, type Book } from "@/components/LibraryGrid";
import { pathTo, type Folder } from "@/lib/folders";

const showSampleEarly = (preview?: string) => process.env.NODE_ENV !== "production" && preview === "1";

// Dev-only sample shelf so the layout can be reviewed before any upload exists.
const SAMPLE: Book[] = [
  ["Accelerando", "application/epub+zip", 470575],
  ["Moby Dick", "application/epub+zip", 814023],
  ["War and Peace", "application/epub+zip", 1832521],
  ["Frankenstein", "application/pdf", 57595230],
  ["Alice's Adventures in Wonderland", "text/plain", 174311],
  ["Pride and Prejudice", "application/epub+zip", 24836548],
  ["A history of the digital page", "application/pdf", 96290],
].map(([title, mediaType, byteSize], i) => ({
  id: `sample-${i}`, title: title as string, mediaType: mediaType as string,
  byteSize: byteSize as number, createdAt: new Date(Date.now() - i * 864e5).toISOString(),
}));

export default async function Library({ searchParams }: { searchParams: Promise<{ preview?: string; folder?: string }> }) {
  const { preview, folder } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // User-scoped client: Postgres RLS limits rows to auth.uid(). The explicit
  // user_id filter is belt and braces.
  const { data: files, error } = await supabase
    .from("library_files")
    .select("id, display_name, media_type, byte_size, created_at, sha256, original_filename, folder_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const { data: detailRows } = await supabase.from("reader_book_details").select("file_id, author, description, cover_updated_at").eq("user_id", user.id);
  const details = new Map((detailRows ?? []).map((d) => [d.file_id as string, d]));

  const { data: folderRows } = await supabase.from("folders").select("id, parent_id, name").eq("user_id", user.id);
  const folders: Folder[] = (folderRows ?? []).map((f) => ({ id: f.id, parentId: f.parent_id, name: f.name }));
  const here = folder ? folders.find((f) => f.id === folder) : undefined;
  if (folder && !here && !showSampleEarly(preview)) redirect("/library");
  const trail = pathTo(folders, here?.id ?? null);

  const { data: states } = await supabase
    .from("reading_states")
    .select("file_id, progress, last_opened_at")
    .eq("user_id", user.id);
  const progressById = new Map((states ?? []).map((st) => [st.file_id as string, Number(st.progress)]));
  const openedById = new Map((states ?? []).map((st) => [st.file_id as string, st.last_opened_at as string]));

  const showSample = process.env.NODE_ENV !== "production" && preview === "1";
  const books: Book[] = showSample
    ? SAMPLE
    : (files ?? []).map((f) => ({
        id: f.id, title: f.display_name, mediaType: f.media_type,
        byteSize: Number(f.byte_size), createdAt: f.created_at, progress: progressById.get(f.id), openedAt: openedById.get(f.id), sha256: f.sha256, filename: f.original_filename, folderId: f.folder_id,
        author: details.get(f.id)?.author ?? undefined, description: details.get(f.id)?.description ?? undefined, coverVersion: details.get(f.id)?.cover_updated_at ?? null,
      }));

  return (
    <main className="container">
      <div className="page-head">
        {trail.length > 0 && (
          <nav className="crumbs" aria-label="Folder path">
            <Link href="/library">Library</Link>
            {trail.slice(0, -1).map((f) => (
              <span key={f.id}> / <Link href={`/library?folder=${f.id}`}>{f.name}</Link></span>
            ))}
          </nav>
        )}
        <h1>{here ? here.name : "Library"}</h1>
        <div className="voice">
          {(() => {
            const inHere = books.filter((b) => (b.folderId ?? null) === (here?.id ?? null)).length;
            const subs = folders.filter((f) => f.parentId === (here?.id ?? null)).length;
            if (inHere === 0 && subs === 0) return here ? "Nothing here yet" : "No books yet";
            return [inHere ? `${inHere} ${inHere === 1 ? "book" : "books"}` : "", subs ? `${subs} ${subs === 1 ? "folder" : "folders"}` : ""].filter(Boolean).join(" · ");
          })()}
        </div>
      </div>
      {showSample && <p className="preview-note voice">Sample shelf. Not your books.</p>}
      {error ? (
        <p className="error">Couldn’t load your shelf. Please try again.</p>
      ) : books.length === 0 && folders.length === 0 ? (
        <div className="empty">
          <svg viewBox="0 0 120 84" aria-hidden="true">
            <path d="M8 76h104" />
            <rect x="16" y="22" width="14" height="54" rx="1.5" />
            <rect x="34" y="12" width="12" height="64" rx="1.5" />
            <rect x="50" y="28" width="16" height="48" rx="1.5" />
            <path d="M74 76l10-48 12 3-10 45z" />
            <path d="M100 76V40h8v36" />
          </svg>
          <h2>Your shelf is empty.</h2>
          <p className="voice">Books you add will appear here.</p>
          <Link href="/upload" className="button empty-action">Upload a book</Link>
        </div>
      ) : (
        <LibraryGrid books={books} userId={user.id} folders={folders} currentFolderId={here?.id ?? null} />
      )}
    </main>
  );
}
