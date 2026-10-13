// Generates small synthetic upload fixtures. Nothing here is copyrighted.
import { mkdirSync, writeFileSync } from "node:fs";
const dir = process.argv[2] ?? "tests/fixtures";
mkdirSync(dir, { recursive: true });

writeFileSync(`${dir}/hello.txt`, "BookPal test — Héllo, wörld ✓ 日本語\n\nA second paragraph for the reader.\n", "utf8");
writeFileSync(`${dir}/empty.txt`, "");
writeFileSync(`${dir}/binary.txt`, Buffer.from([0x68, 0x69, 0x00, 0x01, 0x02, 0xff, 0xfe, 0x00]));
writeFileSync(`${dir}/fake.pdf`, Buffer.concat([Buffer.from("MZ"), Buffer.alloc(200, 0x90)])); // executable header, not a PDF
writeFileSync(`${dir}/retry-me.txt`, "This file is uploaded after a simulated network failure.\n");

// A valid two-page PDF with real xref offsets.
const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 7 0 R >> >> >>",
  streamObj("BT /F1 28 Tf 72 700 Td (BookPal test PDF - page one) Tj ET"),
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>",
  streamObj("BT /F1 28 Tf 72 700 Td (Page two) Tj ET"),
  "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>",
];
function streamObj(text) { return `<< /Length ${text.length} >>\nstream\n${text}\nendstream`; }
let pdf = "%PDF-1.4\n";
const offsets = [];
objects.forEach((body, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
const xref = pdf.length;
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
writeFileSync(`${dir}/two-page.pdf`, pdf, "latin1");
console.log("fixtures written to", dir);
