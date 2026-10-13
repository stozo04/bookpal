"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookEditor } from "../BookEditor";
import { readMeta } from "@/lib/covers";
import { GRAPH_H, GRAPH_W, initials, layout, type Character } from "@/lib/castgraph";
import { gatherMentions, nameVariants } from "@/lib/mentions";
import { atThisPlace, type Profile, type ReaderNotes } from "@/lib/notes";
import { useRouter } from "next/navigation";
import { readEvents } from "@/lib/sse";
import styles from "./BookPanel.module.css";

// What the server knows about the book beyond the file itself.
export type ReaderMeta = {
  userId: string; sha256: string | null; author: string; description: string; coverVersion: string | null;
  /** True while the stored title is still just the filename (so the book's own title may be shown). */
  titleIsFilename: boolean;
};
export type BookInfo = { fileId: string; title: string; format: string } & ReaderMeta;
export type BookConfig = {
  info: BookInfo;
  getProgress: () => number;
  getTextSoFar: (progress?: (message: string) => void) => Promise<{ text: string; label: string }>;
  /** A cheap name for the reader's place; no text is read to get it. */
  getLabel: () => string;
  notes: ReaderNotes;
  saveCast: (label: string, progress: number, characters: Character[]) => void;
  saveProfile: (name: string, label: string, progress: number, profile: Profile) => void;
};

export function BookPanel({ book, onClose }: { book: BookConfig; onClose: () => void }) {
  const { info } = book;
  const [tab, setTab] = useState<"about" | "cast">("about");
  const [editing, setEditing] = useState(false);
  const [embedded, setEmbedded] = useState<Blob | null>(null);
  const [embeddedUrl, setEmbeddedUrl] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !editing && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, editing]);

  useEffect(() => {
    if (!info.sha256) return;
    let url: string | null = null;
    void readMeta(info.userId, info.sha256).then((m) => {
      if (!m?.cover) return;
      setEmbedded(m.cover);
      url = URL.createObjectURL(m.cover);
      setEmbeddedUrl(url);
    });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [info.userId, info.sha256]);

  const cover = info.coverVersion ? `/api/files/${info.fileId}/cover?v=${encodeURIComponent(info.coverVersion)}` : embeddedUrl;

  return (
    <>
      <div className={styles.scrim} onClick={onClose} />
      <aside className={styles.panel} role="dialog" aria-label="About this book">
        <header className={styles.head}>
          <div className={styles.tabs} role="tablist" aria-label="Book">
            <button type="button" role="tab" aria-selected={tab === "about"} onClick={() => setTab("about")}>About</button>
            <button type="button" role="tab" aria-selected={tab === "cast"} onClick={() => setTab("cast")}>Characters</button>
          </div>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>

        {tab === "about" ? (
          <div className={styles.body}>
            <div className={styles.about}>
              <div className={styles.cover}>
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt="" />
                ) : (
                  <span>{info.title}</span>
                )}
              </div>
              <div>
                <h2 className={styles.title}>{info.title}</h2>
                {info.author && <div className={styles.author}>{info.author}</div>}
                <div className={styles.facts}>
                  <span>{info.format}</span>
                  <span>{Math.round(book.getProgress() * 100)}% read</span>
                </div>
              </div>
            </div>
            {info.description ? <p className={styles.blurb}>{info.description}</p> : <DescribeOnce info={info} />}
            <button type="button" onClick={() => setEditing(true)}>Edit details…</button>
            <BookEditor
              open={editing} onClose={() => setEditing(false)}
              book={{ id: info.fileId, title: info.title, author: info.author, description: info.description, coverVersion: info.coverVersion, embeddedCover: embedded }}
            />
          </div>
        ) : (
          <CastView book={book} />
        )}
      </aside>
    </>
  );
}

// A description is written once, saved to the book, and never asked for again.
function DescribeOnce({ info }: { info: BookInfo }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const draft = async () => {
    setBusy(true);
    setError("");
    const r = await fetch("/api/ai/describe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: info.title, author: info.author || undefined }) });
    const data = await r.json().catch(() => null);
    if (!r.ok) { setError(data?.error?.message ?? "A description couldn’t be drafted."); setBusy(false); return; }
    const saved = await fetch(`/api/files/${info.fileId}/details`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ description: data.description }) });
    setBusy(false);
    if (saved.ok) router.refresh();
    else setError("The description couldn’t be saved.");
  };
  return (
    <div className={styles.blurb}>
      <p><em>No description yet.</em></p>
      <button type="button" onClick={() => void draft()} disabled={busy}>{busy ? "Writing…" : "Write one for me"}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

function CastView({ book }: { book: BookConfig }) {
  const { info } = book;
  const cast = book.notes.cast;
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [profileOf, setProfileOf] = useState<string | null>(null);
  const [off, setOff] = useState<null | "connect" | "local">(null);
  useEffect(() => {
    void fetch("/api/ai/status", { cache: "no-store" }).then((r) => r.json()).then((s) => setOff(!s.available ? "local" : !s.connected ? "connect" : null)).catch(() => {});
  }, []);

  const map = async () => {
    setBusy(true);
    setError("");
    setSelected(null);
    try {
      setStatus("Gathering what you’ve read…");
      const startedAt = book.getProgress();
      const { text, label } = await book.getTextSoFar((m) => setStatus(m));
      if (text.length < 400) { setError("There isn’t enough of the story behind you yet to find the characters."); return; }
      const response = await fetch("/api/ai/characters", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookTitle: info.title, label, text }),
      });
      if (!response.ok || !response.body) { setError((await response.json().catch(() => null))?.error?.message ?? "The characters couldn’t be mapped."); return; }
      await readEvents(response, (event, data) => {
        if (event === "progress") setStatus(String(data.message));
        else if (event === "result") book.saveCast(label, startedAt, (data as { characters: Character[] }).characters);
        else if (event === "error") setError(String(data.message));
      });
    } catch {
      setError("The connection dropped. Please try again.");
    } finally {
      setBusy(false);
      setStatus("");
    }
  };

  const graph = useMemo(() => (cast ? layout(cast.characters) : null), [cast]);
  const chosen = cast?.characters.find((c) => c.name === selected) ?? null;
  // Labels on the lines only when there are few enough to read; the card lists them all.
  const quiet = chosen ? (graph?.edges.filter((e) => e.a === chosen.name || e.b === chosen.name).length ?? 0) <= 4 : true;
  const related = useMemo(() => {
    if (!chosen) return new Set<string>();
    const s = new Set<string>([chosen.name]);
    for (const c of cast!.characters) {
      if (c.name === chosen.name) c.relations.forEach((r) => s.add(r.with));
      else if (c.relations.some((r) => r.with === chosen.name)) s.add(c.name);
    }
    return s;
  }, [cast, chosen]);

  if (cast && profileOf) {
    const who = cast.characters.find((c) => c.name === profileOf);
    if (who) return <ProfileView book={book} character={who} cast={cast.characters} onBack={() => setProfileOf(null)} onOpen={(n) => { setProfileOf(null); setSelected(n); }} />;
  }

  if (!cast) {
    return (
      <div className={styles.body}>
        <h2 className={styles.heading}>Who’s who</h2>
        <p className={styles.lead}>A cast list and how everyone connects, drawn only from what you’ve read so far, so nothing is spoiled.</p>
        {off === "connect" ? (
          <Link href="/ai-settings" className="button">Connect ChatGPT</Link>
        ) : off === "local" ? (
          <p className={styles.note}>This needs BookPal to run on your own computer.</p>
        ) : (
          <button type="button" className={styles.primary} onClick={() => void map()} disabled={busy}>{busy ? "Working…" : "Map the characters"}</button>
        )}
        {busy && <p className={styles.status} role="status">{status}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <p className={styles.fine}>Made once and saved to your library. Uses a little of your ChatGPT plan.</p>
      </div>
    );
  }

  const stale = !atThisPlace(cast.progress, book.getProgress());
  return (
    <div className={styles.body}>
      <div className={styles.castHead}>
        <div>
          <h2 className={styles.heading}>Who’s who</h2>
          <div className={styles.asOf}>Saved · as of {cast.label}{stale ? " · you’ve read further" : ""}</div>
        </div>
        {stale && <button type="button" onClick={() => void map()} disabled={busy}>{busy ? "Updating…" : "Update"}</button>}
      </div>
      {busy && <p className={styles.status} role="status">{status}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {graph && cast.characters.length > 1 && (
        <svg className={styles.web} viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`} role="group" aria-label={`Relationship web of ${cast.characters.length} characters`}>
          {graph.edges.map((e) => {
            const a = graph.nodes.find((n) => n.name === e.a)!, b = graph.nodes.find((n) => n.name === e.b)!;
            const active = chosen && (e.a === chosen.name || e.b === chosen.name);
            // Label nearer the other person's end, so a busy hub's labels don't pile up in the middle.
            const [from, to] = chosen && e.b === chosen.name ? [b, a] : [a, b];
            const mx = from.x + (to.x - from.x) * 0.64, my = from.y + (to.y - from.y) * 0.64;
            return (
              <g key={`${e.a}|${e.b}`} className={`${styles.edge} ${active ? styles.live : chosen ? styles.dim : ""}`}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                <title>{`${e.a} and ${e.b}: ${e.label}`}</title>
                {active && quiet && <text x={mx} y={my - 3} textAnchor="middle">{e.label.length > 18 ? `${e.label.slice(0, 17)}…` : e.label}</text>}
              </g>
            );
          })}
          {graph.nodes.map((n) => {
            const c = cast.characters.find((x) => x.name === n.name)!;
            const r = 14 + Math.min(n.degree, 5) * 1.6;
            const faded = chosen && !related.has(n.name);
            return (
              <g key={n.name} className={`${styles.node} ${selected === n.name ? styles.picked : ""} ${faded ? styles.dim : ""}`} transform={`translate(${n.x} ${n.y})`}
                role="button" tabIndex={0} aria-label={`${n.name}, ${c.role || "character"}`} aria-pressed={selected === n.name}
                onClick={() => setSelected(selected === n.name ? null : n.name)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSelected(selected === n.name ? null : n.name))}>
                <circle r={r} />
                <text className={styles.ini} textAnchor="middle" dy="0.35em">{initials(n.name)}</text>
                <text className={styles.label} textAnchor="middle" y={r + 11}>{n.name.split(" ")[0]}</text>
              </g>
            );
          })}
        </svg>
      )}

      {chosen && (
        <div className={styles.detail} aria-live="polite">
          <div className={styles.detailName}>{chosen.name}{chosen.role && <span> · {chosen.role}</span>}</div>
          {chosen.aliases.length > 0 && <div className={styles.aka}>Also called {chosen.aliases.join(", ")}</div>}
          <p>{chosen.description}</p>
          {chosen.relations.length > 0 && (
            <ul className={styles.rels}>
              {chosen.relations.map((r) => <li key={r.with}><span>{r.type}</span> <button type="button" onClick={() => setSelected(r.with)}>{r.with}</button></li>)}
            </ul>
          )}
          <button type="button" className={styles.more} onClick={() => setProfileOf(chosen.name)}>
            {book.notes.profiles[chosen.name] ? "Open full profile" : "Full profile"} <span aria-hidden="true">→</span>
          </button>
        </div>
      )}

      <ul className={styles.list}>
        {cast.characters.map((c) => (
          <li key={c.name}>
            <button type="button" aria-pressed={selected === c.name} onClick={() => setSelected(selected === c.name ? null : c.name)}>
              <span className={styles.badge} aria-hidden="true">{initials(c.name)}</span>
              <span className={styles.who}>
                <span className={styles.whoName}>{c.name}</span>
                <span className={styles.whoRole}>{c.role || c.description.slice(0, 60)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Everything the story has shown about one person, built once from every passage that
// mentions them and then saved.
function ProfileView({ book, character, cast, onBack, onOpen }: {
  book: BookConfig; character: Character; cast: Character[]; onBack: () => void; onOpen: (name: string) => void;
}) {
  const saved = book.notes.profiles[character.name];
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const build = async () => {
    setBusy(true);
    setError("");
    try {
      setStatus("Gathering what you’ve read…");
      const startedAt = book.getProgress();
      const { text, label } = await book.getTextSoFar((m) => setStatus(m));
      setStatus(`Finding every place ${character.name.split(" ")[0]} appears…`);
      const others = cast.filter((c) => c.name !== character.name).map((c) => c.name);
      const passages = gatherMentions(text, nameVariants(character.name, character.aliases, others));
      if (passages.length < 40) { setError(`${character.name} hasn’t appeared enough yet for a profile.`); return; }
      setStatus(`Writing about ${character.name.split(" ")[0]}…`);
      const r = await fetch("/api/ai/character", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookTitle: book.info.title, label, name: character.name, aliases: character.aliases, role: character.role, others, passages }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) { setError(data?.error?.message ?? "The profile couldn’t be put together."); return; }
      book.saveProfile(character.name, label, startedAt, data.profile as Profile);
    } catch {
      setError("The connection dropped. Please try again.");
    } finally {
      setBusy(false);
      setStatus("");
    }
  };

  // One tap on "Full profile" builds it; after that it is simply there.
  useEffect(() => {
    if (!saved && !started.current) {
      started.current = true;
      void build();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const p = saved?.profile;
  const stale = saved && !atThisPlace(saved.progress, book.getProgress());
  return (
    <div className={styles.body}>
      <button type="button" className={styles.back} onClick={onBack}><span aria-hidden="true">←</span> All characters</button>
      <div className={styles.profileHead}>
        <span className={styles.bigBadge} aria-hidden="true">{initials(character.name)}</span>
        <div>
          <h2 className={styles.profileName}>{character.name}</h2>
          {character.role && <div className={styles.aka}>{character.role}</div>}
          {character.aliases.length > 0 && <div className={styles.aka}>Also called {character.aliases.join(", ")}</div>}
        </div>
      </div>

      {!p ? (
        <div>
          {busy && <p className={styles.status} role="status">{status}</p>}
          {error && (
            <>
              <p className="error" role="alert">{error}</p>
              <button type="button" onClick={() => void build()} disabled={busy}>Try again</button>
            </>
          )}
          <p className={styles.fine}>Made once and saved to your library.</p>
        </div>
      ) : (
        <article className={styles.profile}>
          <div className={styles.asOf}>Saved · as of {saved.label}{stale ? " · you’ve read further" : ""}</div>
          <p className={styles.summary}>{p.summary}</p>
          {p.traits.length > 0 && <ul className={styles.traits} aria-label="Traits">{p.traits.map((t) => <li key={t}>{t}</li>)}</ul>}
          {p.wants && (<><h3>What they want</h3><p>{p.wants}</p></>)}
          {p.timeline.length > 0 && (
            <>
              <h3>So far</h3>
              <ol className={styles.timeline}>{p.timeline.map((t, i) => <li key={i}><span>{t.where}</span>{t.event}</li>)}</ol>
            </>
          )}
          {p.relationships.length > 0 && (
            <>
              <h3>Connections</h3>
              <ul className={styles.connections}>
                {p.relationships.map((r) => (
                  <li key={r.with}>
                    {cast.some((c) => c.name === r.with) ? <button type="button" onClick={() => onOpen(r.with)}>{r.with}</button> : <strong>{r.with}</strong>}
                    <span>{r.detail}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {p.quotes.length > 0 && (
            <>
              <h3>In the text</h3>
              {p.quotes.map((q, i) => <blockquote key={i}>“{q.text}”{q.where && <cite>{q.where}</cite>}</blockquote>)}
            </>
          )}
          {stale && <button type="button" onClick={() => void build()} disabled={busy}>{busy ? "Updating…" : "Update to where I am"}</button>}
          {busy && <p className={styles.status} role="status">{status}</p>}
          {error && <p className="error" role="alert">{error}</p>}
        </article>
      )}
    </div>
  );
}
