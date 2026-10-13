// Owned EPUB parser (browser only). Opens the zip, reads the OPF package,
// builds a table of contents, and returns sanitized chapter HTML.
//
// Security: book HTML is untrusted. Chapters are sanitized with DOMPurify, book
// styles and scripts are dropped, and images are only served from inside the
// book as blob URLs. Remote resources are removed, not fetched.
import JSZip from "jszip";
import DOMPurify from "dompurify";

export type TocItem = { title: string; spineIndex: number; fragment?: string; depth: number };
export type Chapter = { html: string; title: string };

export type EpubBook = {
  title: string;
  author: string;
  spineLength: number;
  /** Manifest item ids in reading order; the Mac uses these as locator resource IDs. */
  spineIds: string[];
  toc: TocItem[];
  chapter(index: number): Promise<Chapter>;
  /** Plain text of a chapter, for searching. */
  plainText(index: number): Promise<string>;
  /** The declared cover image, if the book has one. */
  cover(): Promise<Blob | null>;
  dispose(): void;
};

type ManifestItem = { id: string; path: string; type: string; props: string };

const XHTML = "application/xhtml+xml";

// Resolve `rel` against the zip path `from`, returning a zip path (no fragment).
function resolvePath(from: string, rel: string): string {
  const url = new URL(rel, `http://epub.invalid/${from}`);
  return decodeURIComponent(url.pathname.slice(1));
}

function splitHref(rel: string): { file: string; fragment?: string } {
  const hash = rel.indexOf("#");
  return hash === -1 ? { file: rel } : { file: rel.slice(0, hash), fragment: rel.slice(hash + 1) || undefined };
}

function parseXml(text: string, type: DOMParserSupportedType = "application/xml"): Document {
  return new DOMParser().parseFromString(text, type);
}

const textOf = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

export async function openEpub(data: ArrayBuffer): Promise<EpubBook> {
  const zip = await JSZip.loadAsync(data);

  const read = async (path: string): Promise<string> => {
    const file = zip.file(path) ?? zip.file(decodeURIComponent(path));
    if (!file) throw new Error(`Missing ${path}`);
    return file.async("string");
  };

  const container = parseXml(await read("META-INF/container.xml"));
  const opfPath = container.querySelector("rootfile")?.getAttribute("full-path");
  if (!opfPath) throw new Error("Not a valid EPUB");
  const opf = parseXml(await read(opfPath));

  const manifest = new Map<string, ManifestItem>();
  for (const item of Array.from(opf.getElementsByTagName("item"))) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (!id || !href) continue;
    manifest.set(id, {
      id,
      path: resolvePath(opfPath, href),
      type: item.getAttribute("media-type") ?? "",
      props: item.getAttribute("properties") ?? "",
    });
  }

  const spine = Array.from(opf.getElementsByTagName("itemref"))
    .map((ref) => manifest.get(ref.getAttribute("idref") ?? ""))
    .filter((item): item is ManifestItem => Boolean(item && /x?html/.test(item.type)));
  if (spine.length === 0) throw new Error("This book has no readable chapters");
  const spineIndexByPath = new Map(spine.map((item, i) => [item.path, i]));

  const title = textOf(opf.getElementsByTagName("dc:title")[0]) || "Untitled";
  const author = textOf(opf.getElementsByTagName("dc:creator")[0]);

  // ---- table of contents (EPUB3 nav, else EPUB2 NCX, else the spine) ----
  const toc: TocItem[] = [];
  const addToc = (basePath: string, href: string, label: string, depth: number) => {
    const { file, fragment } = splitHref(href);
    const spineIndex = spineIndexByPath.get(file ? resolvePath(basePath, file) : basePath);
    if (spineIndex !== undefined && label) toc.push({ title: label, spineIndex, fragment, depth });
  };

  const navItem = Array.from(manifest.values()).find((m) => m.props.split(" ").includes("nav"));
  const ncxItem = Array.from(manifest.values()).find((m) => m.type === "application/x-dtbncx+xml");
  try {
    if (navItem) {
      const doc = parseXml(await read(navItem.path), "text/html");
      const navs = Array.from(doc.querySelectorAll("nav"));
      const tocNav = navs.find((n) => (n.getAttribute("epub:type") ?? "").includes("toc")) ?? navs[0];
      const walk = (list: Element | null, depth: number) => {
        for (const li of Array.from(list?.children ?? []).filter((c) => c.tagName.toLowerCase() === "li")) {
          const a = li.querySelector(":scope > a, :scope > span");
          const href = a?.tagName.toLowerCase() === "a" ? a.getAttribute("href") : null;
          if (href) addToc(navItem.path, href, textOf(a), depth);
          walk(li.querySelector(":scope > ol"), depth + 1);
        }
      };
      walk(tocNav?.querySelector("ol") ?? null, 0);
    } else if (ncxItem) {
      const doc = parseXml(await read(ncxItem.path));
      const walk = (parent: Element, depth: number) => {
        for (const point of Array.from(parent.children).filter((c) => c.localName === "navPoint")) {
          const label = textOf(point.getElementsByTagName("text")[0]);
          const src = point.getElementsByTagName("content")[0]?.getAttribute("src");
          if (src) addToc(ncxItem.path, src, label, depth);
          walk(point, depth + 1);
        }
      };
      const navMap = doc.getElementsByTagName("navMap")[0];
      if (navMap) walk(navMap, 0);
    }
  } catch {
    // Fall through to the spine-derived contents below.
  }
  if (toc.length === 0) spine.forEach((_, i) => toc.push({ title: `Section ${i + 1}`, spineIndex: i, depth: 0 }));

  // ---- chapters ----
  const blobUrls = new Map<string, string>();
  const blobFor = async (path: string): Promise<string | null> => {
    const cached = blobUrls.get(path);
    if (cached) return cached;
    const file = zip.file(path) ?? zip.file(decodeURIComponent(path));
    if (!file) return null;
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const type =
      { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" }[ext];
    if (!type) return null;
    const url = URL.createObjectURL(new Blob([await file.async("arraybuffer")], { type }));
    blobUrls.set(path, url);
    return url;
  };

  const chapter = async (index: number): Promise<Chapter> => {
    const item = spine[index];
    const source = await read(item.path);
    let doc = parseXml(source, XHTML);
    if (doc.querySelector("parsererror")) doc = parseXml(source, "text/html");
    const body = doc.body ?? doc.getElementsByTagName("body")[0];

    const fragment = DOMPurify.sanitize(body?.innerHTML ?? "", {
      USE_PROFILES: { html: true, svg: true },
      FORBID_TAGS: ["style", "link", "script", "iframe", "object", "embed", "form", "base", "meta", "audio", "video", "source"],
      FORBID_ATTR: ["style"],
      RETURN_DOM_FRAGMENT: true,
    }) as DocumentFragment;

    for (const img of Array.from(fragment.querySelectorAll("img"))) {
      const src = img.getAttribute("src");
      const blob = src && !/^[a-z][a-z0-9+.-]*:/i.test(src) ? await blobFor(resolvePath(item.path, splitHref(src).file)) : null;
      if (blob) {
        img.setAttribute("src", blob);
        img.removeAttribute("srcset");
        img.setAttribute("loading", "lazy");
      } else img.remove();
    }
    for (const image of Array.from(fragment.querySelectorAll("image"))) {
      const href = image.getAttribute("href") ?? image.getAttribute("xlink:href");
      const blob = href && !/^[a-z][a-z0-9+.-]*:/i.test(href) ? await blobFor(resolvePath(item.path, splitHref(href).file)) : null;
      if (blob) {
        image.setAttribute("href", blob);
        image.removeAttribute("xlink:href");
      } else image.remove();
    }
    for (const a of Array.from(fragment.querySelectorAll("a[href]"))) {
      const href = a.getAttribute("href") ?? "";
      if (/^(https?:|mailto:)/i.test(href)) {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
        continue;
      }
      const { file, fragment: frag } = splitHref(href);
      const targetPath = file ? resolvePath(item.path, file) : item.path;
      const spineIndex = spineIndexByPath.get(targetPath);
      a.removeAttribute("href");
      if (spineIndex !== undefined) {
        a.setAttribute("data-spine", String(spineIndex));
        if (frag) a.setAttribute("data-fragment", frag);
        a.setAttribute("href", "#");
      }
    }

    const wrapper = document.createElement("div");
    wrapper.appendChild(fragment);
    const heading = wrapper.querySelector("h1, h2, h3");
    const fromToc = toc.find((t) => t.spineIndex === index)?.title;
    const imageOnly = !textOf(wrapper) && wrapper.querySelector("img, svg");
    return { html: wrapper.innerHTML, title: textOf(heading) || fromToc || (imageOnly && index === 0 ? "Cover" : `Section ${index + 1}`) };
  };

  const texts = new Map<number, string>();
  const plainText = async (index: number): Promise<string> => {
    const cached = texts.get(index);
    if (cached !== undefined) return cached;
    const source = await read(spine[index].path);
    let doc = parseXml(source, XHTML);
    if (doc.querySelector("parsererror")) doc = parseXml(source, "text/html");
    const clone = (doc.body ?? doc.getElementsByTagName("body")[0])?.cloneNode(true) as Element | undefined;
    clone?.querySelectorAll("script, style").forEach((n) => n.remove());
    // Keep words from different paragraphs apart in snippets.
    clone?.querySelectorAll("p, div, h1, h2, h3, h4, h5, h6, li, br, blockquote, tr, td, th, section").forEach((el) => el.after(doc.createTextNode(" ")));
    const text = (clone?.textContent ?? "").replace(/\s+/g, " ").trim();
    texts.set(index, text);
    return text;
  };

  const cover = async (): Promise<Blob | null> => {
    const metaId = opf.querySelector('meta[name="cover"]')?.getAttribute("content");
    const items = Array.from(manifest.values()).filter((m) => m.type.startsWith("image/"));
    const item =
      items.find((m) => m.props.split(" ").includes("cover-image")) ??
      items.find((m) => m.id === metaId) ??
      items.find((m) => /cover/i.test(m.id) || /cover/i.test(m.path));
    const file = item && (zip.file(item.path) ?? zip.file(decodeURIComponent(item.path)));
    return file && item ? new Blob([await file.async("arraybuffer")], { type: item.type }) : null;
  };

  return {
    title,
    author,
    cover,
    plainText,
    spineLength: spine.length,
    spineIds: spine.map((item) => item.id),
    toc,
    chapter,
    dispose: () => blobUrls.forEach((url) => URL.revokeObjectURL(url)),
  };
}
