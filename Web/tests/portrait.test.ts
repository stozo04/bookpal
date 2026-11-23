import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanPortraitPrompt, isPortraitKey, portraitKey, portraitPath, PORTRAIT_PROMPT_MAX } from "../src/lib/portrait.ts";

test("portraitKey is a stable hex key that ignores case and outer spaces", async () => {
  const key = await portraitKey("Tate Donovan");
  assert.ok(isPortraitKey(key));
  assert.equal(await portraitKey("  tate donovan "), key);
  assert.notEqual(await portraitKey("Oscar"), key);
});

test("any name, even one with slashes or dots, becomes a single safe path segment", async () => {
  const key = await portraitKey("../../etc/passwd");
  assert.match(portraitPath("user", "book", key), /^user\/book\/characters\/[0-9a-f]{64}$/);
});

test("isPortraitKey refuses anything that is not a 64-character hex key", () => {
  assert.equal(isPortraitKey("cover"), false);
  assert.equal(isPortraitKey("../x"), false);
  assert.equal(isPortraitKey("A".repeat(64)), false);
  assert.equal(isPortraitKey("a".repeat(63)), false);
});

test("cleanPortraitPrompt strips fences, labels and wrapping quotes", () => {
  const body = "Head-and-shoulders portrait of a man in his late thirties, tired eyes, dark coat, soft window light. No text, no lettering, no borders.";
  assert.equal(cleanPortraitPrompt("```\nPrompt: " + body + "\n```"), body);
  assert.equal(cleanPortraitPrompt(`“${body}”`), body);
});

test("cleanPortraitPrompt rejects empty replies and caps long ones", () => {
  assert.equal(cleanPortraitPrompt("   "), null);
  assert.equal(cleanPortraitPrompt("too short"), null);
  assert.equal(cleanPortraitPrompt("x".repeat(5000))?.length, PORTRAIT_PROMPT_MAX);
});
