// Usage: node scripts/live-check.mjs [base]  — signs in on the hosted site via the user's Chrome (CDP).
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "https://bookpal-web.vercel.app";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const p = await b.contexts()[0].newPage();
await p.setViewportSize({ width: 1200, height: 850 });
await p.goto(base + "/library", { waitUntil: "networkidle" });
console.log("1 url:", p.url());
const btn = p.getByRole("button", { name: /google/i }).or(p.getByRole("link", { name: /google/i }));
if (await btn.count()) { await btn.first().click(); await p.waitForTimeout(8000); }
console.log("2 url:", p.url().split("?")[0]);
console.log("3 text:", (await p.locator("body").innerText()).slice(0, 300).replace(/\n+/g, " | "));
await p.screenshot({ path: "validation-artifacts/live-1.png" });
