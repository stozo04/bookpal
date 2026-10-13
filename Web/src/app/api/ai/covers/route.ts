import { NextResponse } from "next/server";
import { aiBody, z } from "@/lib/ai/guardjson";
import { AiError, sseResponse, text } from "@/lib/ai/run";

const schema = z.object({ title: z.string().min(1).max(500), author: z.string().max(300).optional(), description: z.string().max(1500).optional() });

const STYLES = [
  { id: "typographic", hint: "Minimal typographic cover: generous whitespace, one small geometric motif, a refined serif title." },
  { id: "illustrated", hint: "Illustrated cover: one bold flat illustration of an image or setting the title suggests, with the title set in an elegant serif." },
  { id: "geometric", hint: "Abstract geometric cover: layered shapes in a limited palette, with a clean modern title." },
  { id: "vintage", hint: "Vintage paperback cover: a banded layout, a mid-century palette, and classic serif lettering." },
];

const INSTRUCTIONS = (title: string, author: string | undefined, hint: string, description?: string) => `You design book covers as SVG.
Design a cover for "${title}"${author ? ` by ${author}` : ""}.${description ? ` About the book: ${description}` : ""}
Style: ${hint}
Rules: a single <svg> with viewBox="0 0 600 900"; the exact title${author ? " and the exact author name" : ""} as <text> in font-family "Georgia, serif", centered with text-anchor="middle", split into <tspan> lines so nothing runs past 520 units wide, with strong contrast; a palette of 3 to 5 harmonious colors; no <script>, <image>, <foreignObject> or external references; under 8 KB.
Reply with ONLY the SVG markup.`;

export async function POST(request: Request) {
  const opened = await aiBody(request, schema);
  if (opened instanceof NextResponse) return opened;
  const { owner, input } = opened;

  return sseResponse(async (send, signal) => {
    let failures = 0;
    await Promise.all(STYLES.map(async (style, index) => {
      try {
        const raw = await text(owner.userId, {
          instructions: INSTRUCTIONS(input.title, input.author?.trim() || undefined, style.hint, input.description), effort: "low", signal,
          input: [{ role: "user", content: "Design the cover." }],
        });
        const svg = raw.match(/<svg[\s\S]*<\/svg>/i)?.[0];
        if (!svg || svg.length > 60_000) throw new AiError(502, "no_svg", "");
        send("cover", { index, style: style.id, svg });
      } catch (e) {
        failures++;
        send("cover_failed", { index, message: e instanceof AiError && e.code.startsWith("subscription") ? e.message : "" });
      }
    }));
    send("done", { failures });
  });
}
