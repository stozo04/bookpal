import { test } from "node:test";
import assert from "node:assert/strict";
import { THEMES } from "../src/components/reader/themes.ts";

// WCAG 2.x relative luminance and contrast ratio.
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

for (const [name, t] of Object.entries(THEMES)) {
  test(`${name}: reading text meets AAA (7:1)`, () => assert.ok(ratio(t.ink, t.bg) >= 7, `${ratio(t.ink, t.bg).toFixed(2)}`));
  test(`${name}: quiet text meets AA (4.5:1)`, () => assert.ok(ratio(t.voice, t.bg) >= 4.5, `${ratio(t.voice, t.bg).toFixed(2)}`));
}
