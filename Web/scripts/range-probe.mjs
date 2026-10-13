import { chromium } from "@playwright/test";
const id = process.argv[2];
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = await b.contexts()[0].newPage();
await page.goto("http://localhost:3000/settings", { waitUntil: "domcontentloaded" });
const out = await page.evaluate(async (id) => {
  const { url } = await (await fetch(`/api/files/${id}/download`)).json();
  const ranged = await fetch(url, { headers: { Range: "bytes=0-1023" } });
  const t0 = performance.now();
  const full = await fetch(url);
  const buf = await full.arrayBuffer();
  const secs = (performance.now() - t0) / 1000;
  return {
    rangedStatus: ranged.status, contentRange: ranged.headers.get("content-range"), acceptRanges: ranged.headers.get("accept-ranges"),
    exposed: ranged.headers.get("access-control-expose-headers"),
    fullMB: +(buf.byteLength / 1048576).toFixed(1), seconds: +secs.toFixed(1), mbps: +((buf.byteLength / 1048576) / secs).toFixed(1),
  };
}, id);
console.log(out);
await page.close(); await b.close();
