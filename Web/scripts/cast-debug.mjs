import { chromium } from "@playwright/test";
const id = process.argv[2];
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = await b.contexts()[0].newPage();
await page.setViewportSize({ width: 1280, height: 900 });
page.on("response", (r) => r.url().includes("/api/ai/characters") && console.log("  characters route responded", r.status()));
await page.goto(`http://localhost:3000/read/${id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
await page.getByRole("button", { name: "Book" }).click();
await page.getByRole("tab", { name: "Characters" }).click();
const t0 = Date.now();
await page.getByRole("button", { name: "Map the characters" }).click();
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(8000);
  const txt = (await page.locator("aside").innerText()).replace(/\s+/g, " ");
  const web = await page.locator("svg[aria-label^='Relationship web']").count();
  console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s  web=${web}  ${txt.slice(txt.indexOf("Who"), txt.indexOf("Who") + 220)}`);
  if (web || /couldn’t|Please try/.test(txt)) break;
}
await page.screenshot({ path: "validation-artifacts/cast-debug.png" });
await page.close(); await b.close();
