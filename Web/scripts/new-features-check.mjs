// Continue reading, Catch me up, Define a word, Real covers. Usage: node scripts/new-features-check.mjs [base]
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://localhost:3000";
const check = (l, ok, d = "") => console.log(`${ok ? "PASS" : "FAIL"}  ${l}${d ? "  —  " + d : ""}`);
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = await b.contexts()[0].newPage();
await page.setViewportSize({ width: 1200, height: 900 });
let catchups = 0, defines = 0;
page.on("request", (r) => { if (r.url().includes("/api/ai/catchup")) catchups++; if (r.url().includes("/api/ai/define")) defines++; });

// 1. Continue reading row
await page.goto(base + "/library", { waitUntil: "networkidle" });
const row = page.getByRole("region", { name: "Continue reading" });
check("Continue reading row on the library", await row.count() === 1, (await row.innerText()).replace(/\s+/g, " ").slice(0, 120));
check("it offers Catch me up", await row.getByRole("link", { name: "Catch me up" }).count() === 1);
await page.screenshot({ path: "validation-artifacts/continue-row.png" });

// 2. Catch me up from the library link starts the recap on its own
let t = Date.now();
await row.getByRole("link", { name: "Catch me up" }).click();
await page.waitForURL(/catchup=1/);
await page.waitForSelector("section[aria-label='Catch me up'] details", { timeout: 120000 });
const card = page.locator("section[aria-label='Catch me up']").first();
const txt = (await card.innerText()).replace(/\s+/g, " ");
check("Catch me up recap appears", /Previously/i.test(txt) && /quick check/i.test(txt), `${((Date.now() - t) / 1000).toFixed(0)} s; ${txt.slice(0, 160)}`);
await card.locator("details summary").first().click();
check("quiz answer reveals", await card.locator("details[open] p").count() === 1);
await page.screenshot({ path: "validation-artifacts/catchup.png" });
const firstCalls = catchups;

// 3. Asking again is free
await page.getByRole("button", { name: "Catch me up" }).click();
await page.waitForFunction(() => document.querySelectorAll("section[aria-label='Catch me up']").length === 2, null, { timeout: 15000 });
check("second Catch me up uses the saved recap", catchups === firstCalls && /Saved from earlier/.test(await page.locator("section[aria-label='Catch me up']").last().innerText()), `${catchups} model call(s)`);

// 4. Define a selected word
await page.evaluate(() => {
  const d = document.querySelector("iframe").contentDocument;
  const p = [...d.querySelectorAll("p")].find((n) => n.textContent.trim().length > 120);
  const w = p.textContent.match(/\b[a-z]{8,}\b/i)[0];
  const walker = d.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode()); ) {
    const i = n.textContent.indexOf(w);
    if (i >= 0) { const r = d.createRange(); r.setStart(n, i); r.setEnd(n, i + w.length); const s = d.getSelection(); s.removeAllRanges(); s.addRange(r); window.__word = w; break; }
  }
});
const word = await page.evaluate(() => window.__word);
await page.waitForSelector("button:has-text('Define')", { timeout: 5000 });
t = Date.now();
await page.getByRole("button", { name: /^Define/ }).click();
await page.waitForSelector("section[aria-label='Definition'] p", { timeout: 60000 });
const def = (await page.locator("section[aria-label='Definition']").last().innerText()).replace(/\s+/g, " ");
check(`Define “${word}”`, def.length > 20, `${((Date.now() - t) / 1000).toFixed(0)} s; ${def.slice(0, 160)}`);
await page.screenshot({ path: "validation-artifacts/define.png" });
const d1 = defines;
await page.getByRole("button", { name: /^Define/ }).click();
await page.waitForFunction(() => document.querySelectorAll("section[aria-label='Definition']").length === 2, null, { timeout: 15000 });
check("same word again is saved", defines === d1 && /Looked up before/.test(await page.locator("section[aria-label='Definition']").last().innerText()));

// 5. Saved notes survive a reload
await page.goto(page.url().replace("?catchup=1", ""), { waitUntil: "networkidle" });
await page.mouse.move(600, 5);
await page.getByRole("button", { name: "Ask" }).click();
const c0 = catchups;
await page.getByRole("button", { name: "Catch me up" }).click();
await page.waitForSelector("section[aria-label='Catch me up']", { timeout: 15000 });
await page.waitForTimeout(1200);
check("after a reload the recap is still saved", catchups === c0 && /Saved from earlier/.test(await page.locator("section[aria-label='Catch me up']").first().innerText()));
await page.close();

// 6. Real covers in the editor
const p2 = await b.contexts()[0].newPage();
await p2.setViewportSize({ width: 1200, height: 900 });
await p2.goto(base + "/library", { waitUntil: "networkidle" });
await p2.getByRole("button", { name: /Options for/ }).first().click();
await p2.getByRole("menuitem", { name: "Edit details" }).click();
await p2.getByRole("button", { name: "Find real covers" }).click();
await p2.waitForSelector("button[aria-pressed] img[src*='/api/covers/image']", { timeout: 20000 });
const n = await p2.locator("img[src*='/api/covers/image']").count();
await p2.waitForTimeout(1500);
const loaded = await p2.locator("img[src*='/api/covers/image']").evaluateAll((els) => els.filter((e) => e.complete && e.naturalWidth > 20).length);
check("Open Library covers found", n > 0 && loaded > 0, `${n} found, ${loaded} loaded`);
const before = await p2.getByAltText("Cover preview").getAttribute("src");
await p2.locator("button[aria-pressed]:has(img[src*='/api/covers/image'])").first().click();
await p2.waitForFunction((was) => document.querySelector("img[alt='Cover preview']")?.getAttribute("src") !== was, before, { timeout: 15000 });
check("picking one previews it", true);
await p2.screenshot({ path: "validation-artifacts/real-covers.png" });
await p2.getByRole("button", { name: "Cancel" }).click();
await p2.close(); await b.close();
