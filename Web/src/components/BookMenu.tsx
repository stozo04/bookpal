"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Folder } from "@/lib/folders";
import { MoveDialog, api } from "./FolderForms";
import { BookEditor } from "./BookEditor";
import styles from "./BookMenu.module.css";

type Props = {
  id: string; title: string; folders?: Folder[]; folderId?: string | null;
  author?: string; description?: string; coverVersion?: string | null; embeddedCover?: Blob | null;
};

export function BookMenu({ id, title, folders = [], folderId = null, author = "", description = "", coverVersion = null, embeddedCover = null }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"rename" | "delete" | "move" | "edit" | null>(null);
  const [name, setName] = useState(title);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

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

  useEffect(() => {
    if (mode === "rename" || mode === "delete") dialog.current?.showModal();
    else dialog.current?.close();
  }, [mode]);

  const begin = (next: "rename" | "delete" | "move" | "edit") => {
    setOpen(false);
    setError("");
    setTyped("");
    setName(title);
    setMode(next);
  };

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const response =
        mode === "rename"
          ? await fetch(`/api/files/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName: name }) })
          : await fetch(`/api/files/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error?.message ?? "Something went wrong.");
      setMode(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.wrap} ref={wrap}>
      <button type="button" className={styles.trigger} aria-label={`Options for ${title}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></svg>
      </button>
      {open && (
        <div role="menu" className={styles.menu}>
          <button type="button" role="menuitem" onClick={() => begin("edit")}>Edit details</button>
          {folders.length > 0 && <button type="button" role="menuitem" onClick={() => begin("move")}>Move to</button>}
          <button type="button" role="menuitem" onClick={() => begin("delete")}>Remove from library</button>
        </div>
      )}
      <BookEditor open={mode === "edit"} onClose={() => setMode(null)} book={{ id, title, author, description, coverVersion, embeddedCover }} />
      <MoveDialog open={mode === "move"} title={`Move “${title}”`} folders={folders} current={folderId} onClose={() => setMode(null)} onDone={() => { setMode(null); router.refresh(); }} submit={(target) => api.moveBook(id, target)} />
      <dialog ref={dialog} className={styles.dialog} onClose={() => setMode(null)} aria-labelledby={`dlg-${id}`}>
        <form method="dialog" onSubmit={(e) => { e.preventDefault(); if (!busy && (mode === "rename" ? name.trim() : typed === "DELETE")) void submit(); }}>
          <h2 id={`dlg-${id}`}>{mode === "rename" ? "Rename book" : "Remove this book?"}</h2>
          {mode === "rename" ? (
            <label className={styles.field}>
              <span className="sr">Title</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={500} />
            </label>
          ) : (
            <>
              <p className="voice">“{title}” and your place in it will be permanently deleted from your account.</p>
              <label className={styles.field}>
                <span className="voice">Type DELETE to confirm</span>
                <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" />
              </label>
            </>
          )}
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.actions}>
            <button type="button" onClick={() => setMode(null)}>Cancel</button>
            <button type="submit" disabled={busy || (mode === "rename" ? !name.trim() || name.trim() === title : typed !== "DELETE")}>
              {busy ? "Working…" : mode === "rename" ? "Save" : "Remove"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
