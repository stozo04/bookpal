import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = await b.contexts()[0].newPage();
await page.goto("http://localhost:3000/ai-settings", { waitUntil: "domcontentloaded" });

const post = (path, body) => page.evaluate(async ([p, bd]) => {
  const r = await fetch(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(bd) });
  return { status: r.status, body: await r.text() };
}, [path, body]);

let t = Date.now();
const d = await post("/api/ai/describe", { title: "Accelerando", author: "Charles Stross" });
console.log("describe", d.status, `${((Date.now() - t) / 1000).toFixed(1)}s`, d.body.slice(0, 400));

t = Date.now();
const ill = await post("/api/ai/illustrate", { bookTitle: "Accelerando", passage: "It's a hot summer Tuesday, and he's standing in the plaza in front of Centraal Station with his eyeballs powered up and the sunlight jangling off the canal, motor scooters and kamikaze cyclists whizzing past and tourists chattering on every side." });
console.log("illustrate", ill.status, `${((Date.now() - t) / 1000).toFixed(1)}s`);
if (ill.status === 200) { const j = JSON.parse(ill.body); console.log("caption:", j.caption, "| svg bytes:", j.svg.length); writeFileSync("validation-artifacts/illustration.svg", j.svg); }
else console.log(ill.body.slice(0, 300));

t = Date.now();
const cov = await page.evaluate(async () => {
  const r = await fetch("/api/ai/covers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Accelerando", author: "Charles Stross" }) });
  const out = []; const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
  for (;;) { const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true });
    let cut; while ((cut = buf.indexOf("\n\n")) !== -1) { const block = buf.slice(0, cut); buf = buf.slice(cut + 2); const ev = block.match(/^event: (.*)$/m)?.[1]; const data = JSON.parse(block.match(/^data: (.*)$/m)?.[1] ?? "{}"); out.push({ ev, data, at: performance.now() }); } }
  return out;
});
console.log("covers", `${((Date.now() - t) / 1000).toFixed(1)}s`, cov.map((c) => `${c.ev}:${c.data.style ?? c.data.failures ?? ""}`).join(" "));
cov.filter((c) => c.ev === "cover").forEach((c) => writeFileSync(`validation-artifacts/cover-${c.data.style}.svg`, c.data.svg));
await page.close(); await b.close();
