"use client";
import { useState } from "react";
import { descendants, flatten, type Folder } from "@/lib/folders";
import { Dialog } from "./Dialog";
import styles from "./FolderForms.module.css";

async function send(url: string, method: string, body?: unknown): Promise<string | null> {
  const r = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (r.ok) return null;
  return (await r.json().catch(() => null))?.error?.message ?? "Something went wrong.";
}

type Done = () => void;

export function NameDialog({ open, title, initial = "", action, onClose, onDone, submit }: {
  open: boolean; title: string; initial?: string; action: string; onClose: Done; onDone: Done;
  submit: (name: string) => Promise<string | null>;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setError("");
    const problem = await submit(name.trim());
    setBusy(false);
    if (problem) setError(problem);
    else onDone();
  };
  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (!busy && name.trim() && name.trim() !== initial) void go(); }}>
        <label className={styles.field}>
          <span className="sr">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={200} />
        </label>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={busy || !name.trim() || name.trim() === initial}>{busy ? "Working…" : action}</button>
        </div>
      </form>
    </Dialog>
  );
}

export function MoveDialog({ open, title, folders, current, exclude, onClose, onDone, submit }: {
  open: boolean; title: string; folders: Folder[]; current: string | null; exclude?: Set<string>; onClose: Done; onDone: Done;
  submit: (folderId: string | null) => Promise<string | null>;
}) {
  const [target, setTarget] = useState<string | null>(current);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = flatten(folders, exclude);
  const go = async () => {
    setBusy(true); setError("");
    const problem = await submit(target);
    setBusy(false);
    if (problem) setError(problem);
    else onDone();
  };
  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <div className={styles.list} role="radiogroup" aria-label="Destination">
        <label className={styles.option}>
          <input type="radio" name="dest" checked={target === null} onChange={() => setTarget(null)} />
          <span>Library</span>
        </label>
        {rows.map(({ folder, depth }) => (
          <label key={folder.id} className={styles.option} style={{ paddingLeft: 14 + depth * 18 }}>
            <input type="radio" name="dest" checked={target === folder.id} onChange={() => setTarget(folder.id)} />
            <span>{folder.name}</span>
          </label>
        ))}
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.actions}>
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="button" disabled={busy || target === current} onClick={() => void go()}>{busy ? "Working…" : "Move"}</button>
      </div>
    </Dialog>
  );
}

export const api = {
  createFolder: (name: string, parentId: string | null) => send("/api/folders", "POST", { name, parentId }),
  renameFolder: (id: string, name: string) => send(`/api/folders/${id}`, "PATCH", { name }),
  moveFolder: (id: string, parentId: string | null) => send(`/api/folders/${id}`, "PATCH", { parentId }),
  deleteFolder: (id: string) => send(`/api/folders/${id}`, "DELETE"),
  moveBook: (id: string, folderId: string | null) => send(`/api/files/${id}`, "PATCH", { folderId }),
};
export { descendants };
