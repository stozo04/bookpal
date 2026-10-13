// Browser-side cache of book titles and cover thumbnails, keyed by user and
// file hash. It lives in IndexedDB and is cleared on sign-out.
import { openEpub } from "./epub";
import { openPdf } from "./pdf";

export type BookMeta = { title: string; author: string; cover: Blob | null };

const DB = "bookpal-covers";
const STORE = "covers";

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "key" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const keyOf = (userId: string, sha: string) => `${userId}:${sha}`;

export async function readMeta(userId: string, sha: string): Promise<BookMeta | null> {
  try {
    const d = await db();
    return await new Promise((resolve) => {
      const req = d.transaction(STORE).objectStore(STORE).get(keyOf(userId, sha));
      req.onsuccess = () => resolve(req.result ? (req.result as BookMeta) : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function writeMeta(userId: string, sha: string, meta: BookMeta): Promise<void> {
  try {
    const d = await db();
    await new Promise<void>((resolve) => {
      const tx = d.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ key: keyOf(userId, sha), ...meta });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

export async function clearCovers(): Promise<void> {
  try {
    const d = await db();
    await new Promise<void>((resolve) => {
      const tx = d.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

async function thumbnail(source: Blob, width = 360): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(source);
    const scale = Math.min(1, width / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  } catch {
    return null;
  }
}

// Title, author and a small cover from an EPUB's bytes.
export async function metaFromEpub(data: ArrayBuffer): Promise<BookMeta | null> {
  try {
    const book = await openEpub(data);
    const raw = await book.cover();
    const result = { title: book.title, author: book.author, cover: raw ? await thumbnail(raw) : null };
    book.dispose();
    return result;
  } catch {
    return null;
  }
}

// Title, author and the first page as a small cover, read through partial downloads.
export async function metaFromPdf(fileId: string, byteSize: number): Promise<BookMeta | null> {
  let opened: Awaited<ReturnType<typeof openPdf>> | null = null;
  try {
    opened = await openPdf(fileId, byteSize);
    const info = ((await opened.doc.getMetadata().catch(() => null))?.info ?? {}) as { Title?: string; Author?: string };
    const page = await opened.doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 360 / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvas, viewport }).promise;
    const cover = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    return { title: info.Title?.trim() ?? "", author: info.Author?.trim() ?? "", cover };
  } catch {
    return null;
  } finally {
    void opened?.destroy();
  }
}
