// Opens the reader in an extension-free Chromium using the session cookie from
// the signed-in Chrome (kept in memory only), and reports console errors.
import { chromium } from "@playwright/test";
const id = process.argv[2];
const real = await chromium.connectOverCDP("http://127.0.0.1:9222");
const cookies = await real.contexts()[0].cookies("http://localhost:3000");
await real.close();

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
await context.addCookies(cookies);
const page = await context.newPage();
const errors = [];
page.on("console", (m) => ["error", "warning"].includes(m.type()) && errors.push(`${m.type()}: ${m.text().slice(0, 100)}`));
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(`http://localhost:3000/read/${id}`, { waitUntil: "networkidle" });
await page.waitForSelector("iframe");
await page.waitForTimeout(1500);
console.log("signed in:", !page.url().endsWith("/"), "| iframe title:", await page.locator("iframe").getAttribute("title"));
console.log("clean Chromium console:", errors.length ? errors : "no errors or warnings");
await browser.close();
