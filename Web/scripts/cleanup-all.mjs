import { chromium } from "@playwright/test";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = await b.contexts()[0].newPage();
await page.setViewportSize({ width: 1280, height: 860 });
const go = (p) => page.goto(`http://localhost:3000${p}`, { waitUntil: "networkidle" });
const dialog = () => page.getByRole("dialog");
async function removeBook(name) {
  await page.getByRole("button", { name: `Options for ${name}` }).click();
  await page.getByRole("menuitem", { name: "Remove from library…" }).click();
  await dialog().getByRole("textbox").fill("DELETE");
  await dialog().getByRole("button", { name: "Remove", exact: true }).click();
  await page.locator(`button[aria-label="Options for ${name}"]`).waitFor({ state: "detached" });
  console.log("removed", name);
}
await go("/library");
await page.getByRole("link", { name: "Open folder Sci-fi" }).click();
await page.waitForURL(/folder=/);
await removeBook("retry me");
await page.getByRole("button", { name: "Options for Accelerando" }).click();
await page.getByRole("menuitem", { name: "Move to…" }).click();
await dialog().getByLabel("Library").check();
await dialog().getByRole("button", { name: "Move" }).click();
await page.locator('button[aria-label="Options for Accelerando"]').waitFor({ state: "detached" });
console.log("moved Accelerando back to the top level");
// delete Cyberpunk, then Sci-fi
for (const name of ["Cyberpunk", "Sci-fi"]) {
  if (name === "Sci-fi") await go("/library");
  await page.getByRole("button", { name: `Options for folder ${name}` }).click();
  await page.getByRole("menuitem", { name: "Delete folder…" }).click();
  await dialog().getByRole("button", { name: "Delete" }).click();
  await page.locator(`button[aria-label="Options for folder ${name}"]`).waitFor({ state: "detached" });
  console.log("deleted folder", name);
}
await go("/library");
for (const n of ["two page", "alice wonderland scan", "alice wonderland"]) await removeBook(n);
await page.screenshot({ path: "validation-artifacts/library-clean.png" });
await page.close(); await b.close();
