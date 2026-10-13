export type Folder = { id: string; parentId: string | null; name: string };

export function pathTo(folders: Folder[], id: string | null): Folder[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const out: Folder[] = [];
  for (let cur = id ? byId.get(id) : undefined; cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) out.unshift(cur);
  return out;
}

export function descendants(folders: Folder[], id: string): Set<string> {
  const out = new Set<string>([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const f of folders) if (f.parentId && out.has(f.parentId) && !out.has(f.id)) (out.add(f.id), (grew = true));
  }
  return out;
}

// Folders in tree order with their depth, for pickers.
export function flatten(folders: Folder[], exclude: Set<string> = new Set()): { folder: Folder; depth: number }[] {
  const kids = (parent: string | null) => folders.filter((f) => f.parentId === parent && !exclude.has(f.id)).sort((a, b) => a.name.localeCompare(b.name));
  const walk = (parent: string | null, depth: number): { folder: Folder; depth: number }[] =>
    kids(parent).flatMap((f) => [{ folder: f, depth }, ...walk(f.id, depth + 1)]);
  return walk(null, 0);
}
