"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { metaFromEpub, writeMeta } from "@/lib/covers";
import {
  FORMAT_LABEL, MAX_UPLOAD_BYTES, displayNameFor, formatBytes, putToSignedUrl, sha256Hex, sniff, type MediaType,
} from "@/lib/upload";
import { flatten, type Folder } from "@/lib/folders";
import styles from "./UploadPanel.module.css";

type State = "queued" | "checking" | "hashing" | "uploading" | "finalizing" | "done" | "duplicate" | "failed";
type Item = { key: string; file: File; clientFileId: string; state: State; progress: number; message?: string; retryable?: boolean };

const CONCURRENCY = 3;
const LABEL: Record<State, string> = {
  queued: "Waiting", checking: "Checking", hashing: "Reading", uploading: "Uploading",
  finalizing: "Finishing", done: "On your shelf", duplicate: "Already on your shelf", failed: "Couldn’t upload",
};
const ACTIVE: State[] = ["checking", "hashing", "uploading", "finalizing"];

export function UploadPanel({ userId, folders = [] }: { userId: string; folders?: Folder[] }) {
  const [folderId, setFolderId] = useState<string>("");
  const folderRef = useRef("");
  folderRef.current = folderId;
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const started = useRef(new Set<string>());

  const patch = useCallback((key: string, change: Partial<Item>) => {
    setItems((all) => all.map((i) => (i.key === key ? { ...i, ...change } : i)));
  }, []);

  const run = useCallback(async (item: Item) => {
    const { key, file, clientFileId } = item;
    const fail = (message: string, retryable = false) => patch(key, { state: "failed", message, retryable });
    try {
      patch(key, { state: "checking" });
      if (file.size === 0) return fail("That file is empty.");
      if (file.size > MAX_UPLOAD_BYTES) return fail(`That file is larger than ${formatBytes(MAX_UPLOAD_BYTES)}.`);
      const mediaType = await sniff(file);
      if (!mediaType) return fail("That doesn’t look like an EPUB, PDF or text file.");

      patch(key, { state: "hashing" });
      const sha256 = await sha256Hex(file);

      // Prefer the book's own title over its filename, and keep its cover.
      const meta = mediaType === "application/epub+zip" ? await metaFromEpub(await file.arrayBuffer()) : null;
      const start = await fetch("/api/files/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientFileId, displayName: meta?.title?.trim() || displayNameFor(file.name), originalFilename: file.name,
          mediaType, byteSize: file.size, sha256, folderId: folderRef.current || null,
        }),
      });
      if (start.status === 401) return fail("Your session ended. Please sign in again.");
      const started_ = await start.json().catch(() => null);
      if (!start.ok) return fail(started_?.error?.message ?? "The upload couldn’t be started.", true);
      if (started_.duplicate) {
        patch(key, { state: "duplicate", progress: 1 });
        return;
      }

      patch(key, { state: "uploading", progress: 0 });
      await putToSignedUrl(started_.upload.signedUrl, file, mediaType as MediaType, (progress) => patch(key, { progress }));

      patch(key, { state: "finalizing", progress: 1 });
      const done = await fetch(`/api/files/${started_.fileId}/complete`, { method: "POST" });
      if (!done.ok) return fail((await done.json().catch(() => null))?.error?.message ?? "The upload couldn’t be finished.", true);

      if (meta) await writeMeta(userId, sha256, meta);
      patch(key, { state: "done" });
      router.refresh();
    } catch {
      fail("The connection dropped. Try again.", true);
    }
  }, [patch, router, userId]);

  // Start queued items, at most CONCURRENCY at a time.
  useEffect(() => {
    let active = items.filter((i) => ACTIVE.includes(i.state)).length;
    for (const item of items) {
      if (active >= CONCURRENCY) break;
      if (item.state === "queued" && !started.current.has(item.key)) {
        started.current.add(item.key);
        active += 1;
        void run(item);
      }
    }
  }, [items, run]);

  // Warn before leaving while uploads are in flight.
  const busy = items.some((i) => i.state === "queued" || ACTIVE.includes(i.state));
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  const add = (files: FileList | File[]) => {
    const next = Array.from(files).map((file): Item => ({
      key: crypto.randomUUID(), clientFileId: crypto.randomUUID(), file, state: "queued", progress: 0,
    }));
    if (next.length) setItems((all) => [...next, ...all]);
  };

  const retry = (item: Item) => {
    started.current.delete(item.key);
    patch(item.key, { state: "queued", progress: 0, message: undefined });
  };
  const remove = (key: string) => setItems((all) => all.filter((i) => i.key !== key));

  const finished = items.filter((i) => i.state === "done" || i.state === "duplicate").length;

  return (
    <div>
      {folders.length > 0 && (
        <label className={styles.dest}>
          <span className="voice">Add to</span>
          <select className="select" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">Library</option>
            {flatten(folders).map(({ folder, depth }) => (
              <option key={folder.id} value={folder.id}>{"\u00a0\u00a0".repeat(depth)}{folder.name}</option>
            ))}
          </select>
        </label>
      )}
      <div
        className={`${styles.drop} ${dragging ? styles.dragging : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); add(e.dataTransfer.files); }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V5M7.5 9.5L12 5l4.5 4.5" /><path d="M5 19h14" /></svg>
        <h3>Drop books here</h3>
        <p className="voice">EPUB, PDF or plain text · up to {formatBytes(MAX_UPLOAD_BYTES)} each</p>
        <button type="button" onClick={() => input.current?.click()}>Choose files…</button>
        <input
          ref={input} type="file" multiple hidden
          accept=".epub,.pdf,.txt,application/epub+zip,application/pdf,text/plain"
          onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }}
        />
      </div>

      <div className="sr" aria-live="polite">{finished > 0 ? `${finished} of ${items.length} finished` : ""}</div>

      {items.length > 0 && (
        <ul className={styles.queue}>
          {items.map((i) => (
            <li key={i.key} className={styles.row} data-state={i.state}>
              <div className={styles.line}>
                <div className={styles.name}>{displayNameFor(i.file.name)}</div>
                <div className={styles.actions}>
                  {i.state === "failed" && i.retryable && <button type="button" onClick={() => retry(i)}>Try again</button>}
                  {!ACTIVE.includes(i.state) && i.state !== "queued" && (
                    <button type="button" className={styles.quiet} onClick={() => remove(i.key)} aria-label={`Remove ${i.file.name}`}>Remove</button>
                  )}
                </div>
              </div>
              <div className={styles.meta}>
                {formatBytes(i.file.size)} · {LABEL[i.state]}
                {i.state === "uploading" && ` ${Math.round(i.progress * 100)}%`}
                {i.state === "failed" && i.message ? ` — ${i.message}` : ""}
              </div>
              {(i.state === "uploading" || i.state === "finalizing") && (
                <div className={styles.bar} role="progressbar" aria-valuenow={Math.round(i.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${i.file.name}`}>
                  <span style={{ width: `${i.progress * 100}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
