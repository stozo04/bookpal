"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { descendants, type Folder } from "@/lib/folders";
import { Dialog } from "./Dialog";
import { MoveDialog, NameDialog, api } from "./FolderForms";
import menu from "./BookMenu.module.css";
import forms from "./FolderForms.module.css";
import styles from "./FolderTile.module.css";

type Mode = "rename" | "move" | "delete" | null;

export function FolderTile({ folder, items, folders }: { folder: Folder; items: number; folders: Folder[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const begin = (m: Mode) => { setOpen(false); setError(""); setMode(m); };
  const done = () => { setMode(null); router.refresh(); };

  return (
    <li className={styles.tile}>
      <Link href={`/library?folder=${folder.id}`} className={styles.link} aria-label={`Open folder ${folder.name}`}>
        <div className={styles.face}>
          <svg viewBox="0 0 64 52" aria-hidden="true"><path d="M4 12a4 4 0 0 1 4-4h14l6 7h28a4 4 0 0 1 4 4v23a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" /></svg>
        </div>
        <div className={styles.name}>{folder.name}</div>
        <div className="voice">{items === 0 ? "Empty" : `${items} ${items === 1 ? "item" : "items"}`}</div>
      </Link>

      <div className={menu.wrap} ref={wrap}>
        <button type="button" className={menu.trigger} aria-label={`Options for folder ${folder.name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></svg>
        </button>
        {open && (
          <div role="menu" className={menu.menu}>
            <button type="button" role="menuitem" onClick={() => begin("rename")}>Rename…</button>
            <button type="button" role="menuitem" onClick={() => begin("move")}>Move to…</button>
            <button type="button" role="menuitem" onClick={() => begin("delete")}>Delete folder…</button>
          </div>
        )}
      </div>

      <NameDialog open={mode === "rename"} title="Rename folder" initial={folder.name} action="Save" onClose={() => setMode(null)} onDone={done} submit={(name) => api.renameFolder(folder.id, name)} />
      <MoveDialog open={mode === "move"} title={`Move “${folder.name}”`} folders={folders} current={folder.parentId} exclude={descendants(folders, folder.id)} onClose={() => setMode(null)} onDone={done} submit={(target) => api.moveFolder(folder.id, target)} />
      <Dialog open={mode === "delete"} title="Delete this folder?" onClose={() => setMode(null)}>
        <p className="voice">“{folder.name}” will be removed. Folders must be empty first, and your books are never deleted by this.</p>
        {error && <p className={forms.error} role="alert">{error}</p>}
        <div className={forms.actions}>
          <button type="button" onClick={() => setMode(null)}>Cancel</button>
          <button type="button" disabled={busy} onClick={async () => { setBusy(true); const p = await api.deleteFolder(folder.id); setBusy(false); if (p) setError(p); else done(); }}>
            {busy ? "Working…" : "Delete"}
          </button>
        </div>
      </Dialog>
    </li>
  );
}
