import { chromium } from "@playwright/test";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = b.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1280, height: 900 });
await page.emulateMedia({ colorScheme: "light" });
const check = (label, ok, detail) => console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  —  " + detail : ""}`);
const dialog = () => page.getByRole("dialog");
await page.goto("http://localhost:3000/library", { waitUntil: "networkidle" });
await page.waitForTimeout(1500); // let the embedded cover load from the cache

await page.getByRole("button", { name: "Options for Accelerando" }).click();
await page.getByRole("menuitem", { name: "Edit details…" }).click();
await dialog().getByLabel("Title").waitFor();
check("editor opens with the book's own cover as preview", (await dialog().locator("img[alt='Cover preview']").count()) === 1);
await page.screenshot({ path: "validation-artifacts/editor-open.png" });

// description drafted by the model
await dialog().getByRole("button", { name: "Draft with AI" }).click();
await page.waitForFunction(() => document.querySelector("dialog textarea")?.value.length > 30, null, { timeout: 60000 });
const desc = await dialog().locator("textarea").inputValue();
check("Draft with AI fills the description", desc.length > 30, desc.slice(0, 90) + "…");

// four cover ideas stream in
const t0 = Date.now();
await dialog().getByRole("button", { name: "Suggest covers" }).click();
await page.waitForFunction(() => document.querySelectorAll("dialog button[aria-pressed] img").length >= 1, null, { timeout: 120000 });
console.log(`first design after ${((Date.now() - t0) / 1000).toFixed(0)} s`);
await page.waitForFunction(() => document.querySelectorAll("dialog button[aria-pressed] img").length === 4, null, { timeout: 150000 });
check("four cover designs arrive", true, `${((Date.now() - t0) / 1000).toFixed(0)} s for all four`);
await page.screenshot({ path: "validation-artifacts/editor-covers.png" });

// choose the vintage one: the preview changes
const before = await dialog().locator("img[alt='Cover preview']").getAttribute("src");
await dialog().getByRole("button", { name: /Vintage cover idea/ }).click();
await page.waitForFunction((prev) => document.querySelector("dialog img[alt='Cover preview']")?.getAttribute("src") !== prev, before, { timeout: 15000 });
check("choosing a design updates the preview", true);
await page.screenshot({ path: "validation-artifacts/editor-chosen.png" });

await dialog().getByRole("button", { name: "Save" }).click();
await dialog().waitFor({ state: "hidden", timeout: 20000 });
await page.waitForTimeout(1500);
const shelfCover = await page.locator("li img[src*='/cover?v=']").count();
check("the shelf shows the new cover", shelfCover === 1);
await page.screenshot({ path: "validation-artifacts/library-custom-cover.png" });
const res = await page.evaluate(async () => { const id = document.querySelector("a[href^='/read/']").getAttribute("href").split("/").pop(); const r = await fetch(`/api/files/${id}/cover`); return { status: r.status, type: r.headers.get("content-type"), bytes: (await r.arrayBuffer()).byteLength }; });
check("the cover is served to the owner as a JPEG", res.status === 200 && res.type === "image/jpeg", JSON.stringify(res));
await page.close(); await b.close();
