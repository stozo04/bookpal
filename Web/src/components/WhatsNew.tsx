"use client";
import { useEffect, useId, useRef, useState } from "react";
import { RELEASES, displayDate, type ChangeKind } from "@/lib/releaseNotes";
import styles from "./WhatsNew.module.css";

const KIND_CLASS: Record<ChangeKind, string> = {
  New: styles.new,
  Improved: styles.improved,
  Fixed: styles.fixed,
  Removed: styles.removed,
};
const HOVER_CLOSE_DELAY_MS = 200;

// The footer's version label. Pointing at it previews the release history;
// clicking pins it open until Escape, a click elsewhere, or a second click.
export function WhatsNew({ version }: { version: string }) {
  const [pinned, setPinned] = useState(false);
  const [hovering, setHovering] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const panelId = useId();
  const open = pinned || hovering;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (setPinned(false), setHovering(false));
    const onPointer = (e: PointerEvent) => !root.current?.contains(e.target as Node) && (setPinned(false), setHovering(false));
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const onPointerEnter = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    clearTimeout(closeTimer.current);
    setHovering(true);
  };
  const onPointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    closeTimer.current = setTimeout(() => setHovering(false), HOVER_CLOSE_DELAY_MS);
  };

  return (
    <div ref={root} className={styles.root} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
      <button
        type="button"
        className={styles.version}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Version ${version}. What’s New`}
        onClick={() => { setPinned(!pinned); setHovering(false); }}
      >
        v{version}
      </button>
      {open && (
        <section id={panelId} className={styles.panel} role="dialog" aria-label="What’s New">
          <h2 className={styles.title}>What’s New</h2>
          <div className={styles.list}>
            {RELEASES.map((release) => (
              <article key={release.version} className={styles.release}>
                <header className={styles.head}>
                  <h3>Version {release.version}</h3>
                  {release.version === version && <span className={styles.current}>Current</span>}
                  <time className={styles.date} dateTime={release.date}>{displayDate(release.date)}</time>
                </header>
                <ul>
                  {release.changes.map((change, i) => (
                    <li key={i}>
                      <span className={`${styles.kind} ${KIND_CLASS[change.kind]}`}>{change.kind}</span>
                      <span>{change.text}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
