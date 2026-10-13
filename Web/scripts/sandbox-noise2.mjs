import { chromium } from "@playwright/test";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
async function trial(name, html) {
  const page = await ctx.newPage();
  const seen = [];
  page.on("console", (m) => seen.push(m.text().slice(0, 90)));
  await page.goto("http://localhost:3000/robots.txt"); // a real http origin, no app code
  await page.setContent(html);
  await page.waitForTimeout(800);
  console.log(name.padEnd(34), seen.length ? seen : "no messages");
  await page.close();
}
await trial("blank sandboxed iframe (CDP)", '<iframe sandbox="allow-same-origin" srcdoc="<p>hi</p>"></iframe>');
await trial("with CSP meta like the reader", `<iframe sandbox="allow-same-origin" srcdoc="<meta http-equiv='Content-Security-Policy' content=&quot;default-src 'none'; style-src 'unsafe-inline'&quot;><p>hi</p>"></iframe>`);
await trial("no sandbox attribute", '<iframe srcdoc="<p>hi</p>"></iframe>');
await browser.close();
