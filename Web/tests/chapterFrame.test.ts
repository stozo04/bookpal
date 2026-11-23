import { test } from "node:test";
import assert from "node:assert/strict";
import { chapterFrameHeight } from "../src/lib/chapterFrame.ts";

// Heights measured in a real chapter after its text was made larger and then back to
// normal; scrollHeight is what the old sizing read and stayed stuck at the larger value.
const shrunkChapter = (bodyHeight: number, frameHeight: number) => ({
  documentElement: { scrollHeight: Math.max(bodyHeight, frameHeight) },
  body: { getBoundingClientRect: () => ({ height: bodyHeight }) },
});

test("the frame shrinks to the chapter when its text gets shorter", () => {
  assert.equal(chapterFrameHeight(shrunkChapter(5021, 9875)), 5021);
});

test("the frame grows to the chapter when its text gets longer", () => {
  assert.equal(chapterFrameHeight(shrunkChapter(15279, 9505)), 15279);
});

test("a fractional chapter height rounds up so the last line is never clipped", () => {
  assert.equal(chapterFrameHeight(shrunkChapter(5021.48, 0)), 5022);
});
