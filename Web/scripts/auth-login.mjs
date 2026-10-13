// One-time: opens a real browser so the owner can sign in with Google, then
// saves the session to .auth/state.json (git-ignored; treat as a secret).
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.env.BASE_URL ?? "http://localhost:3000";
mkdirSync(".auth", { recursive: true });
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await context.newPage();
await page.goto(base);
console.log("Sign in with Google in the opened window…");
await page.waitForURL("**/library", { timeout: 5 * 60_000 });
await context.storageState({ path: ".auth/state.json" });
console.log("Saved .auth/state.json");
await browser.close();
