import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RELEASES, displayDate } from "../src/lib/releaseNotes.ts";

const productVersion = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const parts = (v: string) => v.split(".").map(Number);
const newer = (a: string, b: string) => {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

test("the newest release notes are for the product version", () => {
  assert.equal(RELEASES[0].version, productVersion);
});

test("releases run newest first, one entry per version", () => {
  for (let i = 1; i < RELEASES.length; i++) {
    assert.ok(newer(RELEASES[i - 1].version, RELEASES[i].version), `${RELEASES[i - 1].version} should be above ${RELEASES[i].version}`);
    assert.ok(RELEASES[i - 1].date >= RELEASES[i].date, `${RELEASES[i - 1].version} is dated before ${RELEASES[i].version}`);
  }
});

test("every release has a real date and at least one described change", () => {
  for (const release of RELEASES) {
    assert.match(release.version, /^\d+\.\d+\.\d+$/);
    assert.match(release.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(new Date(`${release.date}T00:00:00Z`).toISOString().slice(0, 10), release.date, `${release.version} has an impossible date`);
    assert.ok(release.changes.length > 0, `${release.version} lists no changes`);
    for (const change of release.changes) assert.ok(change.text.trim().length > 10, `${release.version} has a change too short to tell a reader anything`);
  }
});

test("dates read like the Mac app's What's New", () => {
  assert.equal(displayDate("2026-11-23"), "Nov 23, 2026");
  assert.equal(displayDate("2026-01-01"), "Jan 1, 2026");
});
