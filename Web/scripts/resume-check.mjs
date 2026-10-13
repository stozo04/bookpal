import { chromium } from "@playwright/test";
const id = process.argv[2];
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = await browser.contexts()[0].newPage();
const posts = [];
page.on("response", (r) => r.url().includes("/progress") && posts.push(r.status()));
await page.setViewportSize({ width: 1280, height: 860 });
await page.goto(`http://localhost:3000/read/${id}`, { waitUntil: "networkidle" });
await page.waitForSelector("iframe");
await page.waitForTimeout(800);

await page.getByRole("button", { name: "Contents" }).waitFor();
await page.getByRole("button", { name: "Contents" }).click();
await page.locator("nav[aria-label=Contents] li button").nth(8).click(); // Chapter 5
await page.waitForTimeout(1200);
await page.evaluate(() => window.scrollTo({ top: 1400 }));
await page.waitForTimeout(3500); // debounce is 2s
const before = await page.evaluate(() => ({ y: Math.round(scrollY), chapter: document.querySelector("iframe").title, sub: document.querySelector("header div:nth-child(2)")?.textContent }));
console.log("before:", JSON.stringify(before), "saves:", posts);

await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("iframe");
await page.waitForTimeout(1800);
const after = await page.evaluate(() => ({ y: Math.round(scrollY), chapter: document.querySelector("iframe").title }));
console.log("after reload:", JSON.stringify(after));
await page.screenshot({ path: "validation-artifacts/reader-resumed.png" });
await page.close();
await browser.close();
