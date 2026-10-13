"use client";
import { useEffect, useRef, useState } from "react";
import type { Hit } from "@/lib/textsearch";
import styles from "./SearchPanel.module.css";

export type SearchConfig = {
  /** Reports hits as they are found; stop when the signal aborts. */
  run: (query: string, report: (hits: Hit[]) => void, signal: AbortSignal) => Promise<void>;
  onSelect: (hit: Hit, query: string) => void;
  onClear: () => void;
};

const MAX = 300;

export function SearchPanel({ search, initialQuery, onQueryChange, onClose }: {
  search: SearchConfig; initialQuery: string; onQueryChange: (q: string) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [ran, setRan] = useState("");
  const [active, setActive] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Search shortly after typing stops.
  useEffect(() => {
    const q = query.trim();
    setActive(null);
    if (q.length < 2) {
      setHits([]);
      setBusy(false);
      setRan("");
      search.onClear();
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true);
      setHits([]);
      setRan(q);
      try {
        await search.run(q, (found) => setHits(found.slice(0, MAX)), controller.signal);
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, search]);

  let lastGroup = "";
  return (
    <>
      <div className={styles.scrim} onClick={onClose} />
      <section className={styles.sheet} aria-label="Book search">
        <h2>Search</h2>
        <div className={styles.box}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
          <input ref={input} type="search" value={query} onChange={(e) => { setQuery(e.target.value); onQueryChange(e.target.value); }} placeholder="Search in this book" aria-label="Search in this book" />
        </div>
        <p className={styles.status} aria-live="polite">
          {ran === "" ? "Type at least two letters." : busy ? `Searching… ${hits.length} found` : hits.length === 0 ? `Nothing found for “${ran}”.` : `${hits.length >= MAX ? `First ${MAX}` : hits.length} ${hits.length === 1 ? "result" : "results"}`}
        </p>
        <ul className={styles.list}>
          {hits.map((h, i) => {
            const heading = h.group !== lastGroup ? h.group : null;
            lastGroup = h.group;
            return (
              <li key={i}>
                {heading && <div className={styles.group}>{heading}</div>}
                <button type="button" aria-current={active === i ? "true" : undefined} onClick={() => { setActive(i); search.onSelect(h, ran); onClose(); }}>
                  …{h.before} <mark>{h.match}</mark>{h.after}…
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
