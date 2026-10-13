import { chromium } from "@playwright/test";
const [epub, txt, scan, small] = process.argv.slice(2);
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = b.contexts()[0];
const errors = [];
const check = (label, ok, detail) => console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  —  " + detail : ""}`);
async function open(id) {
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && !/Blocked script execution/.test(m.text()) && errors.push(m.text().slice(0, 140)));
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto(`http://localhost:3000/read/${id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  return page;
}
async function search(page, q) {
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("searchbox").fill(q);
  await page.waitForFunction(() => /result|Nothing found/.test(document.querySelector("[aria-live=polite]")?.textContent ?? "") && !/Searching/.test(document.querySelector("[aria-live=polite]")?.textContent ?? ""), null, { timeout: 60000 });
  return (await page.locator("section[aria-label='Book search'] [aria-live=polite]").innerText()).trim();
}
const highlighted = (page, inFrame) => page.evaluate((f) => { const w = f ? document.querySelector("iframe").contentWindow : window; return w.CSS.highlights.get("bookpal-search")?.size ?? 0; }, inFrame);

// EPUB
let page = await open(epub);
const status = await search(page, "lobsters");
check("EPUB search finds matches", /\d+ result/.test(status), status);
const groups = await page.locator("section[aria-label='Book search'] li button").count();
await page.screenshot({ path: "validation-artifacts/search-epub.png" });
const before = await page.evaluate(() => document.querySelector("header")?.textContent);
await page.locator("section[aria-label='Book search'] li button").nth(Math.min(2, groups - 1)).click();
await page.waitForFunction(() => (document.querySelector("iframe")?.contentWindow.CSS.highlights.get("bookpal-search")?.size ?? 0) > 0, null, { timeout: 8000 }).catch(() => {});
check("choosing a result highlights it in the chapter", (await highlighted(page, true)) > 0, `${await highlighted(page, true)} highlighted`);
await page.screenshot({ path: "validation-artifacts/search-epub-hit.png" });
await page.close();

// TEXT
page = await open(txt);
const t = await search(page, "white rabbit");
check("text search finds matches", /\d+ result/.test(t), t);
await page.locator("section[aria-label='Book search'] li button").nth(5).click();
await page.waitForTimeout(1500);
check("text result is highlighted and in view", (await highlighted(page, false)) > 0, `${await highlighted(page, false)} highlighted, scrollY ${Math.round(await page.evaluate(() => scrollY))}`);
await page.screenshot({ path: "validation-artifacts/search-txt-hit.png" });
await page.close();

// small PDF with a real text layer
page = await open(small);
await page.waitForSelector(".textLayer span");
const p1 = await search(page, "page two");
check("PDF search finds text and names the page", /1 result/.test(p1), p1);
await page.locator("section[aria-label='Book search'] li button").first().click();
await page.waitForTimeout(1500);
check("PDF result is highlighted on its page", (await highlighted(page, false)) > 0, `${await highlighted(page, false)} highlighted`);
await page.screenshot({ path: "validation-artifacts/search-pdf-hit.png" });
await page.close();

// large scanned PDF: search must be cancellable and not freeze
page = await open(scan);
const t0 = Date.now();
await page.getByRole("button", { name: "Search" }).click();
await page.getByRole("searchbox").fill("alice");
await page.waitForFunction(() => /\d+ found|result/.test(document.querySelector("[aria-live=polite]")?.textContent ?? ""), null, { timeout: 60000 });
check("scanned 110-page PDF streams results", true, `first results after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await page.getByRole("searchbox").fill("");
await page.waitForTimeout(500);
check("clearing the box stops the search", /Type at least/.test(await page.locator("[aria-live=polite]").innerText()));
await page.close(); await b.close();
console.log(errors.length ? "console errors:\n" + errors.join("\n") : "no console errors");
