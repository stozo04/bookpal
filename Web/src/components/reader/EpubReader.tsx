"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openEpub, type Chapter, type EpubBook } from "@/lib/epub";
import { CHAPTER_CSS, themeVars } from "./themes";
import { ReaderChrome } from "./ReaderChrome";
import { webLocator } from "@/lib/locator";
import { useReaderPrefs } from "./useReaderPrefs";
import type { AskConfig } from "./AskPanel";
import type { SearchConfig } from "./SearchPanel";
import type { BookConfig, ReaderMeta } from "./BookPanel";
import { useNotes } from "./useNotes";
import type { ReaderNotes } from "@/lib/notes";
import { findIn, findRanges, paint, type Hit } from "@/lib/textsearch";
import styles from "./EpubReader.module.css";

type Phase = "loading" | "ready" | "error";

type Initial = { resourceID: string; position: number; progression: number } | null;

// Character offset of the text at the top of the visible page, counted over the
// chapter's text nodes (the same idea the Mac app uses for locator.position).
function textNodes(root: Element, doc: Document) {
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  return nodes;
}

function offsetAtTop(frame: HTMLIFrameElement): number {
  const doc = frame.contentDocument;
  const root = doc?.querySelector("article");
  if (!doc || !root || !doc.caretRangeFromPoint) return 0;
  const y = Math.min(Math.max(window.scrollY - frame.offsetTop + 100, 1), frame.clientHeight - 1);
  const range = doc.caretRangeFromPoint(Math.max(doc.documentElement.clientWidth / 2, 1), y);
  if (!range || !root.contains(range.startContainer)) return 0;
  let offset = 0;
  for (const node of textNodes(root, doc)) {
    if (node === range.startContainer) return offset + range.startOffset;
    offset += node.data.length;
  }
  return 0;
}

function scrollToOffset(frame: HTMLIFrameElement, offset: number) {
  const doc = frame.contentDocument;
  const root = doc?.querySelector("article");
  if (!doc || !root) return;
  let acc = 0;
  for (const node of textNodes(root, doc)) {
    if (acc + node.data.length >= offset) {
      const range = doc.createRange();
      range.setStart(node, Math.max(0, offset - acc));
      range.collapse(true);
      window.scrollTo({ top: frame.offsetTop + range.getBoundingClientRect().top - 100 });
      return;
    }
    acc += node.data.length;
  }
}

function deviceId(): string {
  try {
    const saved = localStorage.getItem("bookpal:device-id");
    if (saved) return saved;
    const fresh = crypto.randomUUID();
    localStorage.setItem("bookpal:device-id", fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

export function EpubReader({ fileId, fingerprint, fallbackTitle, initial, meta, notes: savedNotes }: {
  fileId: string; fingerprint: string; fallbackTitle: string; initial: Initial; meta: ReaderMeta; notes: ReaderNotes;
}) {
  const { notes, saveSummary, saveCast, saveProfile, saveWord, saveRecap } = useNotes(fileId, savedNotes);
  const [phase, setPhase] = useState<Phase>("loading");
  const [book, setBook] = useState<EpubBook | null>(null);
  const [index, setIndex] = useState(0);
  const [pendingFragment, setPendingFragment] = useState<string | undefined>();
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const prefs = useReaderPrefs();
  const { theme, size, face } = prefs;
  const [barHidden, setBarHidden] = useState(false);
  const [fraction, setFraction] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const fragmentRef = useRef<string | undefined>(undefined);
  const prefsRef = useRef({ theme, size, face });
  prefsRef.current = { theme, size, face };
  const restore = useRef<Initial>(null);
  const placeReady = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ index: 0, fraction: 0 });
  const pendingSearch = useRef<{ query: string; occurrence: number } | null>(null);
  const chapterRef = useRef<Chapter | null>(null);
  chapterRef.current = chapter;
  const lastY = useRef(0);
  const quietUntil = useRef(0);
  const indexRef = useRef(0);
  indexRef.current = index;

  // Open the book.
  useEffect(() => {
    let cancelled = false;
    let opened: EpubBook | null = null;
    (async () => {
      try {
        const link = await fetch(`/api/files/${fileId}/download`);
        if (!link.ok) throw new Error("download link");
        const { url } = await link.json();
        const bytes = await fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("download"))));
        opened = await openEpub(bytes);
        if (cancelled) return opened.dispose();
        const start = initial ? opened.spineIds.indexOf(initial.resourceID) : -1;
        if (start >= 0) {
          restore.current = initial;
          setIndex(start);
        } else placeReady.current = true;
        setBook(opened);
        setPhase("ready");
      } catch {
        if (!cancelled) setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
      opened?.dispose();
    };
  }, [fileId, initial]);

  useEffect(() => {
    if (book) document.title = `${book.title} · BookPal`;
  }, [book]);

  // Load the current chapter.
  useEffect(() => {
    if (!book) return;
    let cancelled = false;
    book.chapter(index).then((c) => !cancelled && setChapter(c)).catch(() => !cancelled && setPhase("error"));
    return () => {
      cancelled = true;
    };
  }, [book, index]);

  const goTo = useCallback((next: number, fragment?: string) => {
    fragmentRef.current = fragment;
    setPendingFragment(fragment);
    setIndex((current) => {
      if (current === next && fragment) scrollToFragment(fragment);
      return next;
    });
    if (!fragment) window.scrollTo({ top: 0 });
  }, []);

  function scrollToFragment(fragment: string) {
    const el = frame.current?.contentDocument?.getElementById(fragment);
    if (!el || !frame.current) return;
    window.scrollTo({ top: frame.current.offsetTop + el.getBoundingClientRect().top - 80 });
  }

  const srcDoc = useMemo(() => {
    if (!chapter) return "";
    const vars = Object.entries(themeVars(prefsRef.current.theme, prefsRef.current.size, prefsRef.current.face))
      .map(([k, v]) => `${k}:${v}`)
      .join(";");
    return `<!doctype html><html style="${vars.replace(/"/g, "&quot;")}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob: data:; style-src 'unsafe-inline'">
<style>${CHAPTER_CSS}</style></head><body><article>${chapter.html}</article></body></html>`;
  }, [chapter]);

  // Keep the chapter document in step with theme, size and typeface.
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    for (const [k, v] of Object.entries(themeVars(theme, size, face))) doc.documentElement.style.setProperty(k, v);
    fit();
  }, [theme, size, face]);

  function fit() {
    const f = frame.current;
    const doc = f?.contentDocument;
    if (f && doc) f.style.height = `${doc.documentElement.scrollHeight}px`;
  }

  const savePlace = useCallback((keepalive = false) => {
    const f = frame.current;
    if (!book || !f || !placeReady.current) return;
    const { index: i, fraction: fr } = latest.current;
    void fetch(`/api/files/${fileId}/progress`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive,
      body: JSON.stringify({
        deviceId: deviceId(),
        progress: Math.min(1, (i + fr) / book.spineLength),
        locator: webLocator(fingerprint, book.spineIds[i], offsetAtTop(f), fr),
      }),
    }).catch(() => {});
  }, [book, fileId, fingerprint]);

  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => savePlace(), 2000);
  }, [savePlace]);

  useEffect(() => {
    const flush = () => document.visibilityState === "hidden" && (clearTimeout(saveTimer.current), savePlace(true));
    document.addEventListener("visibilitychange", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      clearTimeout(saveTimer.current);
    };
  }, [savePlace]);

  const applySearch = useCallback(() => {
    const f = frame.current;
    const article = f?.contentDocument?.querySelector("article");
    const pending = pendingSearch.current;
    if (!f || !article || !pending) return;
    pendingSearch.current = null;
    const ranges = findRanges(article, pending.query);
    paint(f.contentWindow, ranges);
    const target = ranges[Math.min(pending.occurrence, ranges.length - 1)];
    if (target) window.scrollTo({ top: f.offsetTop + target.getBoundingClientRect().top - 140 });
  }, []);

  const onFrameLoad = () => {
    const f = frame.current;
    const doc = f?.contentDocument;
    if (!f || !doc) return;
    fit();
    quietUntil.current = performance.now() + 1500;
    if (pendingSearch.current) requestAnimationFrame(applySearch);
    new ResizeObserver(fit).observe(doc.body);
    doc.addEventListener("click", (e) => {
      const a = (e.target as Element).closest("a");
      if (!a) {
        if (!doc.getSelection()?.toString()) setBarHidden((hidden) => !hidden); // tap the page to show or hide the bar
        return;
      }
      const spine = a.getAttribute("data-spine");
      if (a.getAttribute("href") === "#") {
        e.preventDefault();
        if (spine !== null) goTo(Number(spine), a.getAttribute("data-fragment") ?? undefined);
      }
    });
    if (fragmentRef.current) {
      scrollToFragment(fragmentRef.current);
      fragmentRef.current = undefined;
      setPendingFragment(undefined);
    } else if (restore.current) {
      const saved = restore.current;
      restore.current = null;
      requestAnimationFrame(() => {
        if (saved.position > 0) scrollToOffset(f, saved.position);
        else window.scrollTo({ top: f.offsetTop + saved.progression * Math.max(f.clientHeight - window.innerHeight, 0) });
        lastY.current = window.scrollY; // a restore is not a reader scrolling away
        setBarHidden(false);
        placeReady.current = true;
        onScroll();
      });
      return;
    }
    placeReady.current = true;
    onScroll();
    scheduleSave();
  };

  // Progress and auto-hiding bar.
  const onScroll = useCallback(() => {
    const f = frame.current;
    if (!f) return;
    const rect = f.getBoundingClientRect();
    const span = rect.height - window.innerHeight;
    const fr = span <= 0 ? 1 : Math.min(1, Math.max(0, -rect.top / span));
    setFraction(fr);
    latest.current = { index: indexRef.current, fraction: fr };
    if (placeReady.current) scheduleSave();
    const y = window.scrollY;
    if (performance.now() < quietUntil.current) { lastY.current = y; return; } // late layout shifts after opening
    if (y < 80) setBarHidden(false);
    else if (y > lastY.current + 4) setBarHidden(true);
    else if (y < lastY.current - 4) setBarHidden(false);
    lastY.current = y;
  }, [scheduleSave]);
  useEffect(() => {
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  // A short name for the reader's place; the key for saved summaries and the cast.
  const getLabel = useCallback(() => {
    if (!book) return "";
    const i = indexRef.current;
    const fr = latest.current.fraction;
    const title = [...book.toc].reverse().find((t) => t.spineIndex <= i)?.title ?? `Section ${i + 1}`;
    return fr > 0.1 && fr < 0.95 ? `${title}, ${Math.round(fr * 10) * 10}%` : title;
  }, [book]);

  // Everything before the reader's place: earlier chapters in full, this one up to where they are.
  const getTextSoFar = useCallback(async (progress?: (message: string) => void) => {
    if (!book) return { text: "", label: "" };
    const i = indexRef.current;
    const fr = latest.current.fraction;
    const parts: string[] = [];
    for (let k = 0; k < i; k++) {
      if (k % 4 === 0) progress?.(`Reading chapter ${k + 1} of ${i + 1}…`);
      parts.push(await book.plainText(k));
    }
    const current = await book.plainText(i);
    parts.push(current.slice(0, Math.round(current.length * fr)));
    return { text: parts.join("\n\n"), label: getLabel() };
  }, [book, getLabel]);

  const bookConfig = useMemo<BookConfig | undefined>(() => !book ? undefined : {
    info: { fileId, title: meta.titleIsFilename ? (book.title || fallbackTitle) : fallbackTitle, format: "EPUB", ...meta, author: meta.author || book.author },
    getProgress: () => (book.spineLength ? (indexRef.current + latest.current.fraction) / book.spineLength : 0),
    getTextSoFar, getLabel, notes, saveCast, saveProfile,
  }, [book, fileId, fallbackTitle, meta, getTextSoFar, getLabel, notes, saveCast, saveProfile]);

  const ask = useMemo<AskConfig | undefined>(() => !book ? undefined : {
    fileId, getTextSoFar, getLabel, savedSummaries: notes.summaries, saveSummary, savedWords: notes.words, saveWord, savedRecaps: notes.recaps, saveRecap,
    getProgress: () => (book.spineLength ? (indexRef.current + latest.current.fraction) / book.spineLength : 0),
    bookTitle: meta.titleIsFilename ? (book.title || fallbackTitle) : fallbackTitle,
    scope: { id: "section", label: "This section" },
    getSelection: () => frame.current?.contentDocument?.getSelection()?.toString().trim() ?? "",
    getContext: async () => {
      const f = frame.current;
      const text = (f?.contentDocument?.querySelector("article")?.textContent ?? "").replace(/\s+/g, " ").trim();
      const WINDOW = 24_000;
      const start = text.length > WINDOW && f ? Math.min(Math.max(offsetAtTop(f) - 6_000, 0), text.length - WINDOW) : 0;
      return { excerpt: text.slice(start, start + WINDOW), sectionTitle: chapterRef.current?.title };
    },
  }, [book, fallbackTitle, fileId, getTextSoFar, getLabel, notes.summaries, saveSummary, notes.words, saveWord, notes.recaps, saveRecap, meta.titleIsFilename]);
  const search = useMemo<SearchConfig | undefined>(() => !book ? undefined : {
    run: async (query, report, signal) => {
      const found: Hit[] = [];
      for (let i = 0; i < book.spineLength && found.length < 300; i++) {
        if (signal.aborted) return;
        const text = await book.plainText(i);
        const label = [...book.toc].reverse().find((t) => t.spineIndex <= i)?.title ?? `Section ${i + 1}`;
        findIn(text, query).forEach((m, k) => found.push({ group: label, before: m.before, match: m.match, after: m.after, occurrence: k, at: i }));
        report([...found]);
      }
    },
    onSelect: (hit, query) => {
      pendingSearch.current = { query, occurrence: hit.occurrence };
      if (hit.at === indexRef.current) applySearch();
      else goTo(hit.at);
    },
    onClear: () => paint(frame.current?.contentWindow, []),
  }, [book, goTo, applySearch]);
  const overall = book ? (index + fraction) / book.spineLength : 0;
  const currentToc = book ? [...book.toc].reverse().find((t) => t.spineIndex <= index) : undefined;
  const prev = index > 0 ? index - 1 : null;
  const next = book && index < book.spineLength - 1 ? index + 1 : null;

  if (phase !== "ready" || !book) {
    return (
      <ReaderChrome title={fallbackTitle} progress={0} hidden={false} contents={null} prefs={prefs}>
        <div className={styles.center}>
          {phase === "loading" ? (
            <p className={styles.loading}>Opening your book…</p>
          ) : (
            <>
              <p className={styles.loading}>This book couldn’t be opened.</p>
              <Link href="/library" className="button">Back to library</Link>
            </>
          )}
        </div>
      </ReaderChrome>
    );
  }

  return (
    <ReaderChrome
      title={meta.titleIsFilename ? (book.title || fallbackTitle) : fallbackTitle}
      subtitle={chapter?.title ?? currentToc?.title ?? ""}
      progress={overall}
      hidden={barHidden}
      prefs={prefs}
      ask={ask}
      search={search}
      book={bookConfig}
      contents={book.toc.map((t) => ({
        label: t.title, depth: t.depth, current: t === currentToc, onSelect: () => goTo(t.spineIndex, t.fragment),
      }))}
    >
      <main className={styles.page}>
        {chapter ? (
          <iframe
            key={index} ref={frame} title={chapter.title} srcDoc={srcDoc} sandbox="allow-same-origin"
            scrolling="no" className={styles.frame} onLoad={onFrameLoad}
          />
        ) : (
          <div className={styles.center}><p className={styles.loading}>Opening your book…</p></div>
        )}
        <nav className={styles.pager} aria-label="Chapters">
          <button type="button" disabled={prev === null} onClick={() => prev !== null && goTo(prev)}>
            <span className="voice">Previous</span>
          </button>
          <span className="voice">{index + 1} of {book.spineLength}</span>
          <button type="button" disabled={next === null} onClick={() => next !== null && goTo(next)}>
            <span className="voice">Next</span>
          </button>
        </nav>
      </main>
    </ReaderChrome>
  );
}
