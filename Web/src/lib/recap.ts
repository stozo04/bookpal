// "Catch me up": a short refresher for a reader returning to a book, plus a few
// recall questions. The model's JSON is trimmed into shape rather than rejected.
export type Recap = {
  previously: string[];
  people: { name: string; now: string }[];
  questions: { q: string; a: string }[];
  resume: string;
};

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export function parseRecap(raw: string): Recap | null {
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let data: Record<string, unknown>;
  try {
    data = obj(JSON.parse(raw.slice(start, end + 1)));
  } catch {
    return null;
  }
  const previously = list(data.previously, 7).map((p) => clip(p, 320)).filter(Boolean);
  if (!previously.length) return null;
  return {
    previously,
    people: list(data.people, 6).map((p) => ({ name: clip(obj(p).name, 80), now: clip(obj(p).now, 240) })).filter((p) => p.name && p.now),
    questions: list(data.questions, 4).map((q) => ({ q: clip(obj(q).q, 260), a: clip(obj(q).a, 320) })).filter((q) => q.q && q.a),
    resume: clip(data.resume, 300),
  };
}
