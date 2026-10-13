"use client";
import { useEffect, useMemo, useState } from "react";
import { metaFromEpub, metaFromPdf, readMeta, writeMeta } from "@/lib/covers";
import Link from "next/link";
import { BookMenu } from "./BookMenu";
import { FolderTile } from "./FolderTile";
import type { Folder } from "@/lib/folders";
import styles from "./LibraryGrid.module.css";

export type Book = { id: string; title: string; mediaType: string; byteSize: number; createdAt: string; progress?: number; sha256?: string | null; filename?: string; folderId?: string | null; author?: string; description?: string; coverVersion?: string | null };

const FORMAT: Record<string, string> = {
  "application/epub+zip": "EPUB",
  "application/pdf": "PDF",
  "text/plain": "TXT",
};

function tone(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 6;
}

function size(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const clean = (name: string) => name.replace(/\.(epub|pdf|txt)$/i, "").replace(/[-_]+/g, " ").trim();

function Wrap({ book, title, children }: { book: Book; title: string; children: React.ReactNode }) {
  if (!book.id.startsWith("sample-")) {
    return <Link href={`/read/${book.id}`} className={styles.link} aria-label={`Read ${title}`}>{children}</Link>;
  }
  return <div>{children}</div>;
}

type Shown = { title?: string; author?: string; coverUrl?: string; coverBlob?: Blob | null };

// A title the owner typed is shown exactly as typed. An unrenamed book (its
// title is just the filename) shows the title inside the EPUB, else a tidied filename.
function titleFor(b: Book, m?: Shown) {
  const stem = b.filename?.replace(/\.(epub|pdf|txt)$/i, "");
  const unrenamed = Boolean(stem) && b.title === stem;
  if (!unrenamed) return b.title;
  return m?.title ?? clean(b.title);
}

// Titles and covers come from the browser cache; EPUBs not yet cached are read
// once (one at a time) and remembered.
function useBookMeta(books: Book[], userId: string) {
  const [meta, setMeta] = useState<Record<string, Shown>>({});

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    (async () => {
      const missing: Book[] = [];
      for (const b of books) {
        if (!["application/epub+zip", "application/pdf"].includes(b.mediaType) || !b.sha256 || b.id.startsWith("sample-")) continue;
        const cached = await readMeta(userId, b.sha256);
        if (cancelled) return;
        if (cached) show(b.id, cached);
        else missing.push(b);
      }
      for (const b of missing) {
        try {
          let found;
          if (b.mediaType === "application/pdf") found = await metaFromPdf(b.id, b.byteSize);
          else {
            const link = await fetch(`/api/files/${b.id}/download`).then((r) => r.json());
            found = await metaFromEpub(await fetch(link.url).then((r) => r.arrayBuffer()));
          }
          if (cancelled) return;
          if (found) {
            await writeMeta(userId, b.sha256!, found);
            show(b.id, found);
          }
        } catch {}
      }
    })();
    function show(id: string, m: { title: string; author: string; cover: Blob | null }) {
      const coverUrl = m.cover ? URL.createObjectURL(m.cover) : undefined;
      if (coverUrl) urls.push(coverUrl);
      setMeta((all) => ({ ...all, [id]: { title: m.title || undefined, author: m.author || undefined, coverUrl, coverBlob: m.cover } }));
    }
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [books, userId]);

  return meta;
}

export function LibraryGrid({ books, userId, folders = [], currentFolderId = null }: {
  books: Book[]; userId: string; folders?: Folder[]; currentFolderId?: string | null;
}) {
  const bookMeta = useBookMeta(books, userId);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "title">("recent");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const nameOf = (b: Book) => titleFor(b, bookMeta[b.id]);
    // Searching looks across the whole library; browsing shows one folder at a time.
    const list = books.filter((b) => q ? `${nameOf(b)} ${bookMeta[b.id]?.author ?? ""}`.toLowerCase().includes(q) : (b.folderId ?? null) === currentFolderId);
    return sort === "title"
      ? [...list].sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
      : [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [books, query, sort, bookMeta, currentFolderId]);

  const q = query.trim().toLowerCase();
  const shownFolders = folders
    .filter((f) => (q ? f.name.toLowerCase().includes(q) : f.parentId === currentFolderId))
    .sort((a, b) => a.name.localeCompare(b.name));
  const countIn = (id: string) => books.filter((b) => b.folderId === id).length + folders.filter((f) => f.parentId === id).length;

  return (
    <>
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
          <span className="sr">Search your shelf</span>
          <input type="search" placeholder="Search your shelf" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label className={styles.sort}>
          <span className="voice">Sort</span>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value as "recent" | "title")}>
            <option value="recent">Recently added</option>
            <option value="title">Title</option>
          </select>
        </label>
      </div>

      {shown.length === 0 && shownFolders.length === 0 ? (
        <p className={`voice ${styles.none}`}>{query ? <>Nothing on your shelf matches “{query}”.</> : "This folder is empty."}</p>
      ) : (
        <ul className={styles.grid}>
          {shownFolders.map((f) => <FolderTile key={f.id} folder={f} items={countIn(f.id)} folders={folders} />)}
          {shown.map((b) => {
            const m = bookMeta[b.id];
            const title = titleFor(b, m);
            const coverSrc = b.coverVersion ? `/api/files/${b.id}/cover?v=${encodeURIComponent(b.coverVersion)}` : m?.coverUrl;
            const author = b.author || m?.author;
            return (
              <li key={b.id} className={styles.book}>
                <Wrap book={b} title={title}>
                <div className={`${styles.cover} ${coverSrc ? styles.hasImage : ""}`} style={{ background: `var(--c${tone(b.id)})` }}>
                  {coverSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverSrc} alt="" className={styles.image} />
                  ) : (
                    <>
                      <span className={styles.coverTitle}>{title}</span>
                      <span className={styles.coverFormat}>{FORMAT[b.mediaType] ?? "FILE"}</span>
                    </>
                  )}
                  {b.progress !== undefined && b.progress > 0 && (
                    <span className={styles.progress} aria-hidden="true"><span style={{ width: `${Math.max(2, b.progress * 100)}%` }} /></span>
                  )}
                </div>
                <div className={styles.caption}>
                  <div className={styles.title}>{title}</div>
                  {author && <div className={styles.author}>{author}</div>}
                  <div className="voice">
                    {b.progress !== undefined && Math.round(b.progress * 100) > 0 ? `${b.progress >= 0.995 ? "Finished" : `${Math.round(b.progress * 100)}% read`} · ` : ""}
                    {size(b.byteSize)}
                  </div>
                </div>
                </Wrap>
                {!b.id.startsWith("sample-") && <BookMenu id={b.id} title={title} folders={folders} folderId={b.folderId ?? null} author={author ?? ""} description={b.description ?? ""} coverVersion={b.coverVersion ?? null} embeddedCover={m?.coverBlob ?? null} />}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
