import { chromium } from "@playwright/test";
const F = "tests/fixtures";
const BIG = process.argv[2];
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

// 1. A text file and a PDF upload together
await input.setInputFiles([`${F}/hello.txt`, `${F}/two-page.pdf`]);
await Promise.all([settled("hello"), settled("two-page")]);
let t1 = await rowText("hello"), t2 = await rowText("two-page");
check("text file uploads", t1.includes("On your shelf"), t1);
check("PDF uploads", t2.includes("On your shelf"), t2);
await page.screenshot({ path: "validation-artifacts/upload-done.png" });

// 2. The same text file again is a duplicate
await input.setInputFiles(`${F}/hello.txt`);
await page.waitForFunction(() => document.querySelectorAll("li[data-state=duplicate]").length >= 1, null, { timeout: 30000 });
check("same file twice is detected", (await rowText("hello")).includes("Already on your shelf") || (await rows().allInnerTexts()).some((x) => x.includes("Already on your shelf")), "Already on your shelf");

// 3. Bad files are refused with a friendly message
await input.setInputFiles([`${F}/fake.pdf`, `${F}/binary.txt`, `${F}/empty.txt`]);
await Promise.all([settled("fake"), settled("binary"), settled("empty")]);
const fake = await rowText("fake"), bin = await rowText("binary"), empty = await rowText("empty");
check("executable renamed .pdf is refused", /doesn.t look like/.test(fake), fake);
check("binary renamed .txt is refused", /doesn.t look like/.test(bin), bin);
check("empty file is refused", /empty/i.test(empty), empty);
await page.screenshot({ path: "validation-artifacts/upload-refused.png" });

// 4. Oversize file
if (BIG) {
  await input.setInputFiles(BIG);
  await settled("big");
  const big = await rowText("big");
  check("oversize file is refused", /larger than/.test(big), big);
}

// 5. Network drops mid-upload, then retry succeeds with no duplicate
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
