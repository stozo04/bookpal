// A word looked up while reading: what it means in general and in this passage.
export type Definition = { word: string; partOfSpeech: string; meaning: string; inContext: string; example: string };

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function parseDefinition(raw: string, asked: string): Definition | null {
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const meaning = clip(data.meaning, 420);
  if (!meaning) return null;
  return { word: clip(data.word, 80) || asked, partOfSpeech: clip(data.partOfSpeech, 40), meaning, inContext: clip(data.inContext, 360), example: clip(data.example, 240) };
}

// A selection is a lookup when it is one to three words and short.
export function isLookup(selection: string): boolean {
  const s = selection.trim();
  return s.length > 0 && s.length <= 40 && s.split(/\s+/).length <= 3 && /\p{L}/u.test(s);
}

export const wordKey = (word: string) => word.trim().toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

// The sentence-sized stretch around the first mention of the word, to anchor its sense.
export function around(excerpt: string, word: string, span = 320): string {
  const i = excerpt.toLowerCase().indexOf(word.toLowerCase());
  if (i < 0) return "";
  return excerpt.slice(Math.max(0, i - span), Math.min(excerpt.length, i + word.length + span)).replace(/\s+/g, " ").trim();
}
