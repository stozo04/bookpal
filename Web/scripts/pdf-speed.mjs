import { chromium } from "@playwright/test";
const id = process.argv[2];
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = await b.contexts()[0].newPage();
await page.setViewportSize({ width: 1280, height: 860 });
let ranged = 0, bytes = 0;
page.on("response", async (r) => { if (r.url().includes("/storage/v1/object/sign/")) { ranged += r.status() === 206 ? 1 : 0; const len = Number(r.headers()["content-length"] ?? 0); bytes += len; } });
for (const run of [1, 2]) {
  ranged = 0; bytes = 0;
  const t0 = Date.now();
  await page.goto(`http://localhost:3000/read/${id}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => [...document.querySelectorAll("canvas")].some((c) => c.width > 0), null, { timeout: 90000 });
  console.log(`run ${run}: first page after ${((Date.now() - t0) / 1000).toFixed(1)} s; partial (206) responses: ${ranged}`);
  await page.waitForTimeout(1500);
}
await page.close(); await b.close();
