// Does Playwright itself cause "Blocked script execution in about:srcdoc"?
import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage();
const seen = [];
page.on("console", (m) => seen.push(m.text()));
await page.setContent('<iframe sandbox="allow-same-origin" srcdoc="<p>plain text, no script</p>"></iframe>');
await page.waitForTimeout(800);
console.log("blank sandboxed iframe, no scripts anywhere:", seen.length ? seen : "no messages");
await browser.close();
