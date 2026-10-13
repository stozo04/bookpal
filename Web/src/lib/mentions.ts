// Finds the passages of a book where a character appears, so a profile can be built
// from the whole arc without sending the whole book.

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Full name and aliases, plus a first or last word when it is long enough to be distinctive.
export function nameVariants(name: string, aliases: string[] = [], avoid: string[] = []): string[] {
  const out = new Set<string>([name, ...aliases].map((s) => s.trim()).filter((s) => s.length >= 2));
  const others = new Set(avoid.flatMap((n) => n.split(/\s+/)).map((w) => w.toLowerCase()));
  for (const word of name.split(/\s+/)) if (word.length >= 4 && !others.has(word.toLowerCase())) out.add(word);
  return [...out];
}

export function gatherMentions(text: string, variants: string[], budget = 40_000): string {
  if (variants.length === 0) return "";
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${variants.map(escapeRe).join("|")})(?![\\p{L}\\p{N}])`, "iu");
  const sentences = text.split(/(?<=[.!?”"’])\s+/).filter(Boolean);

  // Each mention with a sentence either side, merged where they touch.
  const groups: { from: number; to: number }[] = [];
  sentences.forEach((s, i) => {
    if (!re.test(s)) return;
    const from = Math.max(0, i - 1), to = Math.min(sentences.length - 1, i + 1);
    const last = groups[groups.length - 1];
    // Merge neighbouring mentions, but never into one huge block: a main character is
    // in nearly every sentence, and sampling needs separate pieces to choose from.
    if (last && from <= last.to + 1 && to - last.from < 7) last.to = Math.max(last.to, to);
    else groups.push({ from, to });
  });
  const render = (g: { from: number; to: number }) => sentences.slice(g.from, g.to + 1).join(" ");
  const total = groups.reduce((n, g) => n + render(g).length + 5, 0);

  // Too many to fit: take them evenly across the book so the whole arc is represented.
  let chosen = groups;
  if (total > budget) {
    const keep = Math.max(1, Math.floor((groups.length * budget) / total));
    chosen = Array.from({ length: keep }, (_, k) => groups[Math.floor((k * groups.length) / keep)]);
  }
  return chosen.map(render).join("\n…\n");
}
