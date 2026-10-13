"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReaderChrome } from "./ReaderChrome";
import { useReaderPrefs } from "./useReaderPrefs";
import type { AskConfig } from "./AskPanel";
import type { SearchConfig } from "./SearchPanel";
import type { BookConfig, ReaderMeta } from "./BookPanel";
import { useNotes } from "./useNotes";
import type { ReaderNotes } from "@/lib/notes";
import { findIn, findRanges, paint, type Hit } from "@/lib/textsearch";
import { openFileBytes, useAutoHideBar, usePlaceSaver } from "./useReadingPlace";
import styles from "./TxtReader.module.css";

type Initial = { resourceID: string; position: number; progression: number } | null;
const BATCH = 300;

// Same normalisation the Mac app applies, so character offsets agree.
const normalise = (text: string) =>
  text.replace(/[ \t\r\f\v]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();

export function TxtReader({ fileId, fingerprint, title, initial, meta, notes: savedNotes }: {
  fileId: string; fingerprint: string; title: string; initial: Initial; meta: ReaderMeta; notes: ReaderNotes;
}) {
  const { notes, saveSummary, saveCast, saveProfile, saveWord, saveRecap } = useNotes(fileId, savedNotes);
  const prefs = useReaderPrefs();
  const { hidden, setHidden, onScrollY, settle } = useAutoHideBar();
  const { schedule } = usePlaceSaver(fileId, fingerprint);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [paragraphs, setParagraphs] = useState<{ text: string; start: number }[]>([]);
  const [total, setTotal] = useState(1);
  const [shown, setShown] = useState(BATCH);
  const [progress, setProgress] = useState(0);
  const els = useRef<(HTMLParagraphElement | null)[]>([]);
  const restored = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    openFileBytes(fileId)
      .then((bytes) => {
        if (cancelled) return;
        const text = normalise(new TextDecoder("utf-8").decode(bytes));
        const out: { text: string; start: number }[] = [];
        let cursor = 0;
        for (const chunk of text.split("\n\n")) {
          out.push({ text: chunk.replace(/\n/g, " "), start: cursor });
          cursor += chunk.length + 2;
        }
        setParagraphs(out);
        setTotal(Math.max(text.length, 1));
        if (initial?.resourceID === "text" && initial.position > 0) {
          const target = Math.max(0, out.findLastIndex((p) => p.start <= initial.position));
          setShown(Math.max(BATCH, target + 120));
        } else restored.current = true;
        setPhase("ready");
      })
      .catch(() => !cancelled && setPhase("error"));
    return () => {
      cancelled = true;
    };
  }, [fileId, initial]);

  useEffect(() => {
    document.title = `${title} · BookPal`;
  }, [title]);

  // After first render, move to the saved place.
  useEffect(() => {
    if (phase !== "ready" || restored.current) return;
    restored.current = true;
    const target = initial ? Math.max(0, paragraphs.findLastIndex((p) => p.start <= initial.position)) : 0;
    requestAnimationFrame(() => {
      const el = els.current[target];
      if (el) window.scrollTo({ top: el.offsetTop - 100 });
      settle();
    });
  }, [phase, paragraphs, initial, settle]);

  const topParagraph = useCallback(() => {
    const line = window.scrollY + 100;
    let lo = 0, hi = Math.min(shown, paragraphs.length) - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      const el = els.current[mid];
      if (el && el.offsetTop <= line) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }, [shown, paragraphs.length]);

  useEffect(() => {
    if (phase !== "ready") return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        onScrollY(window.scrollY);
        const i = topParagraph();
        const offset = paragraphs[i]?.start ?? 0;
        const fraction = Math.min(1, offset / total);
        setProgress(fraction);
        if (restored.current) schedule({ progress: fraction, resourceID: "text", position: offset, progression: fraction });
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [phase, paragraphs, total, topParagraph, onScrollY, schedule]);

  // Render more as the reader nears the end of what is on the page.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || shown >= paragraphs.length) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && setShown((n) => n + BATCH), { rootMargin: "1200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [shown, paragraphs.length]);

  const progressRef = useRef(0);
  progressRef.current = progress;

  const getLabel = useCallback(
    () => `${Math.round(((paragraphs[topParagraph()]?.start ?? 0) / total) * 20) * 5}% through`,
    [paragraphs, total, topParagraph],
  );
  const getTextSoFar = useCallback(async () => {
    const text = paragraphs.slice(0, topParagraph() + 1).map((p) => p.text).join("\n\n");
    return { text, label: getLabel() };
  }, [paragraphs, topParagraph, getLabel]);

  const bookConfig = useMemo<BookConfig>(() => ({
    info: { fileId, title, format: "Text", ...meta },
    getProgress: () => progressRef.current,
    getTextSoFar, getLabel, notes, saveCast, saveProfile,
  }), [fileId, title, meta, getTextSoFar, getLabel, notes, saveCast, saveProfile]);

  const ask = useMemo<AskConfig>(() => ({
    fileId, getTextSoFar, getLabel, savedSummaries: notes.summaries, saveSummary, savedWords: notes.words, saveWord, savedRecaps: notes.recaps, saveRecap, getProgress: () => progressRef.current,
    bookTitle: title,
    scope: { id: "section", label: "Around here" },
    getSelection: () => window.getSelection()?.toString().trim() ?? "",
    getContext: async () => {
      let text = "";
      for (let i = Math.max(0, topParagraph() - 4); i < paragraphs.length && text.length < 24_000; i++) text += `${paragraphs[i].text}\n\n`;
      return { excerpt: text.trim() };
    },
  }), [title, paragraphs, topParagraph, fileId, getTextSoFar, getLabel, notes.summaries, saveSummary, notes.words, saveWord, notes.recaps, saveRecap]);

  const search = useMemo<SearchConfig>(() => ({
    run: async (query, report, signal) => {
      const found: Hit[] = [];
      for (let i = 0; i < paragraphs.length && found.length < 300; i++) {
        if (signal.aborted) return;
        findIn(paragraphs[i].text, query, 3).forEach((m, k) => found.push({ group: "In the text", before: m.before, match: m.match, after: m.after, occurrence: k, at: i }));
        if (i % 400 === 0) {
          report([...found]);
          await new Promise((r) => setTimeout(r));
        }
      }
      report(found);
    },
    onSelect: (hit, query) => {
      setShown((n) => Math.max(n, hit.at + 80));
      setTimeout(() => {
        const el = els.current[hit.at];
        if (!el) return;
        paint(window, findRanges(el, query));
        window.scrollTo({ top: el.offsetTop - 140 });
      }, 80);
    },
    onClear: () => paint(window, []),
  }), [paragraphs]);

  const body = useMemo(
    () => paragraphs.slice(0, shown).map((p, i) => (
      <p key={i} ref={(el) => { els.current[i] = el; }}>{p.text}</p>
    )),
    [paragraphs, shown],
  );

  if (phase !== "ready") {
    return (
      <ReaderChrome title={title} progress={0} hidden={false} contents={null} prefs={prefs}>
        <div className={styles.center}>
          {phase === "loading" ? <p className={styles.loading}>Opening your book…</p> : (
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
    <ReaderChrome title={title} subtitle={`${Math.round(progress * 100)}%`} progress={progress} hidden={hidden} contents={null} prefs={prefs} ask={ask} search={search} book={bookConfig}>
      <main className={styles.page} onClick={() => !window.getSelection()?.toString() && setHidden((h) => !h)}>
        <article className={styles.text}>{body}</article>
        <div ref={sentinel} aria-hidden="true" />
      </main>
    </ReaderChrome>
  );
}
