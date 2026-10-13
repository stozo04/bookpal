import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCast } from "../src/lib/ai/cast.ts";

test("reads JSON wrapped in a code fence and chatter", () => {
  const raw = 'Here you go:\n```json\n{"characters":[{"name":"Ada","aliases":["A"],"role":"inventor","description":"Builds engines.","relations":[{"with":"Byron","type":"friend of"}]}]}\n```';
  assert.deepEqual(parseCast(raw)?.characters[0], { name: "Ada", aliases: ["A"], role: "inventor", description: "Builds engines.", relations: [{ with: "Byron", type: "friend of" }] });
});

test("trims over-long fields instead of rejecting the cast", () => {
  const raw = JSON.stringify({ characters: [{ name: "N".repeat(200), aliases: Array(20).fill("x"), role: "r".repeat(300), description: "d".repeat(2000), relations: Array(30).fill({ with: "Z", type: "t".repeat(200) }) }] });
  const c = parseCast(raw)!.characters[0];
  assert.equal(c.name.length, 80);
  assert.equal(c.aliases.length, 6);
  assert.equal(c.role.length, 80);
  assert.equal(c.description.length, 420);
  assert.equal(c.relations.length, 8);
  assert.equal(c.relations[0].type.length, 60);
});

test("drops duplicates and nameless entries, tolerates missing fields", () => {
  const out = parseCast('{"characters":[{"name":"A"},{"name":"A"},{"role":"nobody"},null,{"name":"B","relations":"nope"}]}')!;
  assert.deepEqual(out.characters.map((c) => c.name), ["A", "B"]);
  assert.deepEqual(out.characters[1].relations, []);
});

test("returns null for prose, broken JSON or an empty cast", () => {
  assert.equal(parseCast("I could not find any characters."), null);
  assert.equal(parseCast('{"characters":[{"name":"A",'), null);
  assert.equal(parseCast('{"characters":[]}'), null);
});
