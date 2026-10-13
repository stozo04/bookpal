import { chromium } from "@playwright/test";
const id = process.argv[2];
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = await b.contexts()[0].newPage();
const aiCalls = [];
page.on("request", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/ai/") && !["status", "models"].includes(u.pathname.split("/").pop())) aiCalls.push(u.pathname.replace("/api/ai/", "")); });
page.on("console", (m) => m.type() === "error" && !/Blocked script/.test(m.text()) && console.log("  console error:", m.text().slice(0, 140)));
await page.setViewportSize({ width: 1280, height: 900 });
await page.emulateMedia({ colorScheme: "light" });
const check = (label, ok, detail) => console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  —  " + detail : ""}`);
const open = async () => { await page.goto(`http://localhost:3000/read/${id}`, { waitUntil: "networkidle" }); await page.waitForTimeout(2500); };
const toChapter5 = async () => {
  await page.getByRole("button", { name: "Contents" }).click();
  await page.locator("nav[aria-label=Contents] li button", { hasText: /^Chapter 5$/ }).click();
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo({ top: 1800 })); await page.waitForTimeout(700);
  await page.evaluate(() => window.scrollBy(0, -30)); await page.waitForTimeout(700);
};
const bookTab = async (tab) => { await page.getByRole("button", { name: "Book" }).click(); await page.getByRole("tab", { name: tab }).click(); };

// ---- 1. map the cast once
await open(); await toChapter5();
await bookTab("Characters");
let t = Date.now();
await page.getByRole("button", { name: "Map the characters" }).click();
await page.waitForSelector("svg[aria-label^='Relationship web']", { timeout: 420000 });
const n = await page.locator("ul li button[aria-pressed]").count();
check("cast mapped", n >= 4, `${((Date.now() - t) / 1000).toFixed(0)} s, ${n} characters`);
await page.screenshot({ path: "validation-artifacts/book-cast.png" });

// ---- 2. click a character: more detail, then the full profile
await page.locator("svg[aria-label^='Relationship web'] g[role=button]").first().click();
await page.waitForTimeout(500);
await page.screenshot({ path: "validation-artifacts/book-cast-selected.png" });
const name = (await page.locator("[aria-live=polite] > div").first().innerText()).split("·")[0].trim();
t = Date.now();
await page.getByRole("button", { name: /Full profile/ }).click();
await page.waitForSelector("article h3", { timeout: 240000 });
check(`full profile for ${name}`, true, `${((Date.now() - t) / 1000).toFixed(0)} s`);
const sections = await page.locator("article h3").allInnerTexts();
console.log("  sections:", sections.join(" | "));
await page.waitForTimeout(500);
await page.screenshot({ path: "validation-artifacts/book-profile.png" });

// ---- 3. a summary for this place
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "Ask" }).click();
await page.getByRole("button", { name: "Summarize up to here" }).click();
await page.waitForFunction(() => { const s = document.querySelector("section[aria-label='Story so far']"); return s && s.innerText.length > 300 && !document.querySelector("aside button")?.textContent?.includes("Stop"); }, null, { timeout: 300000 });
await page.waitForTimeout(2000);
check("summary made", true);
console.log("  model calls so far:", aiCalls.join(", "));
const firstRun = aiCalls.length;

// ---- 4. reload: everything is saved, so nothing should call the model
aiCalls.length = 0;
await open();
await bookTab("Characters");
await page.waitForSelector("svg[aria-label^='Relationship web']", { timeout: 10000 });
check("after a reload the cast is there instantly", true);
await page.locator("svg[aria-label^='Relationship web'] g[role=button]").first().click();
await page.getByRole("button", { name: /Open full profile/ }).click();
await page.waitForSelector("article h3", { timeout: 10000 });
check("and so is the full profile", (await page.locator("article h3").count()) > 0);
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "Ask" }).click();
await page.getByRole("button", { name: "Summarize up to here" }).click();
await page.waitForFunction(() => /Saved from earlier/.test(document.querySelector("section[aria-label='Story so far']")?.innerText ?? ""), null, { timeout: 15000 });
check("and the summary (no new reading)", true);
check("no model calls after the reload", aiCalls.length === 0, aiCalls.length ? aiCalls.join(", ") : `0 calls (the first pass used ${firstRun})`);
await page.close(); await b.close();
