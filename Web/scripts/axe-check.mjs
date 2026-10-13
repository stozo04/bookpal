import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const [epub, txt, pdf] = process.argv.slice(2);
const pages = [
  ["library", "/library"], ["upload", "/upload"], ["ai settings", "/ai-settings"], ["profile", "/profile"],
  ["reader: epub", `/read/${epub}`], ["reader: text", `/read/${txt}`], ["reader: pdf", `/read/${pdf}`],
];
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = b.contexts()[0];
let bad = 0;
for (const scheme of ["light", "dark"]) {
  for (const [name, path, signedOut] of pages) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(`http://localhost:3000${path}`, { waitUntil: "networkidle" });
    if (path.startsWith("/read/")) await page.waitForTimeout(2500);
    const result = await new AxeBuilder({ page }).exclude("iframe").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const found = result.violations.filter((v) => ["serious", "critical", "moderate"].includes(v.impact));
    console.log(`${found.length ? "ISSUES" : "clean "}  ${name} (${scheme})${found.length ? ": " + found.map((v) => `${v.id}[${v.impact}] x${v.nodes.length}`).join(", ") : ""}`);
    for (const v of found) for (const n of v.nodes.slice(0, 2)) console.log("          ", v.id, "→", n.target.join(" "), "|", (n.failureSummary ?? "").split("\n")[1]?.trim().slice(0, 110));
    bad += found.length;
    await page.close();
  }
}
console.log(bad ? `\n${bad} rule(s) with issues` : "\nno serious, critical or moderate issues");
await b.close();
