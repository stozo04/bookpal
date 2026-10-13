// Lays characters out as a relationship web: the most connected person at the centre
// (when there are enough to need one), the rest on one or two rings around them.

export type Relation = { with: string; type: string };
export type Character = { name: string; aliases: string[]; role: string; description: string; relations: Relation[] };
export type Node = { name: string; x: number; y: number; degree: number };
export type Edge = { a: string; b: string; label: string };

export const GRAPH_W = 340;
export const GRAPH_H = 320;

export function layout(characters: Character[], w = GRAPH_W, h = GRAPH_H): { nodes: Node[]; edges: Edge[] } {
  const names = new Set(characters.map((c) => c.name));
  const degree = new Map<string, number>(characters.map((c) => [c.name, 0]));
  const edges = new Map<string, Edge>();
  for (const c of characters) {
    for (const r of c.relations) {
      if (!names.has(r.with) || r.with === c.name) continue;
      const [a, b] = [c.name, r.with].sort();
      const key = `${a}\u0000${b}`;
      if (!edges.has(key)) {
        edges.set(key, { a, b, label: r.type });
        degree.set(a, (degree.get(a) ?? 0) + 1);
        degree.set(b, (degree.get(b) ?? 0) + 1);
      }
    }
  }

  const ordered = [...characters].sort((x, y) => (degree.get(y.name) ?? 0) - (degree.get(x.name) ?? 0) || x.name.localeCompare(y.name));
  const cx = w / 2, cy = h / 2;
  const nodes: Node[] = [];
  const put = (name: string, x: number, y: number) => nodes.push({ name, x, y, degree: degree.get(name) ?? 0 });

  if (ordered.length === 1) put(ordered[0].name, cx, cy);
  else if (ordered.length > 1) {
    const hub = ordered.length >= 4 ? ordered[0] : null;
    if (hub) put(hub.name, cx, cy);
    const rest = hub ? ordered.slice(1) : ordered;
    const split = rest.length <= 9 ? rest.length : Math.ceil(rest.length * 0.4);
    const rings = rest.length <= 9 ? [rest] : [rest.slice(0, split), rest.slice(split)];
    const radius = rings.length === 1 ? [Math.min(w, h) * 0.37] : [Math.min(w, h) * 0.23, Math.min(w, h) * 0.41];
    rings.forEach((ring, r) =>
      ring.forEach((c, i) => {
        const angle = (i / ring.length) * Math.PI * 2 - Math.PI / 2 + (r === 1 ? Math.PI / ring.length : 0);
        put(c.name, cx + Math.cos(angle) * radius[r] * (w / Math.min(w, h)) * 0.95, cy + Math.sin(angle) * radius[r]);
      }),
    );
  }
  return { nodes, edges: [...edges.values()] };
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
