// Browser-side image helpers for covers and illustrations. AI drawings arrive as
// SVG text; they are sanitised, then shown through <img> (which can run no script)
// and, for covers, flattened to a small JPEG before they are saved.
import DOMPurify from "dompurify";

export function cleanSvg(svg: string): string {
  const out = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["script", "foreignObject", "image", "use", "a", "iframe", "style"],
  });
  return /<svg[^>]*xmlns=/i.test(out) ? out : out.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
}

export const svgUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("blob"))), type, quality));
}

export async function svgToJpeg(svg: string, width: number, height: number): Promise<Blob> {
  const img = await load(svgUri(cleanSvg(svg)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return toBlob(canvas, "image/jpeg", 0.88);
}

export async function svgToPng(svg: string, width: number, height: number): Promise<Blob> {
  const img = await load(svgUri(cleanSvg(svg)));
  const canvas = document.createElement("canvas");
  canvas.width = width * 2;
  canvas.height = height * 2;
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return toBlob(canvas, "image/png");
}

// Any picture the owner chooses, scaled to a cover-sized JPEG.
export async function pictureToCover(file: File, maxWidth = 600): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return toBlob(canvas, "image/jpeg", 0.86);
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
