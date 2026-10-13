import { chromium } from "@playwright/test";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
for (const ctx of browser.contexts()) for (const p of ctx.pages()) console.log(p.url());
await browser.close();
