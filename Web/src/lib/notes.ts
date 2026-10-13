// AI notes saved to the owner's database (reader_ai_notes) so each is made once.
import type { Character } from "./castgraph";

export type Profile = {
  summary: string;
  traits: string[];
  wants: string;
  timeline: { where: string; event: string }[];
  relationships: { with: string; detail: string }[];
  quotes: { text: string; where: string }[];
};

export type ReaderNotes = {
  cast: { label: string; progress: number; characters: Character[] } | null;
  summaries: Record<string, { progress: number; text: string }>; // by place in the book
  profiles: Record<string, { label: string; progress: number; profile: Profile }>; // by character name
};

// A saved note can stand in for a fresh one only if it was made where the reader is now:
// never from further on (that could spoil), and not from much earlier (it would be stale).
export const SAME_PLACE = { behind: 0.02, ahead: 0.004 };
export function atThisPlace(madeAt: number, now: number): boolean {
  return now - madeAt <= SAME_PLACE.behind && madeAt - now <= SAME_PLACE.ahead;
}

export function findSummary(summaries: ReaderNotes["summaries"], now: number): { label: string; text: string } | null {
  let best: { label: string; text: string; gap: number } | null = null;
  for (const [label, s] of Object.entries(summaries)) {
    if (!atThisPlace(s.progress, now)) continue;
    const gap = Math.abs(now - s.progress);
    if (!best || gap < best.gap) best = { label, text: s.text, gap };
  }
  return best;
}

export const emptyNotes: ReaderNotes = { cast: null, summaries: {}, profiles: {} };

export type NoteKind = "cast" | "summary" | "character";

// Saves in the background: the reader keeps the result either way.
export function putNote(fileId: string, note: { kind: NoteKind; label: string; progress: number; content: unknown }): Promise<boolean> {
  return fetch(`/api/files/${fileId}/notes`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(note),
  }).then((r) => r.ok).catch(() => false);
}
