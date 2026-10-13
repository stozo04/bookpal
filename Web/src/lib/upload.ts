// Browser-side helpers for Settings → Upload. No secrets here.

export type MediaType = "application/epub+zip" | "application/pdf" | "text/plain";

export const MAX_UPLOAD_BYTES = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 50) * 1024 * 1024;

export const FORMAT_LABEL: Record<MediaType, string> = {
  "application/epub+zip": "EPUB",
  "application/pdf": "PDF",
  "text/plain": "text",
};

// Decide the type from the file's bytes, not its name.
export async function sniff(file: File): Promise<MediaType | null> {
  const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));

  // EPUB: a zip whose first entry is a stored "mimetype" file.
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 3 && head[3] === 4) {
    return ascii(30, 38) === "mimetype" && ascii(38, 58) === "application/epub+zip" ? "application/epub+zip" : null;
  }
  if (ascii(0, Math.min(1024, head.length)).includes("%PDF-")) return "application/pdf";

  // Plain text: valid UTF-8 with no NUL bytes.
  if (head.length === 0 || head.includes(0)) return null;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(head, { stream: true });
    return "text/plain";
  } catch {
    return null;
  }
}

export async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const displayNameFor = (filename: string) => filename.replace(/\.(epub|pdf|txt)$/i, "").trim() || filename;

export function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// PUT the bytes to the signed URL (same request shape as supabase-js
// uploadToSignedUrl) so we can report progress. The part's type must equal the
// declared media type, which the backend verifies on completion.
export function putToSignedUrl(
  signedUrl: string,
  file: File,
  mediaType: MediaType,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", new Blob([file], { type: mediaType }));
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("x-upsert", "true");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`storage ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(form);
  });
}
