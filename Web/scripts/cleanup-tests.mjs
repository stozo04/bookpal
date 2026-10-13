import { chromium } from "@playwright/test";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = await b.contexts()[0].newPage();
await page.setViewportSize({ width: 1100, height: 900 });
await page.goto("http://localhost:3000/library", { waitUntil: "networkidle" });
for (const t of ["two page", "alice wonderland scan", "alice wonderland"]) {
  await page.getByRole("button", { name: `Options for ${t}` }).click();
  await page.getByRole("menuitem", { name: "Remove from library…" }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("DELETE");
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.locator(`button[aria-label="Options for ${t}"]`).waitFor({ state: "detached", timeout: 10000 });
  console.log("removed", t);
}
await page.screenshot({ path: "validation-artifacts/library-after-cleanup.png" });
await page.close(); await b.close();
