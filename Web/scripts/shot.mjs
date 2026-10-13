// Usage: node scripts/shot.mjs <path> <out.png> [width] [height] [dark]
// Attaches to the signed-in Chrome on :9222 and screenshots one page in a new tab.
import { chromium } from "@playwright/test";
const [path = "/library", out = "validation-artifacts/shot.png", w = "1280", h = "860", scheme = "light"] = process.argv.slice(2);
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0];
const page = await context.newPage();
await page.setViewportSize({ width: +w, height: +h });
await page.emulateMedia({ colorScheme: scheme });
const logs = [];
page.on("console", (m) => ["error", "warning"].includes(m.type()) && logs.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
await page.goto(`http://localhost:3000${path}`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await page.screenshot({ path: out, fullPage: false });
console.log("url:", page.url());
if (logs.length) console.log(logs.join("\n"));
await page.close();
await browser.close();
