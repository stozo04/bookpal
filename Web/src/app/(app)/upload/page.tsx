import { UploadPanel } from "@/components/UploadPanel";
import { getOwner } from "@/lib/owner";
import type { Folder } from "@/lib/folders";

export default async function Upload() {
  const owner = await getOwner();
  const { data: rows } = owner ? await owner.supabase.from("folders").select("id, parent_id, name").eq("user_id", owner.userId) : { data: [] };
  const folders: Folder[] = (rows ?? []).map((f) => ({ id: f.id, parentId: f.parent_id, name: f.name }));
  return (
    <main className="narrow wide">
      <div className="page-head">
        <h1>Upload a book</h1>
        <div className="voice">Add books from this device to your shelf.</div>
      </div>

      <section aria-label="Upload">
        <p className="voice section-note">EPUB, PDF and plain text. Books are stored privately in your account and appear on your shelf.</p>
        <UploadPanel userId={owner?.userId ?? ""} folders={folders} />
      </section>
    </main>
  );
}
