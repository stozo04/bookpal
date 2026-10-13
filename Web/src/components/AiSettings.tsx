"use client";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./AiSettings.module.css";

type Status = { available: boolean; canConnect?: boolean; connected: boolean; email: string | null; selection: { model: string; reasoning: string; name?: string } | null };
type Model = { slug: string; name: string; reasoning: string[] };

const ERRORS: Record<string, string> = {
  cancelled: "The connection was cancelled.",
  scope: "You signed in, but didn’t allow BookPal to use your plan. Try again and allow it.",
  expired: "That sign-in link expired. Please try again.",
  registration: "OpenAI couldn’t finish setting up BookPal. Please try again.",
  exchange: "OpenAI couldn’t complete the connection. Please try again.",
  failed: "Something went wrong while connecting. Please try again.",
};

const LEVELS: Record<string, string> = { xhigh: "Extra high" };
const cap = (s: string) => LEVELS[s] ?? s.charAt(0).toUpperCase() + s.slice(1);

export function AiSettings() {
  const params = useSearchParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [models, setModels] = useState<Model[] | null>(null);
  const [message, setMessage] = useState<string>(ERRORS[params.get("ai_error") ?? ""] ?? "");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const s: Status = await fetch("/api/ai/status", { cache: "no-store" }).then((r) => r.json());
    setStatus(s);
    if (s.connected) {
      const r = await fetch("/api/ai/models", { cache: "no-store" });
      if (r.ok) {
        const { models: list } = (await r.json()) as { models: Model[] };
        setModels(list);
        if (!s.selection && list[0]) {
          const first = { model: list[0].slug, name: list[0].name, reasoning: list[0].reasoning.includes("medium") ? "medium" : list[0].reasoning[0] };
          await fetch("/api/ai/selection", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(first) });
          setStatus({ ...s, selection: first });
        }
      } else setMessage("Your models couldn’t be loaded. Try reconnecting.");
    }
  }, []);

  useEffect(() => {
    void load().catch(() => setMessage("AI settings couldn’t be loaded."));
  }, [load]);

  const connect = async () => {
    setBusy(true);
    setMessage("");
    const r = await fetch("/api/ai/connect", { method: "POST" });
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      setMessage(data?.error?.message ?? "The connection couldn’t be started.");
      setBusy(false);
      return;
    }
    window.location.href = data.url;
  };

  const disconnect = async () => {
    setBusy(true);
    await fetch("/api/ai/disconnect", { method: "POST" });
    setModels(null);
    setBusy(false);
    await load();
  };

  const choose = async (selection: { model: string; reasoning: string; name?: string }) => {
    setStatus((s) => (s ? { ...s, selection } : s));
    const r = await fetch("/api/ai/selection", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(selection) });
    if (!r.ok) setMessage("Your choice couldn’t be saved.");
  };

  if (!status) return <p className="voice">Loading…</p>;

  if (!status.available) {
    return (
      <section className={styles.block}>
        <h2 className="section">Not available here</h2>
        <p className="voice">
          ChatGPT isn’t available right now.
        </p>
      </section>
    );
  }

  const current = models?.find((m) => m.slug === status.selection?.model);

  return (
    <div>
      {message && <p className="error" role="alert">{message}</p>}

      <section className={styles.block}>
        <div className={styles.head}>
          <div>
            <h2 className="section">ChatGPT</h2>
            <p className={styles.state}>
              <span className={`${styles.dot} ${status.connected ? styles.on : ""}`} aria-hidden="true" />
              {status.connected ? <>Connected{status.email ? <span className="voice"> · {status.email}</span> : null}</> : <span className="voice">Not connected</span>}
            </p>
          </div>
          {status.connected ? (
            <button type="button" onClick={disconnect} disabled={busy}>Disconnect</button>
          ) : status.canConnect === false ? null : (
            <button type="button" className={styles.primary} onClick={connect} disabled={busy}>{busy ? "Opening…" : "Connect ChatGPT"}</button>
          )}
        </div>
        {!status.connected && (
          <p className="voice">
            {status.canConnect === false
              ? "OpenAI only lets you sign in from your own computer. Open BookPal there, connect ChatGPT once, and the connection will work here too."
              : "Sign in with ChatGPT to use your plan’s allowance for questions about what you’re reading, instead of paying for API usage. BookPal only receives your name, email and profile picture and never sees your conversations. Your sign-in is kept encrypted in your own private storage."}
          </p>
        )}
      </section>

      {status.connected && (
        <section className={styles.block}>
          <h2 className="section">While you read</h2>
          <p className="voice">These choices are used whenever you ask about a book.</p>
          {!models ? (
            <p className="voice">Loading your models…</p>
          ) : (
            <dl className="facts">
              <div>
                <dt><label htmlFor="model">Model</label></dt>
                <dd>
                  <select
                    id="model" className="select" value={status.selection?.model ?? ""}
                    onChange={(e) => {
                      const next = models.find((m) => m.slug === e.target.value)!;
                      const keep = next.reasoning.includes(status.selection?.reasoning ?? "") ? status.selection!.reasoning : next.reasoning.includes("medium") ? "medium" : next.reasoning[0];
                      void choose({ model: next.slug, name: next.name, reasoning: keep });
                    }}
                  >
                    {models.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}
                  </select>
                </dd>
              </div>
              <div>
                <dt id="reasoning-label">Reasoning</dt>
                <dd>
                  <div className={styles.segment} role="group" aria-labelledby="reasoning-label">
                    {(current?.reasoning ?? []).map((level) => (
                      <button key={level} type="button" aria-pressed={status.selection?.reasoning === level}
                        onClick={() => status.selection && void choose({ model: status.selection.model, name: status.selection.name, reasoning: level })}>
                        {cap(level)}
                      </button>
                    ))}
                  </div>
                </dd>
              </div>
            </dl>
          )}
          <p className="voice">Higher reasoning thinks for longer and uses more of your plan.</p>
        </section>
      )}
    </div>
  );
}
