export type CastRelation = { with: string; type: string };
export type CastCharacter = { name: string; aliases: string[]; role: string; description: string; relations: CastRelation[] };
export type CastResult = { characters: CastCharacter[] };

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);

// The model's JSON is trimmed into shape rather than rejected: one over-long
// sentence should not cost the reader the whole cast.
export function parseCast(raw: string): CastResult | null {
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const seen = new Set<string>();
  const characters: CastCharacter[] = [];
  for (const item of list((data as { characters?: unknown })?.characters, 40)) {
    const c = (item ?? {}) as Record<string, unknown>;
    const name = clip(c.name, 80);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    characters.push({
      name,
      aliases: list(c.aliases, 6).map((a) => clip(a, 80)).filter(Boolean),
      role: clip(c.role, 80),
      description: clip(c.description, 420),
      relations: list(c.relations, 8)
        .map((r) => ({ with: clip((r as Record<string, unknown>)?.with, 80), type: clip((r as Record<string, unknown>)?.type, 60) }))
        .filter((r) => r.with && r.type),
    });
  }
  return characters.length ? { characters } : null;
}
