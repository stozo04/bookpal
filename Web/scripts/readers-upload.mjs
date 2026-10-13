import { chromium } from "@playwright/test";
const files = ["/private/tmp/claude-501/-Users-gates-Projects-reader-source/b3bfbf02-60b9-4bc1-93bb-14da5cdfce46/scratchpad/corpus/alice-wonderland.txt", "/private/tmp/claude-501/-Users-gates-Projects-reader-source/b3bfbf02-60b9-4bc1-93bb-14da5cdfce46/scratchpad/corpus/alice-wonderland-scan.pdf", "tests/fixtures/two-page.pdf"];
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = await b.contexts()[0].newPage();
await page.setViewportSize({ width: 1100, height: 900 });
await page.goto("http://localhost:3000/upload", { waitUntil: "networkidle" });
await page.locator("input[type=file]").setInputFiles(files);
await page.waitForFunction(() => {
  const rows = [...document.querySelectorAll("li[data-state]")];
  return rows.length === 3 && rows.every((r) => ["done", "duplicate", "failed"].includes(r.getAttribute("data-state")));
}, null, { timeout: 180000 });
for (const r of await page.locator("li[data-state]").all()) console.log((await r.innerText()).replace(/\s+/g, " "));
await page.screenshot({ path: "validation-artifacts/upload-three.png" });
await page.close(); await b.close();
