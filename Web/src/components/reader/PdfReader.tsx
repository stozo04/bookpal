"use client";
import "pdfjs-dist/web/pdf_viewer.css";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ReaderChrome, type ContentsItem } from "./ReaderChrome";
import { useReaderPrefs } from "./useReaderPrefs";
import type { AskConfig } from "./AskPanel";
import type { SearchConfig } from "./SearchPanel";
import type { BookConfig, ReaderMeta } from "./BookPanel";
import { useNotes } from "./useNotes";
import type { ReaderNotes } from "@/lib/notes";
import { findIn, findRanges, paint, type Hit } from "@/lib/textsearch";
import { useAutoHideBar, usePlaceSaver } from "./useReadingPlace";
import { openPdf } from "@/lib/pdf";
import styles from "./PdfReader.module.css";

type Initial = { resourceID: string; position: number; progression: number } | null;
type Size = { w: number; h: number }; // a page at scale 1
type OutlineNode = { title: string; dest: unknown; items?: OutlineNode[] };

const BAR = 72;

function PageView({ pdf, index, scale, size, dark, onSize }: {
  pdf: PDFDocumentProxy; index: number; scale: number; size: Size; dark: boolean; onSize: (i: number, s: Size) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => setNear(entries[0].isIntersecting), { rootMargin: "250% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current, t = text.current;
    if (!c || !t) return;
    if (!near) {
      c.width = 0;
      t.replaceChildren();
      return;
    }
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | undefined;
    let textLayer: { cancel: () => void; render: () => Promise<unknown> } | undefined;
    (async () => {
      try {
        const { TextLayer } = await import("pdfjs-dist");
        const page = await pdf.getPage(index + 1);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        if (Math.abs(base.width - size.w) > 1 || Math.abs(base.height - size.h) > 1) onSize(index, { w: base.width, h: base.height });
        const viewport = page.getViewport({ scale });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        c.width = Math.floor(viewport.width * dpr);
        c.height = Math.floor(viewport.height * dpr);
        c.style.width = `${viewport.width}px`;
        c.style.height = `${viewport.height}px`;
        renderTask = page.render({ canvas: c, viewport, transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0] });
        t.replaceChildren();
        textLayer = new TextLayer({ textContentSource: page.streamTextContent(), container: t, viewport });
        await Promise.all([renderTask.promise, textLayer.render()]);
      } catch {
        // A cancelled render (scrolled away or zoomed) is expected.
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [near, pdf, index, scale]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={wrap} className={`${styles.page} ${dark ? styles.dark : ""}`} data-page={index}
      style={{ width: size.w * scale, height: size.h * scale, ["--scale-factor" as string]: scale, ["--total-scale-factor" as string]: scale }}
    >
      <canvas ref={canvas} />
      <div ref={text} className="textLayer" />
    </div>
  );
}

export function PdfReader({ fileId, fingerprint, title, byteSize, initial, meta, notes: savedNotes }: {
  fileId: string; fingerprint: string; title: string; byteSize: number; initial: Initial; meta: ReaderMeta; notes: ReaderNotes;
}) {
  const { notes, saveSummary, saveCast, saveProfile, saveWord, saveRecap } = useNotes(fileId, savedNotes);
  const prefs = useReaderPrefs("zoom");
  const { hidden, setHidden, onScrollY, settle } = useAutoHideBar();
  const { schedule } = usePlaceSaver(fileId, fingerprint);
  const [phase, setPhase] = useState<"loading" | "ready" | "error" | "locked">("loading");
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [outline, setOutline] = useState<OutlineNode[]>([]);
  const [sizes, setSizes] = useState<Record<number, Size>>({});
  const [available, setAvailable] = useState(800);
  const [current, setCurrent] = useState(0);
  const [progress, setProgress] = useState(0);
  const main = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const restored = useRef(false);
  const currentRef = useRef(0);

  useEffect(() => {
    document.title = `${title} · BookPal`;
  }, [title]);

  useEffect(() => {
    let cancelled = false;
    let task: { destroy: () => Promise<void> } | null = null;
    (async () => {
      try {
        const opened = await openPdf(fileId, byteSize);
        task = opened;
        const doc = opened.doc;
        if (cancelled) return void opened.destroy();
        const first = await doc.getPage(1);
        const v = first.getViewport({ scale: 1 });
        setSizes({ 0: { w: v.width, h: v.height } });
        setOutline(((await doc.getOutline().catch(() => null)) ?? []) as OutlineNode[]);
        setPdf(doc);
        setPhase("ready");
      } catch (e) {
        if (!cancelled) setPhase((e as { name?: string })?.name === "PasswordException" ? "locked" : "error");
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [fileId]);

  useEffect(() => {
    const el = main.current;
    if (!el) return;
    const measure = () => setAvailable(Math.min(el.clientWidth - 32, 980));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase]);

  const first = sizes[0];
  const scale = first ? (available / first.w) * (prefs.size / 100) : 1;
  const pageSize = (i: number): Size => sizes[i] ?? first;
  const onSize = useCallback((i: number, s: Size) => setSizes((all) => ({ ...all, [i]: s })), []);

  const pageTop = (i: number) => (list.current?.children[i] as HTMLElement | undefined)?.offsetTop ?? 0;
  const goToPage = useCallback((i: number) => window.scrollTo({ top: pageTop(i) - BAR + (main.current?.offsetTop ?? 0) }), []);

  // Restore the saved page once the layout exists.
  useEffect(() => {
    if (phase !== "ready" || !pdf || restored.current) return;
    restored.current = true;
    const match = initial?.resourceID.match(/^page-(\d+)$/);
    const target = match ? Math.min(Number(match[1]), pdf.numPages - 1) : 0;
    requestAnimationFrame(() => {
      if (target > 0) goToPage(target);
      settle();
    });
  }, [phase, pdf, initial, goToPage, settle]);

  // Keep the same page in view when zoom changes.
  const lastScale = useRef(scale);
  useEffect(() => {
    if (lastScale.current === scale || !restored.current) return void (lastScale.current = scale);
    lastScale.current = scale;
    requestAnimationFrame(() => goToPage(currentRef.current));
  }, [scale, goToPage]);

  useEffect(() => {
    if (phase !== "ready" || !pdf) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        onScrollY(window.scrollY);
        const line = window.scrollY + BAR + 20 - (main.current?.offsetTop ?? 0);
        let lo = 0, hi = pdf.numPages - 1;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (pageTop(mid) <= line) lo = mid;
          else hi = mid - 1;
        }
        const height = (list.current?.children[lo] as HTMLElement | undefined)?.offsetHeight ?? 1;
        const within = Math.min(1, Math.max(0, (line - pageTop(lo)) / height));
        const overall = (lo + within) / pdf.numPages;
        currentRef.current = lo;
        setCurrent(lo);
        setProgress(overall);
        if (restored.current) {
          schedule({ progress: overall, resourceID: `page-${lo}`, position: lo, progression: pdf.numPages <= 1 ? 0 : lo / (pdf.numPages - 1) });
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [phase, pdf, onScrollY, schedule]);

  // Outline entries resolve to a page only when chosen.
  const flatten = useCallback((nodes: OutlineNode[], depth = 0): ContentsItem[] =>
    nodes.flatMap((n) => [
      {
        label: n.title.trim() || "Untitled", depth,
        onSelect: async () => {
          if (!pdf) return;
          try {
            const dest = typeof n.dest === "string" ? await pdf.getDestination(n.dest) : (n.dest as unknown[] | null);
            const ref = dest?.[0];
            const index = typeof ref === "number" ? ref : ref ? await pdf.getPageIndex(ref as never) : -1;
            if (index >= 0) goToPage(index);
          } catch {}
        },
      },
      ...flatten(n.items ?? [], depth + 1),
    ]), [pdf, goToPage]);

  const pageTexts = useRef(new Map<number, string>());
  const search: SearchConfig | undefined = pdf ? {
    run: async (query, report, signal) => {
      const found: Hit[] = [];
      for (let i = 0; i < pdf.numPages && found.length < 300; i++) {
        if (signal.aborted) return;
        let text = pageTexts.current.get(i);
        if (text === undefined) {
          const content = await (await pdf.getPage(i + 1)).getTextContent();
          text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ").replace(/\s+/g, " ").trim();
          pageTexts.current.set(i, text);
        }
        findIn(text, query, 5).forEach((m, k) => found.push({ group: `Page ${i + 1}`, before: m.before, match: m.match, after: m.after, occurrence: k, at: i }));
        if (i % 5 === 0 || i === pdf.numPages - 1) report([...found]);
      }
    },
    onSelect: (hit, query) => {
      goToPage(hit.at);
      let tries = 0;
      const paintWhenReady = () => {
        const layer = list.current?.children[hit.at]?.querySelector(".textLayer");
        if (layer && layer.childElementCount > 0) paint(window, findRanges(layer, query));
        else if (tries++ < 25) setTimeout(paintWhenReady, 150);
      };
      paintWhenReady();
    },
    onClear: () => paint(window, []),
  } : undefined;

  const progressRef = useRef(0);
  progressRef.current = progress;

  // Every page up to the one in view.
  const getTextSoFar = async (report?: (message: string) => void) => {
    if (!pdf) return { text: "", label: "" };
    const upTo = currentRef.current;
    const parts: string[] = [];
    for (let i = 0; i <= upTo; i++) {
      let t = pageTexts.current.get(i);
      if (t === undefined) {
        if (i % 6 === 0) report?.(`Reading page ${i + 1} of ${upTo + 1}…`);
        const content = await (await pdf.getPage(i + 1)).getTextContent();
        t = content.items.map((item) => ("str" in item ? item.str : "")).join(" ").replace(/\s+/g, " ").trim();
        pageTexts.current.set(i, t);
      }
      parts.push(t);
    }
    return { text: parts.join("\n\n"), label: getLabel() };
  };
  const getLabel = () => `page ${currentRef.current + 1}`;

  const bookConfig: BookConfig | undefined = pdf ? {
    info: { fileId, title, format: "PDF", ...meta },
    getProgress: () => progressRef.current,
    getTextSoFar, getLabel, notes, saveCast, saveProfile,
  } : undefined;

  const ask: AskConfig | undefined = pdf ? {
    fileId, getTextSoFar, getLabel, savedSummaries: notes.summaries, saveSummary, savedWords: notes.words, saveWord, savedRecaps: notes.recaps, saveRecap, getProgress: () => progressRef.current,
    bookTitle: title,
    scope: { id: "page", label: "This page" },
    getSelection: () => window.getSelection()?.toString().trim() ?? "",
    getContext: async () => {
      const n = currentRef.current + 1;
      const content = await (await pdf.getPage(n)).getTextContent();
      const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ").replace(/\s+/g, " ").trim();
      return { excerpt: text || "(This page has no readable text.)", sectionTitle: `Page ${n}` };
    },
  } : undefined;

  if (phase !== "ready" || !pdf) {
    return (
      <ReaderChrome title={title} progress={0} hidden={false} contents={null} prefs={prefs} sizeLabel="Zoom" showTypeface={false}>
        <div className={styles.center}>
          {phase === "loading" ? <p className={styles.loading}>Opening your book…</p> : (
            <>
              <p className={styles.loading}>{phase === "locked" ? "This PDF is password protected." : "This book couldn’t be opened."}</p>
              <Link href="/library" className="button">Back to library</Link>
            </>
          )}
        </div>
      </ReaderChrome>
    );
  }

  return (
    <ReaderChrome
      title={title} subtitle={`Page ${current + 1} of ${pdf.numPages}`} progress={progress} hidden={hidden}
      prefs={prefs} sizeLabel="Zoom" showTypeface={false} contents={outline.length ? flatten(outline) : null} ask={ask} search={search} book={bookConfig}
    >
      <main ref={main} className={styles.main} onClick={() => !window.getSelection()?.toString() && setHidden((h) => !h)}>
        <div ref={list} className={styles.list}>
          {Array.from({ length: pdf.numPages }, (_, i) => (
            <PageView key={i} pdf={pdf} index={i} scale={scale} size={pageSize(i)} dark={prefs.theme === "dark"} onSize={onSize} />
          ))}
        </div>
      </main>
    </ReaderChrome>
  );
}
