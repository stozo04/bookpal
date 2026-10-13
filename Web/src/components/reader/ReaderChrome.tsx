"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SIZE_MAX, SIZE_MIN, SIZE_STEP, THEMES, themeVars, type ThemeName } from "./themes";
import type { ReaderPrefs } from "./useReaderPrefs";
import { AskPanel, type AskConfig } from "./AskPanel";
import { SearchPanel, type SearchConfig } from "./SearchPanel";
import { BookPanel, type BookConfig } from "./BookPanel";
import styles from "./ReaderChrome.module.css";

export type ContentsItem = { label: string; depth: number; current?: boolean; onSelect: () => void };
type Panel = "contents" | "appearance" | "ask" | "search" | "book" | null;

type Props = {
  title: string;
  subtitle?: string;
  progress: number;
  hidden: boolean;
  contents?: ContentsItem[] | null;
  prefs: ReaderPrefs;
  sizeLabel?: string;
  showTypeface?: boolean;
  ask?: AskConfig;
  search?: SearchConfig;
  book?: BookConfig;
  children: React.ReactNode;
};

// The quiet frame shared by every reader: top bar, progress line, appearance
// popover and contents drawer. The reader itself is the child.
export function ReaderChrome({ title, subtitle, progress, hidden, contents, prefs, sizeLabel = "Size", showTypeface = true, ask, search, book, children }: Props) {
  const wantsCatchup = useSearchParams().get("catchup") === "1";
  const [panel, setPanel] = useState<Panel>(null);
  const [recapOnOpen, setRecapOnOpen] = useState(false);
  // Arriving from "Catch me up" on the library: open Ask with a recap once the book is ready.
  const catchupHandled = useRef(false);
  const hasAsk = Boolean(ask);
  useEffect(() => {
    if (wantsCatchup && hasAsk && !catchupHandled.current) {
      catchupHandled.current = true;
      setPanel("ask");
      setRecapOnOpen(true);
    }
  }, [wantsCatchup, hasAsk]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPanel(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panel]);

  const vars = themeVars(prefs.theme, prefs.size, prefs.face) as React.CSSProperties;
  const zoom = sizeLabel === "Zoom";
  const labels = zoom
    ? { down: "Zoom out", up: "Zoom in", downText: "−", upText: "+" }
    : { down: "Smaller text", up: "Larger text", downText: "A−", upText: "A+" };

  return (
    <div className={styles.root} style={vars}>
      <header className={`${styles.bar} ${hidden && !panel ? styles.hidden : ""}`}>
        <div className={styles.barInner}>
          <Link href="/library" className={styles.icon} aria-label="Back to library">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </Link>
          <div className={styles.titles}>
            <div className={styles.book}>{title}</div>
            <div className={styles.chapter}>{subtitle ?? ""}</div>
          </div>
          <div className={styles.tools}>
            {book && (
              <button type="button" className={styles.icon} aria-label="Book" aria-expanded={panel === "book"} onClick={() => setPanel(panel === "book" ? null : "book")}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H18v14H6.5A1.5 1.5 0 0 0 5 19.5z" /><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H18v-3" /><path d="M9 8h5" /></svg>
              </button>
            )}
            {search && (
              <button type="button" className={styles.icon} aria-label="Search" aria-expanded={panel === "search"} onClick={() => setPanel(panel === "search" ? null : "search")}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
              </button>
            )}
            {ask && (
              <button type="button" className={styles.icon} aria-label="Ask" aria-expanded={panel === "ask"} onClick={() => setPanel(panel === "ask" ? null : "ask")}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" /><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></svg>
              </button>
            )}
            {contents && contents.length > 0 && (
              <button type="button" className={styles.icon} aria-label="Contents" aria-expanded={panel === "contents"} onClick={() => setPanel(panel === "contents" ? null : "contents")}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h9" /></svg>
              </button>
            )}
            <button type="button" className={styles.icon} aria-label="Appearance" aria-expanded={panel === "appearance"} onClick={() => setPanel(panel === "appearance" ? null : "appearance")}>
              <span className={styles.aa}>Aa</span>
            </button>
          </div>
        </div>
        <div className={styles.progress} role="progressbar" aria-label="Reading progress" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${Math.min(1, Math.max(0, progress)) * 100}%` }} />
        </div>

        {panel === "appearance" && (
          <>
            <div className={styles.scrim} onClick={() => setPanel(null)} />
            <div className={styles.popover} role="dialog" aria-label="Appearance">
              <div className={styles.row}>
                <span className="voice">Theme</span>
                <div className={styles.swatches}>
                  {(Object.keys(THEMES) as ThemeName[]).map((name) => (
                    <button key={name} type="button" aria-label={THEMES[name].label} aria-pressed={prefs.theme === name}
                      className={styles.swatch} style={{ background: THEMES[name].bg, color: THEMES[name].ink }} onClick={() => prefs.setTheme(name)}>A</button>
                  ))}
                </div>
              </div>
              <div className={styles.row}>
                <span className="voice">{sizeLabel}</span>
                <div className={styles.stepper}>
                  <button type="button" aria-label={labels.down} disabled={prefs.size <= SIZE_MIN} onClick={() => prefs.setSize(Math.max(SIZE_MIN, prefs.size - SIZE_STEP))}>{labels.downText}</button>
                  <span className="voice">{prefs.size}%</span>
                  <button type="button" aria-label={labels.up} disabled={prefs.size >= SIZE_MAX} onClick={() => prefs.setSize(Math.min(SIZE_MAX, prefs.size + SIZE_STEP))}>{labels.upText}</button>
                </div>
              </div>
              {showTypeface && (
                <div className={styles.row}>
                  <span className="voice">Typeface</span>
                  <div className={styles.segment}>
                    <button type="button" aria-pressed={prefs.face === "serif"} onClick={() => prefs.setFace("serif")} style={{ fontFamily: "Georgia, serif" }}>Serif</button>
                    <button type="button" aria-pressed={prefs.face === "sans"} onClick={() => prefs.setFace("sans")}>Sans</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </header>

      {panel === "contents" && contents && (
        <>
          <div className={styles.scrim} onClick={() => setPanel(null)} />
          <nav className={styles.sheet} aria-label="Contents">
            <h2>Contents</h2>
            <ul>
              {contents.map((item, i) => (
                <li key={i} style={{ paddingLeft: item.depth * 16 }}>
                  <button type="button" aria-current={item.current ? "true" : undefined} onClick={() => { setPanel(null); item.onSelect(); }}>
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </>
      )}

      {panel === "book" && book && <BookPanel book={book} onClose={() => setPanel(null)} />}
      {panel === "search" && search && <SearchPanel search={search} initialQuery={searchQuery} onQueryChange={setSearchQuery} onClose={() => setPanel(null)} />}
      {panel === "ask" && ask && <AskPanel ask={ask} startWith={recapOnOpen ? "catchup" : undefined} onClose={() => { setRecapOnOpen(false); setPanel(null); }} />}

      {children}
    </div>
  );
}
