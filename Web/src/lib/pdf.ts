// Browser-side PDF loading shared by the reader and the shelf's cover thumbnails.
import type { PDFDocumentProxy } from "pdfjs-dist";

export type OpenedPdf = { doc: PDFDocumentProxy; destroy: () => Promise<void> };

async function signedUrl(fileId: string): Promise<string> {
  const link = await fetch(`/api/files/${fileId}/download`);
  if (!link.ok) throw new Error("download link");
  return (await link.json()).url as string;
}

// Reads only the parts pdf.js asks for, so the first page shows before the whole
// file arrives. The storage server answers partial requests but hides the headers
// pdf.js would use to notice, so the size we already know is supplied directly.
// Falls back to one full download if partial reads fail.
export async function openPdf(fileId: string, byteSize: number): Promise<OpenedPdf> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

  let url = await signedUrl(fileId);
  class PartialReader extends pdfjs.PDFDataRangeTransport {
    override requestDataRange(begin: number, end: number) {
      const get = () => fetch(url, { headers: { Range: `bytes=${begin}-${end - 1}` } });
      get()
        .then(async (r) => {
          if (r.status === 400 || r.status === 403) {
            url = await signedUrl(fileId); // the link expired mid-read
            return get();
          }
          return r;
        })
        .then(async (r) => (r.status === 206 ? this.onDataRange(begin, new Uint8Array(await r.arrayBuffer())) : undefined))
        .catch(() => {});
    }
  }

  let task = pdfjs.getDocument({ range: new PartialReader(byteSize, null) });
  try {
    const doc = await task.promise;
    return { doc, destroy: () => task.destroy() };
  } catch (e) {
    if ((e as { name?: string })?.name === "PasswordException") throw e;
    void task.destroy();
    task = pdfjs.getDocument({ url });
    const doc = await task.promise;
    return { doc, destroy: () => task.destroy() };
  }
}
