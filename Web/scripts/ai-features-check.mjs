import { chromium } from "@playwright/test";
const id = process.argv[2];
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = await b.contexts()[0].newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && !/Blocked script execution/.test(m.text()) && errors.push(m.text().slice(0, 160)));
await page.setViewportSize({ width: 1280, height: 900 });
await page.emulateMedia({ colorScheme: "light" });
const check = (label, ok, detail) => console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  —  " + detail : ""}`);
await page.goto(`http://localhost:3000/read/${id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
// Go to a real chapter, partway down, so there is story behind the reader.
await page.getByRole("button", { name: "Contents" }).click();
await page.locator("nav[aria-label=Contents] li button", { hasText: /^Chapter 5$/ }).click();
await page.waitForTimeout(1500);
await page.evaluate(() => window.scrollTo({ top: 1800 }));
await page.waitForTimeout(800);
await page.evaluate(() => window.scrollBy(0, -30)); // scrolling up brings the bar back
await page.waitForTimeout(800);
const where = await page.evaluate(() => document.querySelector("header")?.innerText.replace(/\s+/g, " "));
console.log("reading position:", where);

// ---- Summarize up to here
await page.getByRole("button", { name: "Ask" }).click();
await page.waitForSelector("aside [aria-label='Your question']");
let t = Date.now();
await page.getByRole("button", { name: "Summarize up to here" }).click();
await page.waitForSelector("section[aria-label='Story so far']");
const statuses = new Set();
for (let i = 0; i < 300; i++) {
  const txt = await page.locator("section[aria-label='Story so far']").innerText();
  const stopped = (await page.getByRole("button", { name: "Stop" }).count()) === 0;
  if (/Reading|Gathering|Writing/.test(txt) && txt.length < 200) statuses.add(txt.split("\n").pop());
  if (stopped && txt.length > 250) break;
  await page.waitForTimeout(1000);
}
const summary = await page.locator("section[aria-label='Story so far']").innerText();
check("summary of everything read so far", summary.length > 400, `${((Date.now() - t) / 1000).toFixed(0)} s; progress shown: ${[...statuses].slice(0, 4).join(" | ")}`);
console.log("  ", summary.replace(/\s+/g, " ").slice(0, 420), "…");
await page.screenshot({ path: "validation-artifacts/ask-summary.png" });

// ---- asking again is free (saved per position)
await page.getByRole("button", { name: "Summarize up to here" }).click();
await page.waitForFunction(() => document.querySelectorAll("section[aria-label='Story so far']").length === 2, null, { timeout: 15000 });
await page.waitForTimeout(800);
const second = await page.locator("section[aria-label='Story so far']").last().innerText();
check("asking again uses the saved summary", /Saved from earlier/.test(second));

// ---- Illustrate a selected passage
await page.evaluate(() => {
  const d = document.querySelector("iframe").contentDocument;
  const p = [...d.querySelectorAll("p")].find((n) => n.textContent.trim().length > 120);
  const r = d.createRange(); r.selectNodeContents(p); const s = d.getSelection(); s.removeAllRanges(); s.addRange(r);
});
await page.waitForSelector("button:has-text('Illustrate selection')", { timeout: 5000 });
t = Date.now();
await page.getByRole("button", { name: "Illustrate selection" }).click();
await page.waitForSelector("figure img", { timeout: 180000 });
check("illustration of the selected passage", true, `${((Date.now() - t) / 1000).toFixed(0)} s`);
await page.waitForTimeout(800);
await page.screenshot({ path: "validation-artifacts/ask-illustration.png" });
await page.keyboard.press("Escape");

// ---- Characters
await page.getByRole("button", { name: "Book" }).click();
await page.getByRole("tab", { name: "Characters" }).click();
await page.screenshot({ path: "validation-artifacts/book-cast-empty.png" });
t = Date.now();
await page.getByRole("button", { name: "Map the characters" }).click();
await page.waitForSelector("svg[aria-label^='Relationship web']", { timeout: 300000 });
const count = await page.locator("ul li button[aria-pressed]").count();
check("character map with relationships", count >= 3, `${((Date.now() - t) / 1000).toFixed(0)} s, ${count} characters`);
await page.waitForTimeout(600);
await page.screenshot({ path: "validation-artifacts/book-cast.png" });
await page.locator("svg[aria-label^='Relationship web'] g[role=button]").first().click();
await page.waitForTimeout(500);
check("choosing a character shows who they are and how they relate", (await page.locator("[aria-live=polite] p").count()) > 0);
await page.screenshot({ path: "validation-artifacts/book-cast-selected.png" });
await page.getByRole("tab", { name: "About" }).click();
await page.screenshot({ path: "validation-artifacts/book-about.png" });
console.log(errors.length ? "console errors:\n" + errors.join("\n") : "no console errors");
await page.close(); await b.close();
