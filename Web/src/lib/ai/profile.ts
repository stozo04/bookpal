import type { Profile } from "../notes";

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
const rec = (v: unknown) => (v ?? {}) as Record<string, unknown>;

// Quotes are only kept if they really appear in the passages that were supplied.
const squash = (s: string) => s.toLowerCase().replace(/[“”"‘’']/g, "").replace(/\s+/g, " ").trim();

export function parseProfile(raw: string, source: string): Profile | null {
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const d = rec(data);
  const summary = clip(d.summary, 900);
  if (!summary) return null;
  const haystack = squash(source);
  return {
    summary,
    traits: list(d.traits, 6).map((t) => clip(t, 40)).filter(Boolean),
    wants: clip(d.wants, 400),
    timeline: list(d.timeline, 8)
      .map((t) => ({ where: clip(rec(t).where, 60), event: clip(rec(t).event, 220) }))
      .filter((t) => t.event),
    relationships: list(d.relationships, 8)
      .map((r) => ({ with: clip(rec(r).with, 80), detail: clip(rec(r).detail, 240) }))
      .filter((r) => r.with && r.detail),
    quotes: list(d.quotes, 3)
      .map((q) => ({ text: clip(rec(q).text, 240), where: clip(rec(q).where, 60) }))
      .filter((q) => q.text.length > 8 && haystack.includes(squash(q.text))),
  };
}
