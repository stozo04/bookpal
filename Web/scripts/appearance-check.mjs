import { chromium } from "@playwright/test";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = b.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1100, height: 900 });
await page.emulateMedia({ colorScheme: "light" }); // system = light for this test
const check = (label, ok, detail) => console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  —  " + detail : ""}`);
const theme = () => page.evaluate(() => document.documentElement.dataset.theme ?? "(none)");
const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
await page.goto("http://localhost:3000/profile", { waitUntil: "networkidle" });
await page.screenshot({ path: "validation-artifacts/profile-appearance.png" });

await page.getByRole("radio", { name: /Dark/ }).click();
await page.waitForTimeout(600);
check("Dark applies at once", (await theme()) === "dark" && (await bg()) === "rgb(29, 29, 31)", `${await theme()} ${await bg()}`);
await page.reload({ waitUntil: "networkidle" });
check("Dark survives a reload (no flash: server rendered)", (await theme()) === "dark");
await page.screenshot({ path: "validation-artifacts/profile-dark.png" });

// another device: no cookie at all; the profile should restore it
await ctx.clearCookies({ name: "bookpal-appearance" });
await page.reload({ waitUntil: "networkidle" });
await page.waitForFunction(() => document.documentElement.dataset.theme === "dark", null, { timeout: 4000 }).catch(() => {});
check("a browser with no cookie recovers the choice from the profile", (await theme()) === "dark", await theme());

await page.getByRole("radio", { name: /Light/ }).click();
await page.waitForTimeout(500);
await page.reload({ waitUntil: "networkidle" });
check("Light is remembered", (await theme()) === "light" && (await bg()) === "rgb(255, 255, 255)");

await page.getByRole("radio", { name: /System/ }).click();
await page.waitForTimeout(500);
await page.reload({ waitUntil: "networkidle" });
check("System follows the device again", (await theme()) === "(none)" && (await bg()) === "rgb(255, 255, 255)");
await page.close(); await b.close();
