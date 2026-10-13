import { test } from "node:test";
import assert from "node:assert/strict";
import { GRAPH_H, GRAPH_W, layout, type Character } from "../src/lib/castgraph.ts";

const person = (name: string, relations: [string, string][] = []): Character => ({
  name, aliases: [], role: "", description: "", relations: relations.map(([w, t]) => ({ with: w, type: t })),
});

test("a single character sits in the middle", () => {
  const { nodes, edges } = layout([person("Ada")]);
  assert.equal(nodes.length, 1);
  assert.deepEqual([nodes[0].x, nodes[0].y], [GRAPH_W / 2, GRAPH_H / 2]);
  assert.equal(edges.length, 0);
});

test("the most connected character is the hub", () => {
  const cast = [person("A", [["B", "x"], ["C", "x"], ["D", "x"]]), person("B"), person("C"), person("D"), person("E")];
  const { nodes } = layout(cast);
  const hub = nodes.reduce((best, n) => (n.degree > best.degree ? n : best));
  assert.equal(hub.name, "A");
  assert.deepEqual([hub.x, hub.y], [GRAPH_W / 2, GRAPH_H / 2]);
});

test("a relation said from both sides becomes one edge; unknown names are ignored", () => {
  const { edges } = layout([person("A", [["B", "sister of"], ["Nobody", "friend of"], ["A", "self"]]), person("B", [["A", "sister of"]])]);
  assert.equal(edges.length, 1);
  assert.deepEqual([edges[0].a, edges[0].b], ["A", "B"]);
});

test("every node stays inside the picture and nobody overlaps, even with 24 people", () => {
  const cast = Array.from({ length: 24 }, (_, i) => person(`P${i}`, i ? [[`P${i - 1}`, "knows"]] : []));
  const { nodes } = layout(cast);
  assert.equal(nodes.length, 24);
  for (const n of nodes) {
    assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y));
    assert.ok(n.x >= 0 && n.x <= GRAPH_W && n.y >= 0 && n.y <= GRAPH_H, `${n.name} at ${n.x},${n.y}`);
  }
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) assert.ok(Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) > 14, `${nodes[i].name}/${nodes[j].name} overlap`);
});
