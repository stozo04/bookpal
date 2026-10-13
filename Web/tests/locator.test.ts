import { test } from "node:test";
import assert from "node:assert/strict";
import { webLocator } from "../src/lib/locator.ts";

// These literals are copied into the Swift test WebLocatorCompatibilityTests. If one
// changes, change both, so the Mac keeps decoding what the web writes.
test("EPUB locator has exactly the Mac field names", () => {
  assert.equal(JSON.stringify(webLocator("a".repeat(64), "id-idp140306299499120", 2381, 0.03)),
    '{"schemaVersion":1,"publicationFingerprint":"' + "a".repeat(64) + '","resourceID":"id-idp140306299499120","position":2381,"progression":0.03,"rectangles":[]}');
});
test("PDF locator uses page-N with the page index as position", () => {
  assert.equal(JSON.stringify(webLocator("f", "page-6", 6, 6 / 109)),
    '{"schemaVersion":1,"publicationFingerprint":"f","resourceID":"page-6","position":6,"progression":' + 6 / 109 + ',"rectangles":[]}');
});
test("values are clamped like the Mac clamps progression", () => {
  const l = webLocator("f", "text", -5.4, 7);
  assert.equal(l.position, 0);
  assert.equal(l.progression, 1);
});
