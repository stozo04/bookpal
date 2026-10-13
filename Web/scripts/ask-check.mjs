import { chromium } from "@playwright/test";
const id = process.argv[2];
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = await b.contexts()[0].newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && !/Blocked script execution/.test(m.text()) && errors.push(m.text().slice(0, 160)));
await page.setViewportSize({ width: 1280, height: 860 });
await page.goto(`http://localhost:3000/read/${id}`, { waitUntil: "networkidle" });
await page.waitForSelector("iframe"); await page.waitForTimeout(1500);
const check = (label, ok, detail) => console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  —  " + detail : ""}`);

// 1) section question
await page.getByRole("button", { name: "Ask" }).click();
await page.waitForSelector("[aria-label='Your question']");
const model = await page.locator("aside header").innerText();
console.log("panel header:", model.replace(/\s+/g, " "));
await page.screenshot({ path: "validation-artifacts/ask-empty.png" });
await page.getByLabel("Your question").fill("In two sentences, what is this section about?");
const t0 = Date.now();
await page.getByRole("button", { name: "Send" }).click();
await page.waitForFunction(() => document.querySelector("aside")?.textContent.includes("Thinking…") === false && [...document.querySelectorAll("aside div")].some((d) => d.className.includes("bot") && d.textContent.length > 20), null, { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector("aside button[type=button]:not([aria-label])")?.textContent?.includes("Stop"), null, { timeout: 120000 });
const answer1 = await page.locator("aside [class*=bot]").last().innerText();
check("section question gets an answer", answer1.length > 30, `${((Date.now() - t0) / 1000).toFixed(1)}s: "${answer1.replace(/\s+/g, " ").slice(0, 160)}…"`);
await page.screenshot({ path: "validation-artifacts/ask-answer.png" });

// 2) selection question: select text inside the sandboxed chapter, as a reader would
await page.evaluate(() => {
  const d = document.querySelector("iframe").contentDocument;
  const p = [...d.querySelectorAll("p, blockquote")].find((n) => n.textContent.trim().length > 40);
  const r = d.createRange(); r.selectNodeContents(p); const s = d.getSelection(); s.removeAllRanges(); s.addRange(r);
});
await page.waitForTimeout(900);
const quoted = await page.locator("aside [class*=quote]").count();
check("selected passage appears as the asking scope", quoted === 1, await page.locator("aside [class*=quote]").first().innerText().catch(() => "no quote shown"));
await page.getByLabel("Your question").fill("Explain this passage in one short sentence.");
await page.getByRole("button", { name: "Send" }).click();
await page.waitForFunction(() => document.querySelectorAll("aside [class*=bot]").length >= 2 && ![...document.querySelectorAll("aside button")].some((b) => b.textContent === "Stop"), null, { timeout: 120000 });
const answer2 = await page.locator("aside [class*=bot]").last().innerText();
check("selection question gets an answer", answer2.length > 10, `"${answer2.replace(/\s+/g, " ").slice(0, 160)}"`);
await page.screenshot({ path: "validation-artifacts/ask-selection.png" });

// 3) phone layout
await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(600);
await page.screenshot({ path: "validation-artifacts/ask-phone.png" });
console.log(errors.length ? "console errors:\n" + errors.join("\n") : "no console errors");
await page.close(); await b.close();
