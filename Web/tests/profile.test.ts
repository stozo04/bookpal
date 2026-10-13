import { test } from "node:test";
import assert from "node:assert/strict";
import { gatherMentions, nameVariants } from "../src/lib/mentions.ts";
import { parseProfile } from "../src/lib/ai/profile.ts";

test("nameVariants adds distinctive words but not ones shared with others", () => {
  assert.deepEqual(nameVariants("Manfred Macx", ["Manny"], ["Pamela Macx"]).sort(), ["Manfred", "Manfred Macx", "Manny"].sort());
});

test("gatherMentions finds only sentences about the person, with a neighbour either side", () => {
  const text = "It rained all day. Manfred walked home. The cat watched him. Nothing else happened. Later, Pamela called. Manfred hung up.";
  const out = gatherMentions(text, ["Manfred"]);
  assert.ok(out.includes("Manfred walked home."));
  assert.ok(out.includes("Manfred hung up."));
  assert.ok(!out.includes("It rained all day.") === false); // neighbour kept
  assert.ok(!/Manfredo/.test(out));
});

test("matches whole words only", () => {
  assert.equal(gatherMentions("The manager arrived. Nobody cared.", ["Man"]), "");
});

test("over budget, mentions are sampled across the whole book, not just the start", () => {
  const text = Array.from({ length: 400 }, (_, i) => `Ada did thing number ${i}. Filler sentence ${i}.`).join(" ");
  const out = gatherMentions(text, ["Ada"], 3000);
  assert.ok(out.length <= 3500);
  assert.ok(out.includes("thing number 0") && /thing number 3[0-9][0-9]/.test(out), "should reach late in the text");
});

const source = 'He said, "I will not run." Then he ran away.';
test("parseProfile keeps real quotes and drops invented ones", () => {
  const raw = JSON.stringify({ summary: "A runner.", traits: ["brave"], wants: "To stop.", timeline: [{ where: "start", event: "Ran." }], relationships: [{ with: "Bo", detail: "Friend." }],
    quotes: [{ text: "I will not run.", where: "start" }, { text: "I have never been afraid of anything.", where: "later" }] });
  const p = parseProfile("```json\n" + raw + "\n```", source)!;
  assert.deepEqual(p.quotes.map((q) => q.text), ["I will not run."]);
  assert.equal(p.timeline.length, 1);
});

test("parseProfile needs a summary and trims long fields", () => {
  assert.equal(parseProfile('{"traits":["x"]}', source), null);
  assert.equal(parseProfile("no json here", source), null);
  const p = parseProfile(JSON.stringify({ summary: "s".repeat(5000), traits: Array(20).fill("t") }), source)!;
  assert.equal(p.summary.length, 900);
  assert.equal(p.traits.length, 6);
});

import { atThisPlace, findSummary } from "../src/lib/notes.ts";

test("a saved note only stands in at the same place: never from further on, not from far behind", () => {
  assert.equal(atThisPlace(0.5, 0.5), true);
  assert.equal(atThisPlace(0.5, 0.51), true);     // read a little further: still fine
  assert.equal(atThisPlace(0.5, 0.499), true);    // restored a few pixels earlier on reload
  assert.equal(atThisPlace(0.5, 0.45), false);    // the note is from further on: would spoil
  assert.equal(atThisPlace(0.5, 0.6), false);     // read much further: stale
});

test("findSummary picks the closest eligible summary", () => {
  const s = { "Chapter 3": { progress: 0.3, text: "three" }, "Chapter 5": { progress: 0.5, text: "five" } };
  assert.equal(findSummary(s, 0.505)?.text, "five");
  assert.equal(findSummary(s, 0.4), null);
  assert.equal(findSummary(s, 0.29)?.text ?? null, null);
});
