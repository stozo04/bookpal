// Drives the reader in the signed-in Chrome on :9222 and saves screenshots.
import { chromium } from "@playwright/test";
const id = process.argv[2];
const out = (n) => `validation-artifacts/${n}.png`;
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = await browser.contexts()[0].newPage();
const logs = [];
page.on("console", (m) => ["error", "warning"].includes(m.type()) && logs.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
const requests = [];
page.on("request", (r) => { const u = new URL(r.url()); if (!["localhost", "bqyfplifeyvkilkoneph.supabase.co"].includes(u.hostname) && u.protocol.startsWith("http")) requests.push(r.url()); });

await page.setViewportSize({ width: 1280, height: 860 });
await page.goto(`http://localhost:3000/read/${id}`, { waitUntil: "networkidle" });
await page.waitForSelector("iframe");
await page.waitForTimeout(800);

const frame = page.frameLocator("iframe");
const doc = await page.evaluate(() => {
  const d = document.querySelector("iframe").contentDocument;
  return {
    scripts: d.querySelectorAll("script").length,
    handlers: d.querySelectorAll("[onload],[onerror],[onclick]").length,
    jsLinks: [...d.querySelectorAll("a")].filter((a) => /^javascript:/i.test(a.getAttribute("href") ?? "")).length,
    remoteImgs: [...d.querySelectorAll("img")].filter((i) => !i.src.startsWith("blob:")).length,
    sandbox: document.querySelector("iframe").getAttribute("sandbox"),
  };
});
console.log("iframe audit:", JSON.stringify(doc));

// Contents drawer
await page.getByRole("button", { name: "Contents" }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: out("reader-contents") });
const entries = await page.locator("nav[aria-label=Contents] li button").allTextContents();
console.log("toc entries:", entries.length, entries.slice(0, 6));
await page.keyboard.press("Escape");

// Jump to a later chapter via the contents list
await page.getByRole("button", { name: "Contents" }).click();
await page.locator("nav[aria-label=Contents] li button").nth(Math.min(3, entries.length - 1)).click();
await page.waitForTimeout(900);
await page.screenshot({ path: out("reader-chapter") });

// Appearance: dark + larger
await page.getByRole("button", { name: "Appearance" }).click();
await page.getByRole("button", { name: "Dark" }).click();
await page.getByRole("button", { name: "Larger text" }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: out("reader-appearance-dark") });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await page.screenshot({ path: out("reader-dark") });

// Phone
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(700);
await page.screenshot({ path: out("reader-phone") });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
console.log("phone horizontal overflow:", overflow);

console.log("remote requests:", requests.length ? requests : "none");
console.log(logs.length ? logs.join("\n") : "no console errors");
await page.close();
await browser.close();
