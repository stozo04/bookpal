import { notFound } from "next/navigation";
import { getOwner } from "@/lib/owner";
import { EpubReader } from "@/components/reader/EpubReader";
import { PdfReader } from "@/components/reader/PdfReader";
import { TxtReader } from "@/components/reader/TxtReader";
import type { Character } from "@/lib/castgraph";
import type { Profile, ReaderNotes } from "@/lib/notes";

export default async function Read({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owner = await getOwner();
  if (!owner || !/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data: file } = await owner.supabase
    .from("library_files")
    .select("id, display_name, media_type, status, sha256, byte_size, original_filename")
    .eq("id", id)
    .eq("user_id", owner.userId)
    .maybeSingle();
  if (!file || file.status !== "ready") notFound();

  // RLS limits this to the user's own saved place.
  const { data: state } = await owner.supabase
    .from("reading_states")
    .select("locator")
    .eq("file_id", file.id)
    .eq("user_id", owner.userId)
    .maybeSingle();
  const saved = state?.locator as { resourceID?: string; position?: number; progression?: number } | undefined;
  const initial = saved?.resourceID
    ? { resourceID: saved.resourceID, position: saved.position ?? 0, progression: saved.progression ?? 0 }
    : null;

  const { data: details } = await owner.supabase
    .from("reader_book_details")
    .select("author, description, cover_updated_at")
    .eq("file_id", file.id)
    .eq("user_id", owner.userId)
    .maybeSingle();
  const meta = {
    userId: owner.userId, sha256: file.sha256 ?? null, author: details?.author ?? "",
    description: details?.description ?? "", coverVersion: details?.cover_updated_at ?? null,
    titleIsFilename: file.display_name === file.original_filename.replace(/\.(epub|pdf|txt)$/i, ""),
  };

  // Saved AI notes ride along with the page, so opening them costs no further request.
  const { data: noteRows } = await owner.supabase
    .from("reader_ai_notes")
    .select("kind, label, progress, content")
    .eq("file_id", file.id)
    .eq("user_id", owner.userId);
  const notes: ReaderNotes = { cast: null, summaries: {}, profiles: {} };
  for (const row of noteRows ?? []) {
    const c = row.content as Record<string, unknown>;
    if (row.kind === "cast" && Array.isArray(c.characters)) notes.cast = { label: row.label, progress: row.progress, characters: c.characters as Character[] };
    else if (row.kind === "summary" && typeof c.text === "string") notes.summaries[row.label] = { progress: row.progress, text: c.text };
    else if (row.kind === "character" && c.profile) notes.profiles[row.label] = { label: String(c.label ?? ""), progress: row.progress, profile: c.profile as Profile };
  }

  const fingerprint = file.sha256 ?? file.id;
  if (file.media_type === "application/pdf") return <PdfReader fileId={file.id} fingerprint={fingerprint} title={file.display_name} byteSize={Number(file.byte_size)} initial={initial} meta={meta} notes={notes} />;
  if (file.media_type === "text/plain") return <TxtReader fileId={file.id} fingerprint={fingerprint} title={file.display_name} initial={initial} meta={meta} notes={notes} />;
  if (file.media_type === "application/epub+zip") return <EpubReader fileId={file.id} fingerprint={fingerprint} fallbackTitle={file.display_name} initial={initial} meta={meta} notes={notes} />;
  notFound();
}
