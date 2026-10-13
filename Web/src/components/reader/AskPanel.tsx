"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { cleanSvg, download, svgToPng, svgUri } from "@/lib/images";
import { readEvents } from "@/lib/sse";
import { findSummary, type ReaderNotes } from "@/lib/notes";
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
};

type Message = {
  role: "user" | "assistant"; content: string; failed?: boolean;
  kind?: "summary" | "image"; status?: string; label?: string; cached?: boolean; svg?: string; caption?: string; passage?: string;
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

export function AskPanel({ ask, onClose }: { ask: AskConfig; onClose: () => void }) {
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
