// AI notes saved to the owner's database (reader_ai_notes) so each is made once.
import type { Character } from "./castgraph";
import type { Definition } from "./define";
import type { Recap } from "./recap";

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
  words: Record<string, Definition>; // looked-up words, by lowercase word
  recaps: Record<string, { progress: number; recap: Recap }>; // "catch me up", by place in the book
};

// A saved note can stand in for a fresh one only if it was made where the reader is now:
// never from further on (that could spoil), and not from much earlier (it would be stale).
export const SAME_PLACE = { behind: 0.02, ahead: 0.004 };
export function atThisPlace(madeAt: number, now: number): boolean {
  return now - madeAt <= SAME_PLACE.behind && madeAt - now <= SAME_PLACE.ahead;
}

// The saved note made closest to where the reader is now, if any is close enough.
export function findNear<T extends { progress: number }>(notes: Record<string, T>, now: number): (T & { label: string }) | null {
  let best: (T & { label: string; gap: number }) | null = null;
  for (const [label, n] of Object.entries(notes)) {
    if (!atThisPlace(n.progress, now)) continue;
    const gap = Math.abs(now - n.progress);
    if (!best || gap < best.gap) best = { ...n, label, gap };
  }
  return best;
}

export const findSummary = (summaries: ReaderNotes["summaries"], now: number) => findNear(summaries, now);

export const emptyNotes: ReaderNotes = { cast: null, summaries: {}, profiles: {}, words: {}, recaps: {} };

export type NoteKind = "cast" | "summary" | "character" | "word" | "recap";

// Saves in the background: the reader keeps the result either way.
export function putNote(fileId: string, note: { kind: NoteKind; label: string; progress: number; content: unknown }): Promise<boolean> {
  return fetch(`/api/files/${fileId}/notes`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(note),
  }).then((r) => r.ok).catch(() => false);
}
