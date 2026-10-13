"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Dialog } from "./Dialog";
import { cleanSvg, pictureToCover, svgToJpeg, svgUri } from "@/lib/images";
import { readEvents } from "@/lib/sse";
import styles from "./BookEditor.module.css";

export type EditableBook = {
  id: string; title: string; author: string; description: string;
  coverVersion?: string | null; // set when a custom cover is stored
  embeddedCover?: Blob | null;  // the cover found inside the book, if any
};

type Slot = { style: string; svg: string; uri: string } | "loading" | "failed";
const STYLE_NAMES: Record<string, string> = { typographic: "Typographic", illustrated: "Illustrated", geometric: "Geometric", vintage: "Vintage" };
const ORDER = ["typographic", "illustrated", "geometric", "vintage"];
type Real = { id: number; title: string; author: string; year: number | null };
type Pending = { blob: Blob; url: string; source: string } | "remove" | null;

export function BookEditor({ book, open, onClose }: { book: EditableBook; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author);
  const [description, setDescription] = useState(book.description);
  const [pending, setPending] = useState<Pending>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [designing, setDesigning] = useState(false);
  const [real, setReal] = useState<Real[] | "loading" | null>(null);
  const [chosenReal, setChosenReal] = useState<number | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [ai, setAi] = useState<"unknown" | "ready" | "off">("unknown");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const embeddedUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(book.title); setAuthor(book.author); setDescription(book.description);
    setPending(null); setSlots([]); setChosen(null); setReal(null); setChosenReal(null); setMessage("");
    void fetch("/api/ai/status", { cache: "no-store" }).then((r) => r.json()).then((s) => setAi(s.connected ? "ready" : "off")).catch(() => setAi("off"));
    if (book.embeddedCover) embeddedUrl.current = URL.createObjectURL(book.embeddedCover);
    return () => {
      abort.current?.abort();
      if (embeddedUrl.current) URL.revokeObjectURL(embeddedUrl.current);
      embeddedUrl.current = null;
    };
  }, [open, book]);

  const preview =
    pending === "remove" ? embeddedUrl.current
    : pending ? pending.url
    : book.coverVersion ? `/api/files/${book.id}/cover?v=${encodeURIComponent(book.coverVersion)}`
    : embeddedUrl.current;

  const choose = async (blob: Blob, source: string) => {
    if (pending && pending !== "remove") URL.revokeObjectURL(pending.url);
    setPending({ blob, url: URL.createObjectURL(blob), source });
  };

  const upload = async (picked: File | undefined) => {
    if (!picked) return;
    setMessage("");
    try {
      setChosen(null);
      await choose(await pictureToCover(picked), "upload");
    } catch {
      setMessage("That file couldn’t be used as a cover. Try a JPEG or PNG.");
    }
  };

  const suggest = async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setMessage("");
    setDesigning(true);
    setChosen(null);
    setSlots(["loading", "loading", "loading", "loading"]);
    try {
      const response = await fetch("/api/ai/covers", {
        method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ title: title.trim() || book.title, author: author.trim() || undefined, description: description.trim() || undefined }),
      });
      if (!response.ok || !response.body) {
        setSlots([]);
        setMessage((await response.json().catch(() => null))?.error?.message ?? "Cover ideas couldn’t be started.");
        return;
      }
      await readEvents(response, (event, data) => {
        if (event === "cover") {
          const svg = cleanSvg(String(data.svg));
          setSlots((all) => all.map((s, i) => (i === data.index ? { style: String(data.style), svg, uri: svgUri(svg) } : s)));
        } else if (event === "cover_failed") {
          setSlots((all) => all.map((s, i) => (i === data.index ? "failed" : s)));
          if (data.message) setMessage(String(data.message));
        } else if (event === "error") setMessage(String(data.message));
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setMessage("The connection dropped. Please try again.");
    } finally {
      setDesigning(false);
    }
  };

  // Real covers from Open Library, found by title and author.
  const findReal = async () => {
    setMessage("");
    setReal("loading");
    try {
      const query = new URLSearchParams({ title: title.trim() || book.title, ...(author.trim() ? { author: author.trim() } : {}) });
      const response = await fetch(`/api/covers/search?${query}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error?.message ?? "Covers couldn’t be searched.");
      setReal(data.covers);
    } catch (e) {
      setReal(null);
      setMessage(e instanceof Error ? e.message : "Covers couldn’t be searched.");
    }
  };

  const pickReal = async (id: number) => {
    setChosenReal(id);
    setChosen(null);
    try {
      const response = await fetch(`/api/covers/image?id=${id}&size=L`);
      if (!response.ok) throw new Error();
      await choose(await pictureToCover(new File([await response.blob()], "cover.jpg", { type: "image/jpeg" })), "openlibrary");
    } catch {
      setChosenReal(null);
      setMessage("That cover couldn’t be loaded. Try another.");
    }
  };

  const pickSuggestion = async (index: number) => {
    setChosenReal(null);
    const slot = slots[index];
    if (typeof slot === "string") return;
    setChosen(index);
    try {
      await choose(await svgToJpeg(slot.svg, 600, 900), "ai");
    } catch {
      setMessage("That design couldn’t be prepared. Try another.");
    }
  };

  const draft = async () => {
    setDrafting(true);
    setMessage("");
    const r = await fetch("/api/ai/describe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: title.trim() || book.title, author: author.trim() || undefined }) });
    const data = await r.json().catch(() => null);
    setDrafting(false);
    if (r.ok) setDescription(data.description);
    else setMessage(data?.error?.message ?? "A description couldn’t be drafted.");
  };

  const dirty = title !== book.title || author !== book.author || description !== book.description || pending !== null;

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const details = await fetch(`/api/files/${book.id}/details`, {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim(), author: author.trim(), description: description.trim() }),
      });
      if (!details.ok) throw new Error((await details.json().catch(() => null))?.error?.message ?? "The details couldn’t be saved.");
      if (pending === "remove") await fetch(`/api/files/${book.id}/cover`, { method: "DELETE" });
      else if (pending) {
        const r = await fetch(`/api/files/${book.id}/cover`, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: pending.blob });
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error?.message ?? "The cover couldn’t be saved.");
      }
      onClose();
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} title="Edit book" onClose={onClose} wide>
      <div className={styles.layout}>
        <div className={styles.left}>
          <div className={styles.cover}>
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={preview} src={preview} alt="Cover preview" />
            ) : (
              <div className={styles.placeholder}><span>{title || book.title}</span></div>
            )}
          </div>
          <div className={styles.coverActions}>
            <button type="button" onClick={() => file.current?.click()}>Upload image…</button>
            <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
            {book.embeddedCover && (
              <button type="button" onClick={() => { setChosen(null); setChosenReal(null); void choose(book.embeddedCover!, "book"); }}>Use the book’s own cover</button>
            )}
            {(book.coverVersion || (pending && pending !== "remove")) && (
              <button type="button" className={styles.quiet} onClick={() => { setChosen(null); setPending(book.coverVersion ? "remove" : null); }}>Remove custom cover</button>
            )}
          </div>
        </div>

        <div className={styles.right}>
          <div className={styles.field}>
            <label htmlFor="edit-title">Title</label>
            <input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} />
          </div>
          <div className={styles.field}>
            <label htmlFor="edit-author">Author</label>
            <input id="edit-author" value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={300} placeholder="Who wrote it?" />
          </div>
          <div className={styles.field}>
            <div className={styles.row}>
              <label htmlFor="edit-description">Description</label>
              {ai === "ready" && <button type="button" className={styles.link} onClick={() => void draft()} disabled={drafting}>{drafting ? "Drafting…" : "Draft with AI"}</button>}
            </div>
            <textarea id="edit-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={4000} placeholder="A sentence or two about the book" />
            <span className={styles.count}>{description.length} / 4000</span>
          </div>

          <div className={styles.suggest}>
            <div className={styles.row}>
              <span className={styles.heading}>Real covers</span>
              <button type="button" onClick={() => void findReal()} disabled={real === "loading"}>{real === "loading" ? "Searching…" : real ? "Search again" : "Find real covers"}</button>
            </div>
            {real === "loading" ? (
              <ul className={styles.slots}>{[0, 1, 2, 3].map((i) => <li key={i}><div className={`${styles.slot} ${styles.shimmer}`} aria-label="Searching"><span>Searching…</span></div></li>)}</ul>
            ) : real && real.length > 0 ? (
              <ul className={styles.slots}>
                {real.slice(0, 8).map((c) => (
                  <li key={c.id}>
                    <button type="button" className={`${styles.slot} ${chosenReal === c.id ? styles.on : ""}`} aria-pressed={chosenReal === c.id} onClick={() => void pickReal(c.id)}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/covers/image?id=${c.id}&size=M`} alt={`${c.title}${c.author ? ` by ${c.author}` : ""}${c.year ? `, ${c.year}` : ""}`} loading="lazy" onError={() => setReal((all) => (Array.isArray(all) ? all.filter((x) => x.id !== c.id) : all))} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : real ? (
              <p className={styles.hint}>No covers turned up for that title and author. Try fixing the spelling above.</p>
            ) : (
              <p className={styles.hint}>Cover art for published editions, from Open Library.</p>
            )}
          </div>

          <div className={styles.suggest}>
            <div className={styles.row}>
              <span className={styles.heading}>Cover ideas</span>
              {ai === "ready" ? (
                <button type="button" onClick={() => void suggest()} disabled={designing}>{slots.length ? (designing ? "Designing…" : "Design again") : "Suggest covers"}</button>
              ) : ai === "off" ? (
                <Link href="/ai-settings" className={styles.link}>Connect ChatGPT for cover ideas</Link>
              ) : null}
            </div>
            {slots.length > 0 ? (
              <ul className={styles.slots}>
                {slots.map((slot, i) => (
                  <li key={i}>
                    {slot === "loading" ? (
                      <div className={`${styles.slot} ${styles.shimmer}`} aria-label="Designing a cover"><span>Designing…</span></div>
                    ) : slot === "failed" ? (
                      <div className={`${styles.slot} ${styles.failed}`}><span>Couldn’t draw this one</span></div>
                    ) : (
                      <button type="button" className={`${styles.slot} ${chosen === i ? styles.on : ""}`} aria-pressed={chosen === i} onClick={() => void pickSuggestion(i)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={slot.uri} alt={`${STYLE_NAMES[slot.style] ?? "Cover"} cover idea`} />
                        <span className={styles.styleName}>{STYLE_NAMES[slot.style] ?? slot.style}</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.hint}>{ai === "ready" ? "Four designs from your title and author, drawn in different styles." : "Or upload your own image on the left."}</p>
            )}
          </div>
        </div>
      </div>
      {message && <p className={styles.error} role="alert">{message}</p>}
      <div className={styles.actions}>
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="button" className={styles.primary} onClick={() => void save()} disabled={saving || !dirty || !title.trim()}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </Dialog>
  );
}
export { ORDER };
