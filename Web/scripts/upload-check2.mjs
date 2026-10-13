import { chromium } from "@playwright/test";
const F = "tests/fixtures";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = await b.contexts()[0].newPage();
await page.setViewportSize({ width: 1100, height: 900 });
await page.goto("http://localhost:3000/settings", { waitUntil: "networkidle" });
const input = page.locator("input[type=file]");
const rows = () => page.locator("li[data-state]");
const rowText = async (name) => (await rows().filter({ hasText: name }).first().innerText()).replace(/\s+/g, " ").trim();
const settled = (name) => page.waitForFunction((n) => {
  const li = [...document.querySelectorAll("li[data-state]")].find((e) => e.textContent.includes(n));
  return li && ["done", "duplicate", "failed"].includes(li.getAttribute("data-state"));
}, name, { timeout: 60000 });
const check = (label, ok, detail) => console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  —  " + detail : ""}`);

// Oversize: build a 51 MB text file inside the page (cannot be pushed over CDP).
await page.evaluate(() => {
  const file = new File([new Uint8Array(51 * 1024 * 1024).fill(97)], "big.txt", { type: "text/plain" });
  const dt = new DataTransfer(); dt.items.add(file);
  const el = document.querySelector("input[type=file]");
  el.files = dt.files; el.dispatchEvent(new Event("change", { bubbles: true }));
});
await settled("big");
const big = await rowText("big");
check("oversize file is refused", /larger than/.test(big), big);
check("refusals offer no pointless retry", (await rows().filter({ hasText: "big" }).first().getByRole("button", { name: "Try again" }).count()) === 0);

// Network drops mid-upload, then retry succeeds with no duplicate
let aborted = 0;
await page.route(/\/storage\/v1\/object\/upload\/sign\//, (route) => (aborted++ === 0 ? route.abort() : route.continue()));
await input.setInputFiles(`${F}/retry-me.txt`);
await settled("retry-me");
const dropped = await rowText("retry-me");
check("network failure is reported calmly", /connection dropped/i.test(dropped), dropped);
await rows().filter({ hasText: "retry-me" }).first().getByRole("button", { name: "Try again" }).click();
await settled("retry-me");
const retried = await rowText("retry-me");
check("retry succeeds", retried.includes("On your shelf"), retried);
await page.screenshot({ path: "validation-artifacts/upload-retry.png" });
await page.close(); await b.close();
