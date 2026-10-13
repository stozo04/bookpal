// In-book search helpers: accent- and case-insensitive matching that keeps string
// indexes aligned with the original text, snippets, and in-page highlighting.

// Same length as the input, so an index in the folded text is an index in the original.
export function fold(text: string): string {
  let out = "";
  for (const ch of text) {
    const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    out += base.length === ch.length ? base : ch;
  }
  return out;
}

export type Hit = {
  group: string; // chapter title or page label
  before: string;
  match: string;
  after: string;
  /** Position of this match among the matches in its chapter, page or paragraph. */
  occurrence: number;
  at: number; // chapter index, page index or paragraph index
};

export function findIn(text: string, query: string, limit = 60): { index: number; before: string; match: string; after: string }[] {
  const q = fold(query.trim());
  if (q.length < 2) return [];
  const folded = fold(text);
  const out: { index: number; before: string; match: string; after: string }[] = [];
  for (let from = 0, i = folded.indexOf(q, from); i !== -1 && out.length < limit; i = folded.indexOf(q, from)) {
    const clean = (s: string) => s.replace(/\s+/g, " ");
    out.push({
      index: i,
      before: clean(text.slice(Math.max(0, i - 48), i)).trimStart(),
      match: text.slice(i, i + q.length),
      after: clean(text.slice(i + q.length, i + q.length + 64)).trimEnd(),
    });
    from = i + q.length;
  }
  return out;
}

// Ranges for every match inside one element (matches that span two text nodes are skipped).
export function findRanges(root: Node, query: string): Range[] {
  const q = fold(query.trim());
  if (q.length < 2) return [];
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const out: Range[] = [];
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const folded = fold(node.data);
    for (let i = folded.indexOf(q); i !== -1; i = folded.indexOf(q, i + q.length)) {
      const range = doc.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + q.length);
      out.push(range);
    }
  }
  return out;
}

export const HIGHLIGHT = "bookpal-search";

// Paint matches with the CSS Custom Highlight API: no page content is changed.
export function paint(win: Window | null | undefined, ranges: Range[]) {
  const w = win as (Window & { CSS?: { highlights?: Map<string, unknown> }; Highlight?: new (...r: Range[]) => unknown }) | null | undefined;
  if (!w?.CSS?.highlights || !w.Highlight) return;
  if (ranges.length === 0) w.CSS.highlights.delete(HIGHLIGHT);
  else w.CSS.highlights.set(HIGHLIGHT, new w.Highlight(...ranges));
}
