import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowed } from "../src/lib/allowlist.ts";

const user = (email: string | undefined, over: Record<string, unknown> = {}) =>
  ({ id: "u", email, email_confirmed_at: "2026-01-01T00:00:00Z", identities: [], ...over }) as never;

test("admits an allowlisted, verified email, ignoring case and spaces", () => {
  process.env.ALLOWED_EMAILS = " Owner@Example.com , spouse@example.com ";
  assert.equal(isAllowed(user("owner@example.com")), true);
  assert.equal(isAllowed(user("SPOUSE@example.com")), true);
});

test("refuses an email that is not on the list", () => {
  process.env.ALLOWED_EMAILS = "owner@example.com";
  assert.equal(isAllowed(user("stranger@example.com")), false);
  assert.equal(isAllowed(user("owner@example.com.evil.test")), false);
  assert.equal(isAllowed(user("xowner@example.com")), false);
});

test("refuses an allowlisted email that is not verified", () => {
  process.env.ALLOWED_EMAILS = "owner@example.com";
  assert.equal(isAllowed(user("owner@example.com", { email_confirmed_at: null })), false);
});

test("fails closed: empty or missing list admits nobody", () => {
  process.env.ALLOWED_EMAILS = "";
  assert.equal(isAllowed(user("owner@example.com")), false);
  delete process.env.ALLOWED_EMAILS;
  assert.equal(isAllowed(user("owner@example.com")), false);
});

test("refuses no user and a user without an email", () => {
  process.env.ALLOWED_EMAILS = "owner@example.com";
  assert.equal(isAllowed(null), false);
  assert.equal(isAllowed(undefined), false);
  assert.equal(isAllowed(user(undefined)), false);
});
