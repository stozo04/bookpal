import { chromium } from "@playwright/test";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const p = await b.contexts()[0].newPage();
await p.goto("http://localhost:3000/ai-settings", { waitUntil: "networkidle" });
const r = await p.evaluate(async () => {
  const s = await (await fetch("/api/ai/status", { cache: "no-store" })).json();
  let put = null;
  if (s.selection) put = (await fetch("/api/ai/selection", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(s.selection) })).status;
  const s2 = await (await fetch("/api/ai/status", { cache: "no-store" })).json();
  return { connected: s.connected, canConnect: s.canConnect, selection: !!s.selection, put, after: s2.connected };
});
console.log(r);
await p.close(); await b.close();
