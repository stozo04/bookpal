import test from "node:test";
import assert from "node:assert/strict";
import { parseRecap } from "../src/lib/recap.ts";
import { around, isLookup, parseDefinition, wordKey } from "../src/lib/define.ts";

test("parseRecap trims and keeps what is usable", () => {
  const r = parseRecap('Sure! {"previously":["A","B"],"people":[{"name":"Ann","now":"hiding"},{"name":"","now":"x"}],"questions":[{"q":"Who?","a":"Ann"},{"q":"","a":"?"}],"resume":"Chapter 3"}');
  assert.deepEqual(r?.previously, ["A", "B"]);
  assert.equal(r?.people.length, 1);
  assert.equal(r?.questions.length, 1);
  assert.equal(r?.resume, "Chapter 3");
});
test("parseRecap needs at least one recap line", () => {
  assert.equal(parseRecap('{"previously":[]}'), null);
  assert.equal(parseRecap("no json"), null);
  assert.equal(parseRecap("{bad"), null);
});
test("parseRecap clips over-long fields instead of failing", () => {
  const r = parseRecap(JSON.stringify({ previously: ["x".repeat(900)], resume: "y".repeat(900) }));
  assert.equal(r?.previously[0].length, 320);
  assert.equal(r?.resume.length, 300);
});
test("parseDefinition requires a meaning and defaults the word", () => {
  assert.equal(parseDefinition('{"word":"x"}', "x"), null);
  const d = parseDefinition('{"meaning":"to dwell","partOfSpeech":"verb"}', "abide");
  assert.equal(d?.word, "abide");
  assert.equal(d?.partOfSpeech, "verb");
});
test("isLookup accepts words and short phrases only", () => {
  assert.ok(isLookup("ephemeral"));
  assert.ok(isLookup("  in medias res "));
  assert.ok(!isLookup("this is four whole words"));
  assert.ok(!isLookup("1234"));
  assert.ok(!isLookup(""));
});
test("wordKey strips punctuation and case", () => {
  assert.equal(wordKey("“Ephemeral,”"), "ephemeral");
});
test("around finds the passage near a word", () => {
  const text = "x".repeat(500) + " the ephemeral light " + "y".repeat(500);
  const s = around(text, "ephemeral", 20);
  assert.ok(s.includes("ephemeral") && s.length < 80);
  assert.equal(around("nothing", "zzz"), "");
});
