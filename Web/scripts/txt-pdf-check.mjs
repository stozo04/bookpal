import { chromium } from "@playwright/test";
const [txtId, pdfId, smallId] = process.argv.slice(2);
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = b.contexts()[0];
const check = (label, ok, detail) => console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  —  " + detail : ""}`);
const errors = [];
async function open(id, w = 1280, h = 860) {
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && !/Blocked script execution/.test(m.text()) && errors.push(m.text().slice(0, 140)));
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`http://localhost:3000/read/${id}`, { waitUntil: "networkidle" });
  return page;
}

// ---- TEXT ----
let page = await open(txtId);
await page.waitForSelector("article p", { timeout: 20000 });
await page.waitForTimeout(500);
const paras = await page.locator("article p").count();
check("text book renders paragraphs", paras > 50, `${paras} paragraphs rendered first`);
await page.screenshot({ path: "validation-artifacts/txt-1.png" });
await page.evaluate(() => window.scrollTo({ top: 9000 }));
await page.waitForTimeout(3500);
const txtBefore = await page.evaluate(() => Math.round(scrollY));
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("article p"); await page.waitForTimeout(1500);
const txtAfter = await page.evaluate(() => Math.round(scrollY));
check("text place is saved and restored", Math.abs(txtAfter - txtBefore) < 120, `before ${txtBefore}px, after reload ${txtAfter}px`);
await page.screenshot({ path: "validation-artifacts/txt-resumed.png" });
await page.close();

// ---- SMALL PDF (text-based) ----
page = await open(smallId);
await page.waitForSelector("canvas", { timeout: 20000 }); await page.waitForTimeout(1500);
const spans = await page.locator(".textLayer span").count();
const words = (await page.locator(".textLayer").allInnerTexts()).join(" ");
check("small PDF renders with a selectable text layer", spans > 0 && /BookPal test PDF/.test(words), `${spans} text spans; reads: "${words.replace(/\s+/g, " ").slice(0, 40)}"`);
await page.screenshot({ path: "validation-artifacts/pdf-small.png" });
await page.close();

// ---- SCANNED PDF (25 MB) ----
const t0 = Date.now();
page = await open(pdfId);
await page.waitForFunction(() => [...document.querySelectorAll("canvas")].some((c) => c.width > 0), null, { timeout: 60000 });
check("first page of 24 MB scan is visible", true, `${((Date.now() - t0) / 1000).toFixed(1)} s from navigation`);
await page.waitForTimeout(800);
const total = await page.locator("[data-page]").count();
const drawn = await page.evaluate(() => [...document.querySelectorAll("canvas")].filter((c) => c.width > 0).length);
check("pages render lazily, not all at once", drawn < total, `${drawn} of ${total} pages drawn`);
await page.screenshot({ path: "validation-artifacts/pdf-1.png" });
console.log("subtitle:", await page.locator("header").first().innerText().then((t) => t.replace(/\s+/g, " ")));

// scroll deep, wait for save, reload
await page.evaluate(() => window.scrollTo({ top: 9000 }));
await page.waitForTimeout(3500);
const pBefore = await page.evaluate(() => document.querySelector("header")?.textContent.match(/Page (\d+) of (\d+)/)?.slice(1).join("/"));
await page.reload({ waitUntil: "networkidle" });
await page.waitForFunction(() => [...document.querySelectorAll("canvas")].some((c) => c.width > 0), null, { timeout: 60000 }); await page.waitForTimeout(2500);
const pAfter = await page.evaluate(() => document.querySelector("header")?.textContent.match(/Page (\d+) of (\d+)/)?.slice(1).join("/"));
check("PDF place is saved and restored", pBefore === pAfter && pBefore !== `1/${total}`, `before ${pBefore}, after reload ${pAfter}`);

// zoom keeps the page
await page.evaluate(() => window.scrollTo({ top: 0 })); await page.waitForTimeout(400);
await page.getByRole("button", { name: "Appearance" }).click();
await page.getByRole("button", { name: "Zoom in" }).click(); await page.getByRole("button", { name: "Zoom in" }).click();
await page.waitForTimeout(900);
await page.screenshot({ path: "validation-artifacts/pdf-zoom.png" });
await page.getByRole("button", { name: "Dark" }).click(); await page.waitForTimeout(500);
await page.keyboard.press("Escape"); await page.waitForTimeout(400);
await page.screenshot({ path: "validation-artifacts/pdf-dark.png" });
await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(1200);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check("zoomed PDF does not overflow the page at 390px", !overflow);
await page.evaluate(() => { localStorage.removeItem("bookpal:reader-zoom"); localStorage.removeItem("bookpal:reader-size"); localStorage.removeItem("bookpal:reader-prefs"); });
await page.screenshot({ path: "validation-artifacts/pdf-phone.png" });
await page.close(); await b.close();
console.log(errors.length ? "console errors:\n" + errors.join("\n") : "no console errors");
