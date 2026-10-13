import { chromium } from "@playwright/test";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = await b.contexts()[0].newPage();
await page.setViewportSize({ width: 1100, height: 900 });
await page.goto("http://localhost:3000/library", { waitUntil: "networkidle" });
const check = (label, ok, detail) => console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  —  " + detail : ""}`);
const card = (t) => page.locator("li", { hasText: t }).filter({ has: page.locator('button[aria-label^="Options for"]') });

// Rename
await card("hello").first().hover();
await page.getByRole("button", { name: "Options for hello" }).click();
await page.getByRole("menuitem", { name: "Rename…" }).click();
await page.screenshot({ path: "validation-artifacts/rename-dialog.png" });
await page.getByRole("dialog").getByRole("textbox").fill("Hello, renamed");
await page.getByRole("button", { name: "Save" }).click();
await page.getByText("Hello, renamed").first().waitFor({ timeout: 10000 });
check("rename shows on the shelf", true);
await page.reload({ waitUntil: "networkidle" });
check("rename persists after reload", (await page.getByText("Hello, renamed").count()) > 0);

// Delete needs the typed confirmation
await page.getByRole("button", { name: "Options for Hello, renamed" }).click();
await page.getByRole("menuitem", { name: "Remove from library…" }).click();
const remove = page.getByRole("button", { name: "Remove", exact: true });
check("Remove is disabled until DELETE is typed", await remove.isDisabled());
await page.screenshot({ path: "validation-artifacts/delete-dialog.png" });
await page.getByRole("dialog").getByRole("textbox").fill("delete");
check("lowercase 'delete' does not unlock it", await remove.isDisabled());
await page.getByRole("dialog").getByRole("textbox").fill("DELETE");
await remove.click();
await page.getByText("Hello, renamed").waitFor({ state: "detached", timeout: 10000 });
check("delete removes it from the shelf", true);

for (const t of ["two-page", "retry-me"]) {
  await page.getByRole("button", { name: `Options for ${t}` }).click();
  await page.getByRole("menuitem", { name: "Remove from library…" }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("DELETE");
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByText(t, { exact: true }).first().waitFor({ state: "detached", timeout: 10000 });
}
check("test books removed", (await page.locator("li").filter({ has: page.locator('button[aria-label^="Options for"]') }).count()) === 1);
await page.screenshot({ path: "validation-artifacts/library-after-cleanup.png" });
await page.close(); await b.close();
