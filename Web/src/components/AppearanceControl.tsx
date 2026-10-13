"use client";
import { useState } from "react";
import styles from "./AppearanceControl.module.css";

type Choice = "system" | "light" | "dark";
const OPTIONS: { id: Choice; label: string; note: string }[] = [
  { id: "system", label: "System", note: "Matches your device" },
  { id: "light", label: "Light", note: "Paper and ink" },
  { id: "dark", label: "Dark", note: "Easy on the eyes" },
];

export function AppearanceControl({ initial }: { initial: Choice }) {
  const [choice, setChoice] = useState<Choice>(initial);
  const [error, setError] = useState("");

  const pick = async (next: Choice) => {
    const previous = choice;
    setChoice(next);
    setError("");
    // Apply at once; the server then remembers it for every device.
    if (next === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.dataset.theme = next;
    const r = await fetch("/api/profile/appearance", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ appearance: next }) });
    if (!r.ok) {
      setChoice(previous);
      if (previous === "system") document.documentElement.removeAttribute("data-theme");
      else document.documentElement.dataset.theme = previous;
      setError("Your choice couldn’t be saved. Please try again.");
    }
  };

  return (
    <div>
      <div className={styles.group} role="radiogroup" aria-label="Appearance">
        {OPTIONS.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={choice === o.id} className={styles.tile} onClick={() => void pick(o.id)}>
            <span className={`${styles.preview} ${styles[o.id]}`} aria-hidden="true">
              <span className={styles.bar} />
              <span className={styles.line} />
              <span className={styles.line} style={{ width: "62%" }} />
              <span className={styles.line} style={{ width: "78%" }} />
            </span>
            <span className={styles.label}>{o.label}</span>
            <span className={styles.note}>{o.note}</span>
          </button>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
