"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./ContinueRow.module.css";

export type ContinueItem = { id: string; title: string; author?: string; progress: number; openedAt: string; tone: number; cover?: string };

function ago(iso: string, now: number): string {
  const days = Math.floor((now - new Date(iso).getTime()) / 864e5);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

// The books you're partway through, one tap from where you stopped.
export function ContinueRow({ items }: { items: ContinueItem[] }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);

  return (
    <section className={styles.row} aria-labelledby="continue-heading">
      <h2 id="continue-heading" className="section">Continue reading</h2>
      <ul>
        {items.map((b) => {
          const percent = Math.max(1, Math.round(b.progress * 100));
          return (
            <li key={b.id} className={styles.card}>
              <Link href={`/read/${b.id}`} className={styles.main} aria-label={`Continue ${b.title}, ${percent}% read`}>
                <span className={styles.cover} style={{ background: `var(--c${b.tone})` }}>
                  {b.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.cover} alt="" />
                  ) : <span>{b.title}</span>}
                </span>
                <span className={styles.body}>
                  <span className={styles.title}>{b.title}</span>
                  {b.author && <span className={styles.author}>{b.author}</span>}
                  <span className={styles.meter} aria-hidden="true"><span style={{ width: `${percent}%` }} /></span>
                  <span className="voice">{percent}% read{now ? ` · ${ago(b.openedAt, now)}` : ""}</span>
                </span>
              </Link>
              <Link href={`/read/${b.id}?catchup=1`} className={styles.catchup}>Catch me up</Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
