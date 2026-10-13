"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { cleanSvg, download, svgToPng, svgUri } from "@/lib/images";
import { readEvents } from "@/lib/sse";
import { findNear, findSummary, type ReaderNotes } from "@/lib/notes";
import { around, isLookup, wordKey, type Definition } from "@/lib/define";
import type { Recap } from "@/lib/recap";
import styles from "./AskPanel.module.css";

export type AskScope = { id: "selection" | "section" | "page"; label: string };
export type AskContext = { excerpt: string; sectionTitle?: string };
export type AskConfig = {
  fileId: string;
  bookTitle: string;
  /** The reader's own scope, besides the selection. */
  scope: AskScope;
  getSelection: () => string;
  getContext: (scope: AskScope["id"]) => Promise<AskContext>;
  /** Everything the reader has read so far, for spoiler-safe summaries. */
  getTextSoFar: (progress?: (message: string) => void) => Promise<{ text: string; label: string }>;
  /** A cheap name for the reader's place, used to find a saved summary without reading anything. */
  getLabel: () => string;
  getProgress: () => number;
  savedSummaries: ReaderNotes["summaries"];
  saveSummary: (label: string, progress: number, text: string) => void;
  savedWords: ReaderNotes["words"];
  saveWord: (word: string, def: Definition) => void;
  savedRecaps: ReaderNotes["recaps"];
  saveRecap: (label: string, progress: number, recap: Recap) => void;
};

type Message = {
  role: "user" | "assistant"; content: string; failed?: boolean;
  kind?: "summary" | "image" | "define" | "recap"; status?: string; label?: string; cached?: boolean; svg?: string; caption?: string; passage?: string; def?: Definition; recap?: Recap;
};
type Status = { available: boolean; connected: boolean; selection: { model: string; reasoning: string; name?: string } | null };
const LEVELS: Record<string, string> = { xhigh: "Extra high" };
const level = (s: string) => LEVELS[s] ?? s.charAt(0).toUpperCase() + s.slice(1);

const SUGGESTIONS = ["Explain this simply", "What are the hard words?", "Who is speaking here?"];

// Light, safe formatting: paragraphs, bullets, **bold**, *italic*, `code`. No raw HTML.
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g).map((part, i) =>
    part.startsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong>
    : part.startsWith("`") ? <code key={i}>{part.slice(1, -1)}</code>
    : part.startsWith("*") && part.length > 2 ? <em key={i}>{part.slice(1, -1)}</em>
    : part);
}

function Formatted({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
          return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*•]\s+/, ""))}</li>)}</ul>;
        }
        return <p key={i}>{inline(block)}</p>;
      })}
    </>
  );
}

export function AskPanel({ ask, onClose, startWith }: { ask: AskConfig; onClose: () => void; startWith?: "catchup" }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<AskScope["id"]>(ask.scope.id);
  const [captured, setCaptured] = useState("");
  const abort = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetch("/api/ai/status", { cache: "no-store" }).then((r) => r.json()).then(setStatus).catch(() => setStatus({ available: false, connected: false, selection: null }));
  }, []);

  // Remember the latest selection: focusing the question box can clear it from the page.
  useEffect(() => {
    const read = () => {
      const text = ask.getSelection();
      if (text) {
        setCaptured(text);
        setScope("selection");
      }
    };
    read();
    const timer = setInterval(read, 500);
    return () => clearInterval(timer);
  }, [ask]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const send = useCallback(async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    const effective = scope === "selection" && !captured ? ask.scope.id : scope;
    const next: Message[] = [...messages, { role: "user", content: question }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setDraft("");
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    const fail = (message: string) =>
      setMessages([...next, { role: "assistant", content: message, failed: true }]);
    try {
      const context = effective === "selection" ? { excerpt: captured } : await ask.getContext(effective);
      const response = await fetch("/api/ai/chat", {
        method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({
          bookTitle: ask.bookTitle, scope: effective, sectionTitle: (context as AskContext).sectionTitle, excerpt: context.excerpt.slice(0, 40_000),
          messages: next.filter((m) => m.content).slice(-12).map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!response.ok || !response.body) {
        fail((await response.json().catch(() => null))?.error?.message ?? "The answer couldn’t be started.");
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "", answer = "", finished = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut: number;
        while ((cut = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          const event = block.match(/^event: (.*)$/m)?.[1];
          const data = JSON.parse(block.match(/^data: (.*)$/m)?.[1] ?? "{}");
          if (event === "delta") {
            answer += data.text;
            setMessages([...next, { role: "assistant", content: answer }]);
          } else if (event === "error") {
            setMessages([...next, { role: "assistant", content: answer ? `${answer}\n\n${data.message}` : data.message, failed: true }]);
            finished = true;
          } else if (event === "done") finished = true;
        }
      }
      if (!finished) fail("The answer was interrupted.");
    } catch (e) {
      if ((e as Error).name !== "AbortError") fail("The connection dropped. Please try again.");
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }, [ask, busy, captured, messages, scope]);

  const patchLast = (fn: (m: Message) => Message) =>
    setMessages((prev) => prev.map((m, i) => (i === prev.length - 1 ? fn(m) : m)));

  // "The story so far", from everything before the reader's place. Saved per position.
  const summarize = async (force = false) => {
    if (busy) return;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setMessages((prev) => [...prev, { role: "user", content: "Summarize the story so far." }, { role: "assistant", content: "", kind: "summary", status: "Gathering what you’ve read…" }]);
    try {
      // Made once, then kept: a saved summary for this place needs no reading and no model.
      const startedAt = ask.getProgress();
      const saved = findSummary(ask.savedSummaries, startedAt);
      if (!force && saved) return void patchLast((m) => ({ ...m, content: saved.text, label: saved.label, cached: true, status: undefined }));
      const { text, label } = await ask.getTextSoFar((message) => patchLast((m) => ({ ...m, status: message })));
      patchLast((m) => ({ ...m, label, cached: false }));
      if (text.length < 200) return void patchLast((m) => ({ ...m, content: "There isn’t enough text before this point to summarize yet.", status: undefined }));
      const response = await fetch("/api/ai/summary", {
        method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ bookTitle: ask.bookTitle, label, text }),
      });
      if (!response.ok || !response.body) {
        const message = (await response.json().catch(() => null))?.error?.message ?? "The summary couldn’t be started.";
        return void patchLast((m) => ({ ...m, content: message, failed: true, status: undefined }));
      }
      let answer = "";
      await readEvents(response, (event, data) => {
        if (event === "progress") patchLast((m) => ({ ...m, status: String(data.message) }));
        else if (event === "delta") { answer += String(data.text); patchLast((m) => ({ ...m, content: answer, status: undefined })); }
        else if (event === "error") patchLast((m) => ({ ...m, content: answer ? `${answer}\n\n${data.message}` : String(data.message), failed: true, status: undefined }));
        else if (event === "done" && answer) ask.saveSummary(label, startedAt, answer);
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") patchLast((m) => ({ ...m, content: "The connection dropped. Please try again.", failed: true, status: undefined }));
      else patchLast((m) => ({ ...m, status: undefined, content: m.content || "Stopped." }));
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  // A drawing of the selected passage (a vector sketch; real image generation isn't available on a ChatGPT plan).
  const illustrate = async (passage = captured) => {
    if (!passage || busy) return;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    const short = passage.length > 90 ? `${passage.slice(0, 90)}…` : passage;
    setMessages((prev) => [...prev, { role: "user", content: `Illustrate: “${short}”` }, { role: "assistant", content: "", kind: "image", status: "Sketching…", passage }]);
    try {
      const r = await fetch("/api/ai/illustrate", {
        method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ bookTitle: ask.bookTitle, passage: passage.slice(0, 3000) }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) patchLast((m) => ({ ...m, content: data?.error?.message ?? "The illustration couldn’t be drawn.", failed: true, status: undefined }));
      else patchLast((m) => ({ ...m, svg: cleanSvg(data.svg), caption: data.caption, status: undefined }));
    } catch (e) {
      patchLast((m) => ({ ...m, content: (e as Error).name === "AbortError" ? "Stopped." : "The connection dropped. Please try again.", failed: true, status: undefined }));
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  // A short refresher for coming back to the book: where things stand, plus a few recall questions.
  const catchUp = async (force = false) => {
    if (busy) return;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setMessages((prev) => [...prev, { role: "user", content: "Catch me up." }, { role: "assistant", content: "", kind: "recap", status: "Looking back over what you read…" }]);
    const failed = (content: string) => patchLast((m) => ({ ...m, content, failed: true, status: undefined }));
    try {
      const startedAt = ask.getProgress();
      const saved = findNear(ask.savedRecaps, startedAt);
      if (!force && saved) return void patchLast((m) => ({ ...m, recap: saved.recap, label: saved.label, cached: true, status: undefined }));
      const { text, label } = await ask.getTextSoFar();
      if (text.length < 200) return void failed("There isn’t enough text before this point to catch up on yet.");
      patchLast((m) => ({ ...m, label, status: "Putting it together…" }));
      const response = await fetch("/api/ai/catchup", {
        method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ bookTitle: ask.bookTitle, label, recent: text.slice(-24_000), summary: findSummary(ask.savedSummaries, startedAt)?.text }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) return void failed(data?.error?.message ?? "A recap couldn’t be put together.");
      patchLast((m) => ({ ...m, recap: data.recap, label, cached: false, status: undefined }));
      ask.saveRecap(label, startedAt, data.recap);
    } catch (e) {
      failed((e as Error).name === "AbortError" ? "Stopped." : "The connection dropped. Please try again.");
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  // The meaning of a selected word, in general and in this passage. Saved, so each word is looked up once.
  const define = async (selection = captured) => {
    const word = selection.trim();
    if (!word || busy) return;
    setBusy(true);
    setMessages((prev) => [...prev, { role: "user", content: `Define “${word}”` }, { role: "assistant", content: "", kind: "define", status: "Looking it up…" }]);
    const failed = (content: string) => patchLast((m) => ({ ...m, content, failed: true, status: undefined }));
    try {
      const saved = ask.savedWords[wordKey(word)];
      if (saved) return void patchLast((m) => ({ ...m, def: saved, cached: true, status: undefined }));
      const context = around((await ask.getContext(ask.scope.id)).excerpt, word);
      const response = await fetch("/api/ai/define", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookTitle: ask.bookTitle, word, context: context || undefined }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) return void failed(data?.error?.message ?? "That word couldn’t be defined.");
      patchLast((m) => ({ ...m, def: data.definition, status: undefined }));
      ask.saveWord(word, data.definition);
    } catch {
      failed("The connection dropped. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // Arriving from "Catch me up" on the library starts the recap straight away.
  const started = useRef(false);
  const ready0 = Boolean(status?.available && status.connected && status.selection);
  useEffect(() => {
    if (startWith === "catchup" && ready0 && !started.current) {
      started.current = true;
      void catchUp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startWith, ready0]);

  const stop = () => abort.current?.abort();
  const ready = status?.available && status.connected && status.selection;
  const scopes: AskScope[] = [{ id: "selection", label: "Selection" }, ask.scope];

  return (
    <>
      <div className={styles.scrim} onClick={onClose} />
      <aside className={styles.panel} role="dialog" aria-label="Ask about this book">
        <header className={styles.head}>
          <div>
            <h2>Ask</h2>
            {status?.selection && <div className={styles.model}>{status.selection.name ?? status.selection.model} · {level(status.selection.reasoning)}</div>}
          </div>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>

        {!status ? (
          <p className={styles.note}>Loading…</p>
        ) : !ready ? (
          <div className={styles.note}>
            <p>{status.available ? "Connect your ChatGPT plan to ask questions while you read." : "Asking questions needs BookPal to run on your own computer."}</p>
            {status.available && <Link href="/ai-settings" className="button">AI settings</Link>}
          </div>
        ) : (
          <>
            <div ref={log} className={styles.log} aria-live="polite">
              {messages.length === 0 && (
                <div className={styles.empty}>
                  <p>Ask about a word, a passage, or anything you’ve just read.</p>
                  <div className={styles.chips}>
                    {SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => void send(s)}>{s}</button>)}
                  </div>
                </div>
              )}
              {messages.map((m, i) =>
                m.kind === "image" && !m.failed ? (
                  <figure key={i} className={styles.figure}>
                    {m.svg ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={svgUri(m.svg)} alt={m.caption || "Illustration of the selected passage"} />
                        {m.caption && <figcaption>{m.caption}</figcaption>}
                        <div className={styles.figureActions}>
                          <button type="button" onClick={() => void svgToPng(m.svg!, 800, 600).then((b) => download(b, "illustration.png"))}>Save image</button>
                          <button type="button" disabled={busy} onClick={() => void illustrate(m.passage)}>Redraw</button>
                        </div>
                      </>
                    ) : (
                      <div className={styles.sketching} role="status"><span>{m.status ?? "Sketching…"}</span></div>
                    )}
                  </figure>
                ) : m.kind === "define" && !m.failed ? (
                  <section key={i} className={styles.card} aria-label="Definition">
                    {m.def ? (
                      <>
                        <div className={styles.cardHead}>
                          <span>{m.def.word}</span>
                          {m.def.partOfSpeech && <span className={styles.upTo}>{m.def.partOfSpeech}</span>}
                        </div>
                        <p>{m.def.meaning}</p>
                        {m.def.inContext && <p className={styles.here}><strong>Here:</strong> {m.def.inContext}</p>}
                        {m.def.example && <p className={styles.example}>{m.def.example}</p>}
                        {m.cached && <div className={styles.cardFoot}>Looked up before</div>}
                      </>
                    ) : <span className={styles.thinking}>{m.status ?? "Looking it up…"}</span>}
                  </section>
                ) : m.kind === "recap" && !m.failed ? (
                  <section key={i} className={styles.card} aria-label="Catch me up">
                    <div className={styles.cardHead}>
                      <span>Previously…</span>
                      {m.label && <span className={styles.upTo}>up to {m.label}</span>}
                    </div>
                    {m.recap ? (
                      <>
                        <ul>{m.recap.previously.map((line, j) => <li key={j}>{line}</li>)}</ul>
                        {m.recap.people.length > 0 && (
                          <>
                            <h3 className={styles.sub}>Where everyone stands</h3>
                            <ul className={styles.people}>{m.recap.people.map((p) => <li key={p.name}><strong>{p.name}</strong> {p.now}</li>)}</ul>
                          </>
                        )}
                        {m.recap.questions.length > 0 && (
                          <>
                            <h3 className={styles.sub}>Quick check</h3>
                            <div className={styles.quiz}>
                              {m.recap.questions.map((q, j) => (
                                <details key={j}><summary>{q.q}</summary><p>{q.a}</p></details>
                              ))}
                            </div>
                          </>
                        )}
                        {m.recap.resume && <p className={styles.resume}>{m.recap.resume}</p>}
                        {m.cached && <div className={styles.cardFoot}>Saved from earlier <button type="button" disabled={busy} onClick={() => void catchUp(true)}>Redo</button></div>}
                      </>
                    ) : <span className={styles.thinking}>{m.status ?? "Thinking…"}</span>}
                  </section>
                ) : m.kind === "summary" && !m.failed ? (
                  <section key={i} className={styles.card} aria-label="Story so far">
                    <div className={styles.cardHead}>
                      <span>The story so far</span>
                      {m.label && <span className={styles.upTo}>up to {m.label}</span>}
                    </div>
                    {m.content ? <Formatted text={m.content} /> : <span className={styles.thinking}>{m.status ?? "Thinking…"}</span>}
                    {m.cached && m.content && (
                      <div className={styles.cardFoot}>Saved from earlier <button type="button" disabled={busy} onClick={() => void summarize(true)}>Redraft</button></div>
                    )}
                  </section>
                ) : (
                  <div key={i} className={`${styles.msg} ${m.role === "user" ? styles.user : styles.bot} ${m.failed ? styles.failed : ""}`}>
                    {m.role === "assistant" && !m.content ? <span className={styles.thinking}>Thinking…</span> : <Formatted text={m.content} />}
                  </div>
                ),
              )}
            </div>
            <div className={styles.compose}>
              <div className={styles.actions}>
                <button type="button" onClick={() => void catchUp()} disabled={busy}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.5-5.8" /><path d="M4 4v4h4" /><path d="M12 8v4l2.5 2" /></svg>
                  Catch me up
                </button>
                {captured && isLookup(captured) && (
                  <button type="button" onClick={() => void define()} disabled={busy}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H18v14H6.5A1.5 1.5 0 0 0 5 19.5z" /><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H18v-3" /></svg>
                    Define “{captured.length > 16 ? `${captured.slice(0, 16)}…` : captured}”
                  </button>
                )}
                <button type="button" onClick={() => void summarize()} disabled={busy}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M5 11h14M5 16h9" /></svg>
                  Summarize up to here
                </button>
                {captured && (
                  <button type="button" onClick={() => void illustrate()} disabled={busy}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M5 17l5-4 3 2.5 3-3 3 3" /></svg>
                    Illustrate selection
                  </button>
                )}
              </div>
              <div className={styles.scopes} role="tablist" aria-label="What to ask about">
                {scopes.map((s) => (
                  <button key={s.id} type="button" role="tab" aria-selected={scope === s.id} disabled={s.id === "selection" && !captured}
                    onClick={() => setScope(s.id)}>{s.label}</button>
                ))}
              </div>
              {scope === "selection" && captured && <p className={styles.quote}>“{captured.length > 140 ? `${captured.slice(0, 140)}…` : captured}”</p>}
              <form onSubmit={(e) => { e.preventDefault(); void send(draft); }}>
                <textarea
                  value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder="Ask a question…" aria-label="Your question" maxLength={4000}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(draft); } }}
                />
                {busy ? (
                  <button type="button" onClick={stop}>Stop</button>
                ) : (
                  <button type="submit" disabled={!draft.trim()}>Send</button>
                )}
              </form>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
