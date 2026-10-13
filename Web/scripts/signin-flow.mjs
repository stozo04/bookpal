// Clicks "Continue with Google" in the signed-in Chrome and follows the flow.
import { chromium } from "@playwright/test";
const out = process.argv[2] ?? "validation-artifacts/signin-result.png";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = b.contexts()[0];
const p = await ctx.newPage();
await p.setViewportSize({ width: 1100, height: 760 });
await p.goto("http://localhost:3000/", { waitUntil: "networkidle" });
await p.getByRole("button", { name: "Continue with Google" }).click();
// Wait for either the app or a Google page that needs the person.
for (let i = 0; i < 40; i++) {
  await p.waitForTimeout(500);
  const u = new URL(p.url());
  if (u.hostname === "localhost" && !u.pathname.startsWith("/auth/")) break;
  if (u.hostname === "accounts.google.com") {
    const chooser = p.locator("[data-identifier]").first();
    if (await chooser.count()) { await chooser.click().catch(() => {}); }
    const cont = p.getByRole("button", { name: /^(Continue|Next|Allow)$/ });
    if (await cont.count()) { await cont.first().click().catch(() => {}); }
  }
}
await p.waitForLoadState("networkidle").catch(() => {});
const u = new URL(p.url());
console.log("final:", u.pathname + u.search, "| host:", u.hostname);
console.log("alert text:", (await p.locator("[role=alert]").allTextContents()).join(" ") || "(none)");
await p.screenshot({ path: out });
const cookies = (await ctx.cookies("http://localhost:3000")).filter((c) => c.name.startsWith("sb-"));
console.log("supabase session cookies present:", cookies.length);
await p.close(); await b.close();
